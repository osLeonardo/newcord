use ed25519_dalek::SigningKey;
use openmls::prelude::tls_codec::{DeserializeBytes, Serialize as TlsSerializeTrait};
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_traits::OpenMlsProvider;

use crate::CIPHERSUITE;
use crate::error::{MlsError, MlsResult};
use crate::identity::DeviceIdentity;
use crate::provider::DeviceProvider;
use crate::state::StateBlob;

/// One Device's MLS: its identity rebuilt from its M1 key (D70), and the storage holding its Key
/// packages and Groups, saved and restored as one blob (D39).
#[derive(Default)]
pub struct Device {
    provider: DeviceProvider,
    identity: Option<Identity>,
}

pub(crate) struct Identity {
    pub(crate) name: DeviceIdentity,
    pub(crate) signer: SignatureKeyPair,
    pub(crate) credential: CredentialWithKey,
}

/// What a Key package says, for checks and tests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyPackageFacts {
    pub ciphersuite: u16,
    pub identity: String,
    pub signature_key: Vec<u8>,
    pub last_resort: bool,
    pub lifetime_seconds: u64,
}

impl Device {
    pub fn new() -> Self {
        Self::default()
    }

    /// Rebuilds the Device's signer from its M1 Ed25519 key, the raw 32-byte seed and public key,
    /// with a basic credential naming `<username>:<deviceId>` (D70).
    pub fn init_identity(
        &mut self,
        private_key: &[u8],
        public_key: &[u8],
        username: &str,
        device_id: &str,
    ) -> MlsResult<()> {
        if self.identity.is_some() {
            return Err(MlsError::new("This Device already has an MLS identity"));
        }
        let name = DeviceIdentity::new(username, device_id)?;
        check_key_pair(private_key, public_key)?;
        let signer = SignatureKeyPair::from_raw(
            SignatureScheme::ED25519,
            private_key.to_vec(),
            public_key.to_vec(),
        );
        signer
            .store(self.provider.storage())
            .map_err(|cause| MlsError::from_cause("Storing the signer", cause))?;
        self.identity = Some(identity_of(name, signer));
        Ok(())
    }

    /// Restores everything `save_state` saved, replacing whatever this Device held.
    pub fn load_state(&mut self, blob: &[u8]) -> MlsResult<()> {
        let state = StateBlob::decode(blob)?;
        let identity = match state.identity {
            Some((identity, signer)) => {
                let name = DeviceIdentity::parse(&identity)?;
                let signer = SignatureKeyPair::tls_deserialize_exact_bytes(&signer)
                    .map_err(|cause| MlsError::from_cause("Reading the signer", cause))?;
                Some(identity_of(name, signer))
            }
            None => None,
        };
        let mut values =
            self.provider.storage().values.write().map_err(|_| {
                MlsError::new("The MLS storage is unusable after an earlier failure")
            })?;
        *values = state.storage;
        drop(values);
        self.identity = identity;
        Ok(())
    }

    /// One blob of everything: the identity, the signer and the storage's contents.
    pub fn save_state(&self) -> MlsResult<Vec<u8>> {
        let identity = self.identity()?;
        let signer = identity
            .signer
            .tls_serialize_detached()
            .map_err(|cause| MlsError::from_cause("Saving the signer", cause))?;
        let storage = self
            .provider
            .storage()
            .values
            .read()
            .map_err(|_| MlsError::new("The MLS storage is unusable after an earlier failure"))?
            .clone();
        Ok(StateBlob {
            identity: Some((identity.name.to_text(), signer)),
            storage,
        }
        .encode())
    }

    /// `count` Key packages for cipher suite 1, the last one last-resort when asked (#4's spec).
    pub fn create_key_packages(&self, count: usize, last_resort: bool) -> MlsResult<Vec<Vec<u8>>> {
        let identity = self.identity()?;
        (0..count)
            .map(|index| {
                // A leaf must list every extension its Key package carries, last-resort included.
                let mut builder = KeyPackage::builder().leaf_node_capabilities(Capabilities::new(
                    None,
                    None,
                    Some(&[ExtensionType::LastResort]),
                    None,
                    None,
                ));
                if last_resort && index + 1 == count {
                    builder = builder.mark_as_last_resort();
                }
                let bundle = builder
                    .build(
                        CIPHERSUITE,
                        &self.provider,
                        &identity.signer,
                        identity.credential.clone(),
                    )
                    .map_err(|cause| MlsError::from_cause("Creating a Key package", cause))?;
                bundle
                    .key_package()
                    .tls_serialize_detached()
                    .map_err(|cause| MlsError::from_cause("Encoding a Key package", cause))
            })
            .collect()
    }

