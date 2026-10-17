use crate::error::{MlsError, MlsResult};

/// The Account and Device an MLS credential names (D70): `<username>:<deviceId>` in UTF-8.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceIdentity {
    username: String,
    device_id: String,
}

impl DeviceIdentity {
    /// Checks both parts as the server does: a username of 3 to 32 lowercase letters, digits or
    /// underscores, and a Device ID of 22 base64url characters, so neither can hold a ":".
    pub fn new(username: &str, device_id: &str) -> MlsResult<Self> {
        if !is_username(username) {
            return Err(MlsError::new(format!(
                "\"{username}\" is not a username: it needs 3 to 32 lowercase letters, digits or underscores"
            )));
        }
        if !is_device_id(device_id) {
            return Err(MlsError::new(format!(
                "\"{device_id}\" is not a Device ID: it needs 22 base64url characters"
            )));
        }
        Ok(Self {
            username: username.to_owned(),
            device_id: device_id.to_owned(),
        })
    }

    /// Reads a credential identity, refusing anything without exactly one ":" or with an invalid
    /// part, so a malformed credential is never trusted.
    pub fn parse(identity: &str) -> MlsResult<Self> {
        let mut parts = identity.split(':');
        match (parts.next(), parts.next(), parts.next()) {
            (Some(username), Some(device_id), None) => Self::new(username, device_id),
            _ => Err(MlsError::new(format!(
                "\"{identity}\" is not a credential identity: it needs exactly one \":\""
            ))),
        }
    }

    pub fn from_bytes(identity: &[u8]) -> MlsResult<Self> {
        let text = std::str::from_utf8(identity)
            .map_err(|_| MlsError::new("A credential identity is not UTF-8"))?;
        Self::parse(text)
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn to_text(&self) -> String {
        format!("{}:{}", self.username, self.device_id)
    }
}

fn is_username(username: &str) -> bool {
    (3..=32).contains(&username.len())
        && username
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn is_device_id(device_id: &str) -> bool {
    device_id.len() == 22
        && device_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    const DEVICE: &str = "mJMEbgts33NWbvGmNqkuEw";

    #[wasm_bindgen_test]
    fn writes_username_colon_device_id() {
        let identity = DeviceIdentity::new("alice_01", DEVICE).unwrap();

        assert_eq!(identity.to_text(), format!("alice_01:{DEVICE}"));
        assert_eq!(
            DeviceIdentity::parse(&identity.to_text()).unwrap(),
            identity
        );
    }

    #[wasm_bindgen_test]
    fn refuses_identities_without_exactly_one_colon() {
        assert!(DeviceIdentity::parse("alice").is_err());
        assert!(DeviceIdentity::parse(&format!("alice:{DEVICE}:extra")).is_err());
    }

    #[wasm_bindgen_test]
    fn refuses_invalid_usernames_and_device_ids() {
        for username in ["al", "Alice", "a".repeat(33).as_str(), "al ice", "ålice"] {
            assert!(DeviceIdentity::new(username, DEVICE).is_err(), "{username}");
        }
        for device_id in ["short", "mJMEbgts33NWbvGmNqkuE=", "mJMEbgts33NWbvGmNqkuEw0"] {
            assert!(
                DeviceIdentity::new("alice", device_id).is_err(),
                "{device_id}"
            );
        }
    }

    #[wasm_bindgen_test]
    fn refuses_identities_that_are_not_utf8() {
        assert!(DeviceIdentity::from_bytes(&[0xff, b':', b'a']).is_err());
    }
}
