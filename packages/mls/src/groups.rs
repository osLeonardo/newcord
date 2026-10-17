use openmls::prelude::tls_codec::{DeserializeBytes, Serialize as TlsSerializeTrait};
use openmls::prelude::*;

use crate::CIPHERSUITE;
use crate::device::{Device, validated_key_package};
use crate::error::{MlsError, MlsResult};

/// Group IDs are 16 random bytes, made by the caller (09-m2-build Settings).
pub const GROUP_ID_BYTES: usize = 16;

/// A commit this Device made, waiting for the server to accept it before it is merged.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnCommit {
    pub commit: Vec<u8>,
    /// Present when the commit adds Devices: it lets them join, ratchet tree included.
    pub welcome: Option<Vec<u8>>,
}

/// What an MLS message from another Device turned out to be.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Incoming {
    Message {
        group_id: Vec<u8>,
        sender: String,
        plaintext: Vec<u8>,
    },
    /// Already applied: the identities it really added and removed, whatever was declared (D41).
    Commit {
        group_id: Vec<u8>,
        sender: String,
        added: Vec<String>,
        removed: Vec<String>,
        epoch: u64,
    },
    /// Kept until a commit completes it; the identities it asks to remove (D57).
    Proposal {
        group_id: Vec<u8>,
        sender: String,
        removes: Vec<String>,
    },
}

/// A Member's credential identity and the Ed25519 key it signs with (D45, D70).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemberKey {
    pub identity: String,
    pub signature_key: Vec<u8>,
}

impl Device {
    /// Starts a Group with this Device as its only Member.
    pub fn create_group(&self, group_id: &[u8]) -> MlsResult<()> {
        let identity = self.identity()?;
        let group_id = checked_group_id(group_id)?;
        if self.load_group(&group_id).is_ok() {
            return Err(MlsError::new(
                "This Device already has a Group with that ID",
            ));
        }
        MlsGroup::new_with_group_id(
            self.provider(),
            &identity.signer,
            &create_config(),
            group_id,
            identity.credential.clone(),
        )
        .map_err(|cause| MlsError::from_cause("Creating the Group", cause))?;
        Ok(())
    }

    /// One commit adding a Device for each Key package, with the welcome that lets them join.
    pub fn add_members(&self, group_id: &[u8], key_packages: &[Vec<u8>]) -> MlsResult<OwnCommit> {
        let identity = self.identity()?;
        let key_packages = self.key_packages(key_packages)?;
        let mut group = self.load_group(&GroupId::from_slice(group_id))?;
        let (commit, welcome, _) = group
            .add_members(self.provider(), &identity.signer, &key_packages)
            .map_err(|cause| MlsError::from_cause("Adding Members", cause))?;
        Ok(OwnCommit {
            commit: encoded(&commit)?,
            welcome: Some(encoded(&welcome)?),
        })
    }

    /// Joins from a welcome alone, since it carries the ratchet tree; returns the Group's ID.
    pub fn join_from_welcome(&self, welcome: &[u8]) -> MlsResult<Vec<u8>> {
        self.identity()?;
        let welcome = match MlsMessageIn::tls_deserialize_exact_bytes(welcome)
            .map_err(|cause| MlsError::from_cause("Reading the welcome", cause))?
            .extract()
        {
            MlsMessageBodyIn::Welcome(welcome) => welcome,
            _ => return Err(MlsError::new("This message is not a welcome")),
        };
        let group = StagedWelcome::new_from_welcome(self.provider(), &join_config(), welcome, None)
            .and_then(|staged| staged.into_group(self.provider()))
            .map_err(|cause| MlsError::from_cause("Joining from the welcome", cause))?;
        Ok(group.group_id().as_slice().to_vec())
    }

    /// An encrypted MLS message for the Group's current Members.
    pub fn encrypt(&self, group_id: &[u8], plaintext: &[u8]) -> MlsResult<Vec<u8>> {
        let identity = self.identity()?;
        let mut group = self.load_group(&GroupId::from_slice(group_id))?;
        let message = group
            .create_message(self.provider(), &identity.signer, plaintext)
            .map_err(|cause| MlsError::from_cause("Encrypting the message", cause))?;
        encoded(&message)
    }

