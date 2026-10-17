//! newcord's MLS module (#4): OpenMLS with cipher suite 1 (D38), compiled to WebAssembly and
//! loaded only in the desktop app's main process, so keys never reach the interface (D22).

use openmls::prelude::Ciphersuite;
use wasm_bindgen::prelude::*;

/// The cipher suite of every Group: X25519, AES-128-GCM, SHA-256 and Ed25519 (D38).
pub const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

/// The module's version, so the main process can tell which build it loaded.
#[wasm_bindgen(js_name = moduleVersion)]
pub fn module_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// The cipher suite's number in RFC 9420's registry: 1.
#[wasm_bindgen(js_name = ciphersuite)]
pub fn ciphersuite() -> u16 {
    CIPHERSUITE as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[wasm_bindgen_test]
    fn uses_cipher_suite_one() {
        assert_eq!(ciphersuite(), 1);
    }

    #[wasm_bindgen_test]
    fn reports_the_crate_version() {
        assert_eq!(module_version(), env!("CARGO_PKG_VERSION"));
    }
}
