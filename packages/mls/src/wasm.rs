//! The module's JavaScript surface: every error becomes an exception, so a bad input never aborts
//! the WebAssembly instance (#4's spec).

use js_sys::{Array, Object, Reflect, Uint8Array};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

use crate::device::{Device, describe_key_package};

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
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "Uint8Array[]")]
    pub type ByteArrays;
    #[wasm_bindgen(typescript_type = "KeyPackageFacts")]
    pub type KeyPackageFactsObject;
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