    /// Decrypts a message, applies a commit, or keeps a proposal, from another Device.
    pub fn process_incoming(&self, message: &[u8]) -> MlsResult<Incoming> {
        self.identity()?;
        let protocol_message = MlsMessageIn::tls_deserialize_exact_bytes(message)
            .map_err(|cause| MlsError::from_cause("Reading the MLS message", cause))?
            .try_into_protocol_message()
            .map_err(|cause| MlsError::from_cause("Reading the MLS message", cause))?;
        let mut group = self.load_group(protocol_message.group_id())?;
        let processed = group
            .process_message(self.provider(), protocol_message)
            .map_err(|cause| MlsError::from_cause("Processing the MLS message", cause))?;
        let group_id = group.group_id().as_slice().to_vec();
        let sender = identity_text(processed.credential());
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(message) => Ok(Incoming::Message {
                group_id,
                sender,
                plaintext: message.into_bytes(),
            }),
            ProcessedMessageContent::ProposalMessage(proposal) => {
                let removes = removed_by_proposal(&group, proposal.proposal());
                group
                    .store_pending_proposal(self.provider().storage(), *proposal)
                    .map_err(|cause| MlsError::from_cause("Keeping the proposal", cause))?;
                Ok(Incoming::Proposal {
                    group_id,
                    sender,
                    removes,
                })
            }
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                let (added, removed) = changes_of(&group, &staged);
                group
                    .merge_staged_commit(self.provider(), *staged)
                    .map_err(|cause| MlsError::from_cause("Applying the commit", cause))?;
                Ok(Incoming::Commit {
                    group_id,
                    sender,
                    added,
                    removed,
                    epoch: group.epoch().as_u64(),
                })
            }
            _ => Err(MlsError::new(
                "Joining from outside the Group is not supported",
            )),
        }
    }

    /// Finalises this Device's own commit once the server accepted it.
    pub fn merge_pending_commit(&self, group_id: &[u8]) -> MlsResult<()> {
        let mut group = self.load_group(&GroupId::from_slice(group_id))?;
        group
            .merge_pending_commit(self.provider())
            .map_err(|cause| MlsError::from_cause("Merging the commit", cause))
    }

    /// Drops this Device's own commit, as when another Member's commit won the epoch.
    pub fn clear_pending_commit(&self, group_id: &[u8]) -> MlsResult<()> {
        let mut group = self.load_group(&GroupId::from_slice(group_id))?;
        group
            .clear_pending_commit(self.provider().storage())
            .map_err(|cause| MlsError::from_cause("Dropping the commit", cause))
    }

    /// The epoch each `mls.commit` declares it builds on (D90).
    pub fn group_epoch(&self, group_id: &[u8]) -> MlsResult<u64> {
        Ok(self
            .load_group(&GroupId::from_slice(group_id))?
            .epoch()
            .as_u64())
    }

    /// Every Member's credential identity, read from the MLS state (D70, D90).
    pub fn group_members(&self, group_id: &[u8]) -> MlsResult<Vec<String>> {
        Ok(self
            .group_member_keys(group_id)?
            .into_iter()
            .map(|member| member.identity)
            .collect())
    }

    /// Every Member's identity and signature key, for Safety numbers (D45, D90).
    pub fn group_member_keys(&self, group_id: &[u8]) -> MlsResult<Vec<MemberKey>> {
        let group = self.load_group(&GroupId::from_slice(group_id))?;
        Ok(group
            .members()
            .map(|member| MemberKey {
                identity: identity_text(&member.credential),
                signature_key: member.signature_key,
            })
            .collect())
    }

    pub(crate) fn load_group(&self, group_id: &GroupId) -> MlsResult<MlsGroup> {
        MlsGroup::load(self.provider().storage(), group_id)
            .map_err(|cause| MlsError::from_cause("Reading the Group", cause))?
            .ok_or_else(|| MlsError::new("This Device is not in that Group"))
    }

    pub(crate) fn key_packages(&self, key_packages: &[Vec<u8>]) -> MlsResult<Vec<KeyPackage>> {
        if key_packages.is_empty() {
            return Err(MlsError::new("No Key package was given"));
        }
        key_packages
            .iter()
            .map(|key_package| validated_key_package(self.provider(), key_package))
            .collect()
    }
}

/// Every Group keeps the ratchet tree in its welcomes, encrypts every message, commits included,
/// and keeps one past epoch readable for messages sent just before a commit (#4's spec, D90).
fn create_config() -> MlsGroupCreateConfig {
    MlsGroupCreateConfig::builder()
        .ciphersuite(CIPHERSUITE)
        .use_ratchet_tree_extension(true)
        .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
        .max_past_epochs(1)
        .build()
}

fn join_config() -> MlsGroupJoinConfig {
    MlsGroupJoinConfig::builder()
        .use_ratchet_tree_extension(true)
        .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
        .max_past_epochs(1)
        .build()
}

fn checked_group_id(group_id: &[u8]) -> MlsResult<GroupId> {
    if group_id.len() != GROUP_ID_BYTES {
        return Err(MlsError::new(format!(
            "A Group ID must be {GROUP_ID_BYTES} bytes"
        )));
    }
    Ok(GroupId::from_slice(group_id))
}

pub(crate) fn encoded(message: &MlsMessageOut) -> MlsResult<Vec<u8>> {
    message
        .tls_serialize_detached()
        .map_err(|cause| MlsError::from_cause("Encoding the MLS message", cause))
}

