use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider_name: String,
    pub status: String,
    pub did_open_external_app: bool,
    pub error_kind: Option<ProviderErrorKind>,
    pub exact_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProviderErrorKind {
    Permission,
    Unavailable,
    Adapter,
    Timeout,
    Unsupported,
}

#[derive(Clone, Debug)]
pub struct ProviderError {
    pub provider_name: String,
    pub kind: ProviderErrorKind,
    pub exact_error: String,
    pub did_open_external_app: bool,
}

impl ProviderError {
    pub fn new(provider_name: impl Into<String>, kind: ProviderErrorKind, exact_error: impl Into<String>) -> Self {
        Self {
            provider_name: provider_name.into(),
            kind,
            exact_error: exact_error.into(),
            did_open_external_app: false,
        }
    }

    pub fn message(&self) -> String {
        format!(
            "provider={} errorKind={:?} didOpenExternalApp={} exactError={}",
            self.provider_name, self.kind, self.did_open_external_app, self.exact_error
        )
    }
}

impl ProviderStatus {
    pub fn available(provider_name: impl Into<String>) -> Self {
        Self {
            provider_name: provider_name.into(),
            status: "available".to_string(),
            did_open_external_app: false,
            error_kind: None,
            exact_error: None,
        }
    }

    pub fn unavailable(provider_name: impl Into<String>, kind: ProviderErrorKind, exact_error: impl Into<String>) -> Self {
        Self {
            provider_name: provider_name.into(),
            status: "unavailable".to_string(),
            did_open_external_app: false,
            error_kind: Some(kind),
            exact_error: Some(exact_error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_error_message_includes_provider_kind_external_app_and_exact_error() {
        let error = ProviderError::new(
            "EnvelopeIndexProvider",
            ProviderErrorKind::Permission,
            "full_disk_access_missing: Operation not permitted",
        );

        let message = error.message();

        assert!(message.contains("provider=EnvelopeIndexProvider"));
        assert!(message.contains("errorKind=Permission"));
        assert!(message.contains("didOpenExternalApp=false"));
        assert!(message.contains("exactError=full_disk_access_missing: Operation not permitted"));
    }
}
