use std::fmt::{self, Debug, Display};

/// Why an MLS operation failed; becomes a JavaScript exception at the module's boundary, so the
/// module never panics on bad input (#4's spec).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MlsError {
    message: String,
}

impl MlsError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    /// An error from OpenMLS or the storage, with what the module was doing.
    pub fn from_cause(doing: &str, cause: impl Debug) -> Self {
        Self::new(format!("{doing} failed: {cause:?}"))
    }

    pub fn no_identity() -> Self {
        Self::new("This Device has no MLS identity yet: call initIdentity or loadState first")
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl Display for MlsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for MlsError {}

pub type MlsResult<T> = Result<T, MlsError>;
