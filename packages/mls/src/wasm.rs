//! The module's JavaScript surface: every error becomes an exception, so a bad input never aborts
//! the WebAssembly instance (#4's spec).

use js_sys::{Array, Object, Reflect, Uint8Array};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

use crate::device::{Device, describe_key_package};
use crate::groups::{Incoming, MemberKey, OwnCommit};

// `MlsError` is a `std::error::Error`, which `JsError` turns into a JavaScript exception.

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TYPES: &'static str = r#"
/** What a Key package says, as a receiving Device reads it. */
export interface KeyPackageFacts {
  readonly ciphersuite: number;
  readonly identity: string;
  readonly signatureKey: Uint8Array;
  readonly lastResort: boolean;
  readonly lifetimeSeconds: number;
}

/** A commit this Device made, waiting for the server to accept it before it is merged. */
export interface OwnCommit {
  readonly commit: Uint8Array;
  /** Present when the commit adds Devices: it lets them join. */
  readonly welcome?: Uint8Array;
}

/** What an MLS message from another Device turned out to be. */
export type IncomingMls =
  | {
      readonly kind: "message";
      readonly groupId: Uint8Array;
      readonly sender: string;
      readonly plaintext: Uint8Array;
    }
  | {
      readonly kind: "commit";
      readonly groupId: Uint8Array;
      readonly sender: string;
      readonly added: readonly string[];
      readonly removed: readonly string[];
      readonly epoch: number;
    }
  | {
      readonly kind: "proposal";
      readonly groupId: Uint8Array;
      readonly sender: string;
      readonly removes: readonly string[];
    };

/** A Member's credential identity and the Ed25519 key it signs with. */
export interface MemberKey {
  readonly identity: string;
  readonly signatureKey: Uint8Array;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Uint8Array[]")]
    pub type ByteArrays;
    #[wasm_bindgen(typescript_type = "KeyPackageFacts")]
    pub type KeyPackageFactsObject;
    #[wasm_bindgen(typescript_type = "readonly Uint8Array[]")]
    pub type ByteArraysInput;
    #[wasm_bindgen(typescript_type = "readonly string[]")]
    pub type StringsInput;
    #[wasm_bindgen(typescript_type = "OwnCommit")]
    pub type OwnCommitObject;
    #[wasm_bindgen(typescript_type = "IncomingMls")]
    pub type IncomingObject;
    #[wasm_bindgen(typescript_type = "string[]")]
    pub type Strings;
    #[wasm_bindgen(typescript_type = "MemberKey[]")]
    pub type MemberKeys;
}

/// One Device's MLS, as the desktop app's main process uses it. Each instance is independent.
#[wasm_bindgen]
pub struct MlsDevice {
    device: Device,
}

#[wasm_bindgen]
impl MlsDevice {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MlsDevice {
        MlsDevice {
            device: Device::new(),
        }
    }

    #[wasm_bindgen(js_name = initIdentity)]
    pub fn init_identity(
        &mut self,
        private_key: &[u8],
        public_key: &[u8],
        username: &str,
        device_id: &str,
    ) -> Result<(), JsError> {
        Ok(self
            .device
            .init_identity(private_key, public_key, username, device_id)?)
    }

    #[wasm_bindgen(js_name = loadState)]
    pub fn load_state(&mut self, state: &[u8]) -> Result<(), JsError> {
        Ok(self.device.load_state(state)?)
    }

    #[wasm_bindgen(js_name = saveState)]
    pub fn save_state(&self) -> Result<Vec<u8>, JsError> {
        Ok(self.device.save_state()?)
    }

    /// `count` Key packages for cipher suite 1, the last one last-resort when asked.
    #[wasm_bindgen(js_name = createKeyPackages)]
    pub fn create_key_packages(
        &self,
        count: u32,
        last_resort: bool,
    ) -> Result<ByteArrays, JsError> {
        let packages = self
            .device
            .create_key_packages(count as usize, last_resort)?;
        Ok(byte_arrays(&packages))
    }

    /// The credential identity, `<username>:<deviceId>`, once there is one.
    #[wasm_bindgen(js_name = identity)]
    pub fn identity(&self) -> Option<String> {
        self.device.identity_text()
    }

    #[wasm_bindgen(js_name = signaturePublicKey)]
    pub fn signature_public_key(&self) -> Option<Vec<u8>> {
        self.device.signature_public_key()
    }

    /// Starts a Group with this Device as its only Member, under the caller's 16-byte ID.
    #[wasm_bindgen(js_name = createGroup)]
    pub fn create_group(&self, group_id: &[u8]) -> Result<(), JsError> {
        Ok(self.device.create_group(group_id)?)
    }

    #[wasm_bindgen(js_name = addMembers)]
    pub fn add_members(
        &self,
        group_id: &[u8],
        key_packages: &ByteArraysInput,
    ) -> Result<OwnCommitObject, JsError> {
        let key_packages = byte_arrays_from(key_packages)?;
        own_commit(&self.device.add_members(group_id, &key_packages)?)
    }

    /// Joins from a welcome and returns the Group's ID.
    #[wasm_bindgen(js_name = joinFromWelcome)]
    pub fn join_from_welcome(&self, welcome: &[u8]) -> Result<Vec<u8>, JsError> {
        Ok(self.device.join_from_welcome(welcome)?)
    }

    pub fn encrypt(&self, group_id: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
        Ok(self.device.encrypt(group_id, plaintext)?)
    }

    #[wasm_bindgen(js_name = processIncoming)]
    pub fn process_incoming(&self, message: &[u8]) -> Result<IncomingObject, JsError> {
        incoming(&self.device.process_incoming(message)?)
    }