    /// The credential identity, once the Device has one.
    pub fn identity_text(&self) -> Option<String> {
        self.identity
            .as_ref()
            .map(|identity| identity.name.to_text())
    }

    /// The signer's public key: the Device's M1 Ed25519 public key.
    pub fn signature_public_key(&self) -> Option<Vec<u8>> {
        self.identity
            .as_ref()
            .map(|identity| identity.signer.to_public_vec())
    }

    pub(crate) fn identity(&self) -> MlsResult<&Identity> {
        self.identity.as_ref().ok_or_else(MlsError::no_identity)
    }

    pub(crate) fn provider(&self) -> &DeviceProvider {
        &self.provider
    }
}

/// Reads and checks a Key package as a receiving Device would.
pub fn describe_key_package(key_package: &[u8]) -> MlsResult<KeyPackageFacts> {
    let key_package = validated_key_package(&DeviceProvider::default(), key_package)?;
    let leaf_node = key_package.leaf_node();
    let credential = BasicCredential::try_from(leaf_node.credential().clone())
        .map_err(|cause| MlsError::from_cause("Reading the Key package's credential", cause))?;
    let lifetime = key_package.life_time();
    Ok(KeyPackageFacts {
        ciphersuite: key_package.ciphersuite() as u16,
        identity: DeviceIdentity::from_bytes(credential.identity())?.to_text(),
        signature_key: leaf_node.signature_key().as_slice().to_vec(),
        last_resort: key_package.last_resort(),
        lifetime_seconds: lifetime.not_after().saturating_sub(lifetime.not_before()),
    })
}

pub(crate) fn validated_key_package(
    provider: &impl OpenMlsProvider,
    key_package: &[u8],
) -> MlsResult<KeyPackage> {
    KeyPackageIn::tls_deserialize_exact_bytes(key_package)
        .map_err(|cause| MlsError::from_cause("Reading a Key package", cause))?
        .validate(provider.crypto(), ProtocolVersion::Mls10)
        .map_err(|cause| MlsError::from_cause("Checking a Key package", cause))
}

fn identity_of(name: DeviceIdentity, signer: SignatureKeyPair) -> Identity {
    let credential = CredentialWithKey {
        credential: BasicCredential::new(name.to_text().into_bytes()).into(),
        signature_key: signer.to_public_vec().into(),
    };
    Identity {
        name,
        signer,
        credential,
    }
}

