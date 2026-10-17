use std::collections::HashMap;

use crate::error::{MlsError, MlsResult};

/// Marks a state blob of this module, followed by its format version.
const MAGIC: &[u8; 6] = b"NCMLS\x01";

/// Everything a Device keeps (D39): its identity, if it has one, and the storage provider's
/// contents, which hold the signer, Key packages and every Group.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct StateBlob {
    /// The credential identity text and the TLS-encoded signature key pair.
    pub identity: Option<(String, Vec<u8>)>,
    pub storage: HashMap<Vec<u8>, Vec<u8>>,
}

impl StateBlob {
    /// One blob, with the storage's entries in key order so the same state gives the same bytes.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = MAGIC.to_vec();
        match &self.identity {
            Some((identity, signer)) => {
                out.push(1);
                put_bytes(&mut out, identity.as_bytes());
                put_bytes(&mut out, signer);
            }
            None => out.push(0),
        }
        let mut entries: Vec<_> = self.storage.iter().collect();
        entries.sort();
        put_length(&mut out, entries.len());
        for (key, value) in entries {
            put_bytes(&mut out, key);
            put_bytes(&mut out, value);
        }
        out
    }

    pub fn decode(blob: &[u8]) -> MlsResult<Self> {
        if !blob.starts_with(MAGIC) {
            return Err(MlsError::new(
                "This is not an MLS state blob of this module",
            ));
        }
        let mut reader = Reader {
            rest: &blob[MAGIC.len()..],
        };
        let identity = match reader.take(1)?[0] {
            0 => None,
            1 => {
                let identity = String::from_utf8(reader.bytes()?.to_vec())
                    .map_err(|_| MlsError::new("The state blob's identity is not UTF-8"))?;
                Some((identity, reader.bytes()?.to_vec()))
            }
            _ => return Err(MlsError::new("The state blob is damaged")),
        };
        let count = reader.length()?;
        let mut storage = HashMap::with_capacity(count.min(1 << 16));
        for _ in 0..count {
            let key = reader.bytes()?.to_vec();
            storage.insert(key, reader.bytes()?.to_vec());
        }
        if !reader.rest.is_empty() {
            return Err(MlsError::new("The state blob has bytes after its end"));
        }
        Ok(Self { identity, storage })
    }
}

fn put_length(out: &mut Vec<u8>, length: usize) {
    out.extend_from_slice(&(length as u32).to_be_bytes());
}

fn put_bytes(out: &mut Vec<u8>, bytes: &[u8]) {
    put_length(out, bytes.len());
    out.extend_from_slice(bytes);
}

struct Reader<'a> {
    rest: &'a [u8],
}

impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> MlsResult<&'a [u8]> {
        if self.rest.len() < count {
            return Err(MlsError::new("The state blob ends too early"));
        }
        let (taken, rest) = self.rest.split_at(count);
        self.rest = rest;
        Ok(taken)
    }

    fn length(&mut self) -> MlsResult<usize> {
        let bytes: [u8; 4] = self.take(4)?.try_into().expect("four bytes were taken");
        Ok(u32::from_be_bytes(bytes) as usize)
    }

    fn bytes(&mut self) -> MlsResult<&'a [u8]> {
        let length = self.length()?;
        self.take(length)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    fn sample() -> StateBlob {
        StateBlob {
            identity: Some(("alice:mJMEbgts33NWbvGmNqkuEw".to_owned(), vec![1, 2, 3])),
            storage: HashMap::from([(vec![9], vec![8, 7]), (vec![1, 1], vec![])]),
        }
    }

    #[wasm_bindgen_test]
    fn round_trips_identity_and_storage() {
        assert_eq!(StateBlob::decode(&sample().encode()).unwrap(), sample());
        assert_eq!(
            StateBlob::decode(&StateBlob::default().encode()).unwrap(),
            StateBlob::default()
        );
    }

    #[wasm_bindgen_test]
    fn encodes_the_same_state_to_the_same_bytes() {
        assert_eq!(sample().encode(), sample().encode());
    }

    #[wasm_bindgen_test]
    fn refuses_other_or_damaged_bytes() {
        let blob = sample().encode();

        assert!(StateBlob::decode(b"not a blob").is_err());
        assert!(StateBlob::decode(&blob[..blob.len() - 1]).is_err());
        assert!(StateBlob::decode(&[blob.as_slice(), &[0]].concat()).is_err());
    }
}
