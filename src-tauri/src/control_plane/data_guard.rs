use super::contracts::{
    DataEgressDisposition, DestinationClass, Metadata, Sensitivity,
};

pub fn evaluate_egress(
    sensitivity: &Sensitivity,
    destination: &DestinationClass,
    contains_secret: bool,
) -> DataEgressDisposition {
    if contains_secret {
        return DataEgressDisposition::Deny;
    }

    match destination {
        DestinationClass::LocalProcess | DestinationClass::LocalProvider => {
            DataEgressDisposition::Allow
        }
        DestinationClass::DiagnosticLog => match sensitivity {
            Sensitivity::Local | Sensitivity::ExternalShareable => DataEgressDisposition::Allow,
            Sensitivity::Sensitive | Sensitivity::Restricted => DataEgressDisposition::Deny,
        },
        DestinationClass::CloudModel | DestinationClass::ExternalConnector | DestinationClass::NativeApplication => {
            match sensitivity {
                Sensitivity::ExternalShareable => DataEgressDisposition::Allow,
                Sensitivity::Sensitive => DataEgressDisposition::RequireApproval,
                Sensitivity::Local => DataEgressDisposition::RequireApproval,
                Sensitivity::Restricted => DataEgressDisposition::Deny,
            }
        }
    }
}

pub fn redact_metadata_values(metadata: &Metadata) -> Metadata {
    metadata
        .iter()
        .map(|(key, value)| (key.clone(), redact_sensitive_diagnostic(value)))
        .collect()
}

pub fn metadata_contains_secret(metadata: &Metadata) -> bool {
    metadata
        .iter()
        .any(|(key, value)| key_looks_sensitive(key) || value_looks_secret(value))
}

pub fn redact_sensitive_diagnostic(input: &str) -> String {
    input
        .split_whitespace()
        .map(redact_token)
        .collect::<Vec<_>>()
        .join(" ")
        .lines()
        .map(redact_assignment_line)
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_token(token: &str) -> String {
    let trimmed = token.trim_matches(|character: char| {
        matches!(character, ',' | ';' | '"' | '\'' | '(' | ')' | '[' | ']')
    });
    if value_looks_secret(trimmed) {
        token.replace(trimmed, "[REDACTED_SECRET]")
    } else {
        token.to_string()
    }
}

fn redact_assignment_line(line: &str) -> String {
    let Some((left, _right)) = line.split_once('=') else {
        return line.to_string();
    };
    if key_looks_sensitive(left.trim()) {
        format!("{}=[REDACTED_SECRET]", left.trim())
    } else {
        line.to_string()
    }
}

fn key_looks_sensitive(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    [
        "apikey",
        "accesskey",
        "secret",
        "token",
        "bearer",
        "password",
        "credential",
        "clientsecret",
        "privatekey",
        "sessionsecret",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn value_looks_secret(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("sk-")
        || lower.starts_with("sk_proj_")
        || lower.starts_with("sk-proj-")
        || lower.starts_with("xoxb-")
        || lower.starts_with("ghp_")
        || lower.starts_with("github_pat_")
        || lower.starts_with("bearer ")
        || lower.contains("-----begin private key-----")
        || (value.len() >= 32 && value.chars().all(|character| character.is_ascii_alphanumeric()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricted_data_cannot_leave_local_boundary() {
        assert_eq!(
            evaluate_egress(&Sensitivity::Restricted, &DestinationClass::CloudModel, false),
            DataEgressDisposition::Deny
        );
        assert_eq!(
            evaluate_egress(&Sensitivity::Restricted, &DestinationClass::ExternalConnector, false),
            DataEgressDisposition::Deny
        );
    }

    #[test]
    fn sensitive_data_requires_approval_for_cloud_or_external_use() {
        assert_eq!(
            evaluate_egress(&Sensitivity::Sensitive, &DestinationClass::CloudModel, false),
            DataEgressDisposition::RequireApproval
        );
        assert_eq!(
            evaluate_egress(&Sensitivity::Sensitive, &DestinationClass::ExternalConnector, false),
            DataEgressDisposition::RequireApproval
        );
    }

    #[test]
    fn external_shareable_data_can_pass_declared_external_boundary() {
        assert_eq!(
            evaluate_egress(
                &Sensitivity::ExternalShareable,
                &DestinationClass::ExternalConnector,
                false,
            ),
            DataEgressDisposition::Allow
        );
    }

    #[test]
    fn representative_keys_and_tokens_are_redacted() {
        let redacted = redact_sensitive_diagnostic(
            "OPENAI_API_KEY=sk-proj-abc123 bearer ghp_abcdefghijklmnopqrstuvwxyz123456",
        );
        assert!(!redacted.contains("sk-proj-abc123"));
        assert!(!redacted.contains("ghp_abcdefghijklmnopqrstuvwxyz123456"));
        assert!(redacted.contains("[REDACTED_SECRET]"));
    }

    #[test]
    fn secret_metadata_is_detected_and_redacted() {
        let mut metadata = Metadata::new();
        metadata.insert("api_key".to_string(), "sk-proj-secret-value".to_string());
        metadata.insert("subject".to_string(), "Inbox triage".to_string());

        let redacted = redact_metadata_values(&metadata);

        assert!(metadata_contains_secret(&metadata));
        assert_eq!(redacted.get("api_key"), Some(&"[REDACTED_SECRET]".to_string()));
        assert_eq!(redacted.get("subject"), Some(&"Inbox triage".to_string()));
    }
}