/// The credential's identity as text; a malformed one is passed on, so the app's commit checks
/// can name it (D71) instead of the whole message failing.
pub(crate) fn identity_text(credential: &Credential) -> String {
    match BasicCredential::try_from(credential.clone()) {
        Ok(basic) => String::from_utf8_lossy(basic.identity()).into_owned(),
        Err(_) => String::from("<not a basic credential>"),
    }
}

fn member_identity(group: &MlsGroup, index: LeafNodeIndex) -> String {
    group
        .member_at(index)
        .map(|member| identity_text(&member.credential))
        .unwrap_or_else(|| String::from("<unknown member>"))
}

fn removed_by_proposal(group: &MlsGroup, proposal: &Proposal) -> Vec<String> {
    match proposal {
        Proposal::Remove(remove) => vec![member_identity(group, remove.removed())],
        _ => Vec::new(),
    }
}

/// Read before merging, while the removed Members are still in the tree.
fn changes_of(group: &MlsGroup, staged: &StagedCommit) -> (Vec<String>, Vec<String>) {
    let added = staged
        .add_proposals()
        .map(|add| identity_text(add.add_proposal().key_package().leaf_node().credential()))
        .collect();
    let removed = staged
        .remove_proposals()
        .map(|remove| member_identity(group, remove.remove_proposal().removed()))
        .collect();
    (added, removed)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::device::tests::device;
    use wasm_bindgen_test::wasm_bindgen_test;

    pub(crate) const GROUP: [u8; GROUP_ID_BYTES] = [1; GROUP_ID_BYTES];
    pub(crate) const ALICE: &str = "alice:AAAAAAAAAAAAAAAAAAAAAA";
    pub(crate) const BRUNO: &str = "bruno:BBBBBBBBBBBBBBBBBBBBBB";
    pub(crate) const CARLA: &str = "carla:CCCCCCCCCCCCCCCCCCCCCC";

    pub(crate) fn alice() -> Device {
        device("alice", 1, "AAAAAAAAAAAAAAAAAAAAAA")
    }
    pub(crate) fn bruno() -> Device {
        device("bruno", 2, "BBBBBBBBBBBBBBBBBBBBBB")
    }
    pub(crate) fn carla() -> Device {
        device("carla", 3, "CCCCCCCCCCCCCCCCCCCCCC")
    }
    pub(crate) fn diego() -> Device {
        device("diego", 4, "DDDDDDDDDDDDDDDDDDDDDD")
    }

    pub(crate) fn key_package_of(device: &Device) -> Vec<u8> {
        device.create_key_packages(1, false).unwrap().remove(0)
    }

    /// The creator starts the Group and adds the others, who join from the welcome alone.
    pub(crate) fn group_of(creator: &Device, others: &[&Device]) {
        creator.create_group(&GROUP).unwrap();
        let packages: Vec<_> = others.iter().map(|other| key_package_of(other)).collect();
        let own = creator.add_members(&GROUP, &packages).unwrap();
        creator.merge_pending_commit(&GROUP).unwrap();
        let welcome = own.welcome.unwrap();
        for other in others {
            assert_eq!(other.join_from_welcome(&welcome).unwrap(), GROUP.to_vec());
        }
    }

    pub(crate) fn read(device: &Device, message: &[u8]) -> (String, Vec<u8>) {
        match device.process_incoming(message).unwrap() {
            Incoming::Message {
                sender, plaintext, ..
            } => (sender, plaintext),
            other => panic!("expected a message, got {other:?}"),
        }
    }

    fn is_encrypted(message: &[u8]) -> bool {
        matches!(
            MlsMessageIn::tls_deserialize_exact_bytes(message)
                .unwrap()
                .try_into_protocol_message()
                .unwrap(),
            ProtocolMessage::PrivateMessage(_)
        )
    }

    #[wasm_bindgen_test]
    fn two_devices_talk_both_ways_after_a_join_from_the_welcome_alone() {
        let (alice, bruno) = (alice(), bruno());
        group_of(&alice, &[&bruno]);

        let hello = alice.encrypt(&GROUP, b"hello bruno").unwrap();
        let reply = bruno.encrypt(&GROUP, b"hi alice").unwrap();

        assert_eq!(
            read(&bruno, &hello),
            (ALICE.to_owned(), b"hello bruno".to_vec())
        );
        assert_eq!(
            read(&alice, &reply),
            (BRUNO.to_owned(), b"hi alice".to_vec())
        );
    }

    #[wasm_bindgen_test]
    fn a_device_added_later_reads_only_what_was_sent_after_it_joined() {
        let (alice, bruno, carla) = (alice(), bruno(), carla());
        group_of(&alice, &[&bruno]);
        let before = alice.encrypt(&GROUP, b"before carla").unwrap();

        let own = alice
            .add_members(&GROUP, &[key_package_of(&carla)])
            .unwrap();
        alice.merge_pending_commit(&GROUP).unwrap();
        let applied = bruno.process_incoming(&own.commit).unwrap();
        carla.join_from_welcome(&own.welcome.unwrap()).unwrap();
        let after = alice.encrypt(&GROUP, b"after carla").unwrap();

        assert_eq!(
            applied,
            Incoming::Commit {
                group_id: GROUP.to_vec(),
                sender: ALICE.to_owned(),
                added: vec![CARLA.to_owned()],
                removed: vec![],
                epoch: 2,
            }
        );
        assert_eq!(read(&carla, &after).1, b"after carla".to_vec());
        assert_eq!(read(&bruno, &after).1, b"after carla".to_vec());
        assert!(carla.process_incoming(&before).is_err());
    }

    #[wasm_bindgen_test]
    fn commits_and_messages_travel_encrypted() {
        let (alice, bruno, carla) = (alice(), bruno(), carla());
        group_of(&alice, &[&bruno]);

        let own = alice
            .add_members(&GROUP, &[key_package_of(&carla)])
            .unwrap();
        let message = bruno.encrypt(&GROUP, b"secret").unwrap();

        assert!(is_encrypted(&own.commit));
        assert!(is_encrypted(&message));
    }

    #[wasm_bindgen_test]
    fn merging_an_accepted_commit_moves_to_the_next_epoch() {
        let (alice, bruno) = (alice(), bruno());
        alice.create_group(&GROUP).unwrap();
        assert_eq!(alice.group_epoch(&GROUP).unwrap(), 0);

        alice
            .add_members(&GROUP, &[key_package_of(&bruno)])
            .unwrap();
        assert_eq!(alice.group_epoch(&GROUP).unwrap(), 0);
        alice.merge_pending_commit(&GROUP).unwrap();

        assert_eq!(alice.group_epoch(&GROUP).unwrap(), 1);
    }

    #[wasm_bindgen_test]
    fn the_loser_of_a_race_drops_its_commit_and_applies_the_winners() {
        let (alice, bruno, carla, diego) = (alice(), bruno(), carla(), diego());
        group_of(&alice, &[&bruno]);

        let winner = alice
            .add_members(&GROUP, &[key_package_of(&carla)])
            .unwrap();
        bruno
            .add_members(&GROUP, &[key_package_of(&diego)])
            .unwrap();
        // The server accepts the first commit for the epoch and refuses the other.
        alice.merge_pending_commit(&GROUP).unwrap();
        bruno.clear_pending_commit(&GROUP).unwrap();
        bruno.process_incoming(&winner.commit).unwrap();
        carla.join_from_welcome(&winner.welcome.unwrap()).unwrap();

        assert_eq!(alice.group_epoch(&GROUP).unwrap(), 2);
        assert_eq!(bruno.group_epoch(&GROUP).unwrap(), 2);
        let message = bruno.encrypt(&GROUP, b"still in step").unwrap();
        assert_eq!(read(&alice, &message).1, b"still in step".to_vec());
        assert_eq!(read(&carla, &message).1, b"still in step".to_vec());
    }

    #[wasm_bindgen_test]
    fn a_state_saved_mid_conversation_keeps_decrypting_new_messages() {
        let (alice, bruno) = (alice(), bruno());
        group_of(&alice, &[&bruno]);
        read(&bruno, &alice.encrypt(&GROUP, b"first").unwrap());
        let blob = bruno.save_state().unwrap();

        let mut restored = Device::new();
        restored.load_state(&blob).unwrap();
        let later = alice.encrypt(&GROUP, b"second").unwrap();

        assert_eq!(read(&restored, &later).1, b"second".to_vec());
    }

    #[wasm_bindgen_test]
    fn lists_members_with_their_identities_and_signature_keys() {
        let (alice, bruno) = (alice(), bruno());
        group_of(&alice, &[&bruno]);

        let mut members = bruno.group_members(&GROUP).unwrap();
        members.sort();
        let keys = alice.group_member_keys(&GROUP).unwrap();

        assert_eq!(members, [ALICE, BRUNO]);
        let alice_key = keys.iter().find(|member| member.identity == ALICE).unwrap();
        assert_eq!(
            alice_key.signature_key,
            alice.signature_public_key().unwrap()
        );
    }

    #[wasm_bindgen_test]
    fn refuses_unknown_groups_and_malformed_ids() {
        let alice = alice();

        assert!(alice.encrypt(&GROUP, b"x").is_err());
        assert!(alice.create_group(&[1; 15]).is_err());
        alice.create_group(&GROUP).unwrap();
        assert!(alice.create_group(&GROUP).is_err());
    }
}