/// The public key must be the one the private seed gives, or signatures would not verify.
fn check_key_pair(private_key: &[u8], public_key: &[u8]) -> MlsResult<()> {
    let seed: [u8; 32] = private_key
        .try_into()
        .map_err(|_| MlsError::new("The Ed25519 private key must be its raw 32-byte seed"))?;
    if public_key.len() != 32 {
        return Err(MlsError::new("The Ed25519 public key must be 32 raw bytes"));
    }
    if SigningKey::from_bytes(&seed).verifying_key().as_bytes() != public_key {
        return Err(MlsError::new(
            "The Ed25519 public key does not belong to the private key",
        ));
    }
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    pub(crate) const ALICE_DEVICE: &str = "mJMEbgts33NWbvGmNqkuEw";

    /// A Device with a fixed key, as the desktop app's M1 key would give it.
    pub(crate) fn device(username: &str, seed_byte: u8, device_id: &str) -> Device {
        let seed = [seed_byte; 32];
        let public = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        let mut device = Device::new();
        device
            .init_identity(&seed, &public, username, device_id)
            .unwrap();
        device
    }

    #[wasm_bindgen_test]
    fn signs_with_the_m1_key() {
        let seed = [7; 32];
        let public = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        let mut alice = Device::new();

        alice
            .init_identity(&seed, &public, "alice", ALICE_DEVICE)
            .unwrap();

        assert_eq!(alice.signature_public_key().unwrap(), public.to_vec());
        assert_eq!(
            alice.identity_text().unwrap(),
            format!("alice:{ALICE_DEVICE}")
        );
    }

    #[wasm_bindgen_test]
    fn refuses_a_public_key_of_another_private_key_or_the_wrong_length() {
        let other = SigningKey::from_bytes(&[8; 32]).verifying_key().to_bytes();

        assert!(
            Device::new()
                .init_identity(&[7; 32], &other, "alice", ALICE_DEVICE)
                .is_err()
        );
        assert!(
            Device::new()
                .init_identity(&[7; 64], &other, "alice", ALICE_DEVICE)
                .is_err()
        );
        assert!(
            Device::new()
                .init_identity(&[7; 32], &[1; 31], "alice", ALICE_DEVICE)
                .is_err()
        );
    }

    #[wasm_bindgen_test]
    fn refuses_a_malformed_identity() {
        let public = SigningKey::from_bytes(&[7; 32]).verifying_key().to_bytes();

        assert!(
            Device::new()
                .init_identity(&[7; 32], &public, "Alice", ALICE_DEVICE)
                .is_err()
        );
        assert!(
            Device::new()
                .init_identity(&[7; 32], &public, "alice", "x:y")
                .is_err()
        );
    }

    #[wasm_bindgen_test]
    fn creates_key_packages_for_cipher_suite_one_with_the_last_one_last_resort() {
        let alice = device("alice", 7, ALICE_DEVICE);

        let packages = alice.create_key_packages(3, true).unwrap();
        let facts: Vec<_> = packages
            .iter()
            .map(|package| describe_key_package(package).unwrap())
            .collect();

        assert_eq!(facts.len(), 3);
        for fact in &facts {
            assert_eq!(fact.ciphersuite, 1);
            assert_eq!(fact.identity, format!("alice:{ALICE_DEVICE}"));
            assert_eq!(fact.signature_key, alice.signature_public_key().unwrap());
        }
        assert_eq!(
            facts
                .iter()
                .map(|fact| fact.last_resort)
                .collect::<Vec<_>>(),
            [false, false, true]
        );
        assert!(
            !alice
                .create_key_packages(2, false)
                .unwrap()
                .iter()
                .any(|package| { describe_key_package(package).unwrap().last_resort })
        );
    }

    #[wasm_bindgen_test]
    fn key_packages_live_longer_than_the_30_days_a_device_may_wait() {
        let alice = device("alice", 7, ALICE_DEVICE);

        let facts = describe_key_package(&alice.create_key_packages(1, false).unwrap()[0]).unwrap();

        // OpenMLS's default: 84 days, plus an hour's margin before now.
        assert!(facts.lifetime_seconds >= 30 * 24 * 60 * 60);
        assert_eq!(facts.lifetime_seconds, 84 * 24 * 60 * 60 + 60 * 60);
    }

    #[wasm_bindgen_test]
    fn a_restored_device_keeps_its_credential_and_signer() {
        let alice = device("alice", 7, ALICE_DEVICE);
        let blob = alice.save_state().unwrap();

        let mut restored = Device::new();
        restored.load_state(&blob).unwrap();
        assert_eq!(restored.save_state().unwrap(), blob);

        let facts =
            describe_key_package(&restored.create_key_packages(1, false).unwrap()[0]).unwrap();
        assert_eq!(facts.identity, format!("alice:{ALICE_DEVICE}"));
        assert_eq!(facts.signature_key, alice.signature_public_key().unwrap());
    }

    #[wasm_bindgen_test]
    fn says_clearly_when_there_is_no_identity_yet() {
        let fresh = Device::new();

        assert_eq!(
            fresh.create_key_packages(1, false).unwrap_err(),
            MlsError::no_identity()
        );
        assert_eq!(fresh.save_state().unwrap_err(), MlsError::no_identity());
    }

    #[wasm_bindgen_test]
    fn refuses_a_second_identity() {
        let mut alice = device("alice", 7, ALICE_DEVICE);
        let public = SigningKey::from_bytes(&[8; 32]).verifying_key().to_bytes();

        assert!(
            alice
                .init_identity(&[8; 32], &public, "bob_x", ALICE_DEVICE)
                .is_err()
        );
    }
}