    #[wasm_bindgen(js_name = mergePendingCommit)]
    pub fn merge_pending_commit(&self, group_id: &[u8]) -> Result<(), JsError> {
        Ok(self.device.merge_pending_commit(group_id)?)
    }

    #[wasm_bindgen(js_name = clearPendingCommit)]
    pub fn clear_pending_commit(&self, group_id: &[u8]) -> Result<(), JsError> {
        Ok(self.device.clear_pending_commit(group_id)?)
    }

    /// The epoch, as a number: epochs never come near 2^53.
    #[wasm_bindgen(js_name = groupEpoch)]
    pub fn group_epoch(&self, group_id: &[u8]) -> Result<f64, JsError> {
        Ok(self.device.group_epoch(group_id)? as f64)
    }

    #[wasm_bindgen(js_name = groupMembers)]
    pub fn group_members(&self, group_id: &[u8]) -> Result<Strings, JsError> {
        Ok(strings(&self.device.group_members(group_id)?).unchecked_into())
    }

    #[wasm_bindgen(js_name = groupMemberKeys)]
    pub fn group_member_keys(&self, group_id: &[u8]) -> Result<MemberKeys, JsError> {
        let keys = self.device.group_member_keys(group_id)?;
        let list = Array::new();
        for key in &keys {
            list.push(&member_key(key)?.into());
        }
        Ok(list.unchecked_into())
    }
}

impl Default for MlsDevice {
    fn default() -> Self {
        Self::new()
    }
}

/// What a Key package says: `{ ciphersuite, identity, signatureKey, lastResort, lifetimeSeconds }`.
#[wasm_bindgen(js_name = describeKeyPackage)]
pub fn describe_key_package_js(key_package: &[u8]) -> Result<KeyPackageFactsObject, JsError> {
    let facts = describe_key_package(key_package)?;
    let object = Object::new();
    set(&object, "ciphersuite", JsValue::from(facts.ciphersuite))?;
    set(&object, "identity", JsValue::from(facts.identity))?;
    set(&object, "signatureKey", bytes(&facts.signature_key).into())?;
    set(&object, "lastResort", JsValue::from(facts.last_resort))?;
    set(
        &object,
        "lifetimeSeconds",
        JsValue::from(facts.lifetime_seconds as f64),
    )?;
    Ok(object.unchecked_into())
}

pub(crate) fn byte_arrays(values: &[Vec<u8>]) -> ByteArrays {
    values
        .iter()
        .map(|value| bytes(value))
        .collect::<Array>()
        .unchecked_into()
}

pub(crate) fn bytes(value: &[u8]) -> Uint8Array {
    Uint8Array::from(value)
}

pub(crate) fn set(object: &Object, key: &str, value: JsValue) -> Result<(), JsError> {
    Reflect::set(object, &JsValue::from_str(key), &value)
        .map(|_| ())
        .map_err(|_| JsError::new("Setting a result field failed"))
}

pub(crate) fn strings(values: &[String]) -> Array {
    values
        .iter()
        .map(|value| JsValue::from_str(value))
        .collect()
}

/// Reads an array of Uint8Array from JavaScript, refusing anything else.
pub(crate) fn byte_arrays_from(value: &JsValue) -> Result<Vec<Vec<u8>>, JsError> {
    if !Array::is_array(value) {
        return Err(JsError::new("Expected an array of Uint8Array"));
    }
    Array::from(value)
        .iter()
        .map(|item| {
            item.dyn_into::<Uint8Array>()
                .map(|bytes| bytes.to_vec())
                .map_err(|_| JsError::new("Expected an array of Uint8Array"))
        })
        .collect()
}

pub(crate) fn own_commit(own: &OwnCommit) -> Result<OwnCommitObject, JsError> {
    let object = Object::new();
    set(&object, "commit", bytes(&own.commit).into())?;
    if let Some(welcome) = &own.welcome {
        set(&object, "welcome", bytes(welcome).into())?;
    }
    Ok(object.unchecked_into())
}

fn incoming(incoming: &Incoming) -> Result<IncomingObject, JsError> {
    let object = Object::new();
    match incoming {
        Incoming::Message {
            group_id,
            sender,
            plaintext,
        } => {
            set(&object, "kind", JsValue::from_str("message"))?;
            set(&object, "groupId", bytes(group_id).into())?;
            set(&object, "sender", JsValue::from_str(sender))?;
            set(&object, "plaintext", bytes(plaintext).into())?;
        }
        Incoming::Commit {
            group_id,
            sender,
            added,
            removed,
            epoch,
        } => {
            set(&object, "kind", JsValue::from_str("commit"))?;
            set(&object, "groupId", bytes(group_id).into())?;
            set(&object, "sender", JsValue::from_str(sender))?;
            set(&object, "added", strings(added).into())?;
            set(&object, "removed", strings(removed).into())?;
            set(&object, "epoch", JsValue::from(*epoch as f64))?;
        }
        Incoming::Proposal {
            group_id,
            sender,
            removes,
        } => {
            set(&object, "kind", JsValue::from_str("proposal"))?;
            set(&object, "groupId", bytes(group_id).into())?;
            set(&object, "sender", JsValue::from_str(sender))?;
            set(&object, "removes", strings(removes).into())?;
        }
    }
    Ok(object.unchecked_into())
}

fn member_key(key: &MemberKey) -> Result<Object, JsError> {
    let object = Object::new();
    set(&object, "identity", JsValue::from_str(&key.identity))?;
    set(&object, "signatureKey", bytes(&key.signature_key).into())?;
    Ok(object)
}
