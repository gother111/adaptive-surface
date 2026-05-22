use super::models::CapabilityDiagnostic;
use crate::providers::{calendar_provider, contacts_provider, mail_provider, notes_provider, reminders_provider};
use crate::providers::provider_status::{ProviderErrorKind, ProviderStatus};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn capability_diagnostics() -> Vec<CapabilityDiagnostic> {
    vec![
        apple_capability(
            "apple.mail",
            "Apple Mail",
            "Mail provider chain",
            vec!["read", "list", "search", "draft"],
            vec!["show recent emails", "open latest email fully"],
            mail_provider::status(),
            vec!["Envelope Index metadata", "best-effort .emlx body lookup", "AppleScript fallback only if Mail is already running"],
        ),
        apple_capability(
            "apple.calendar",
            "Apple Calendar",
            "EventKit",
            vec!["read", "list", "create"],
            vec!["show today's calendar", "create a calendar event after approval"],
            calendar_provider::status(),
            vec!["today/upcoming events", "approval-gated event creation"],
        ),
        apple_capability(
            "apple.reminders",
            "Apple Reminders",
            "EventKit",
            vec!["read", "list", "create", "update"],
            vec!["show my reminders", "create a reminder after approval"],
            reminders_provider::status(),
            vec!["incomplete reminder listing", "approval-gated reminder creation", "update by native identifier"],
        ),
        apple_capability(
            "apple.notes",
            "Apple Notes",
            "Notes provider chain",
            vec!["read", "list", "search", "create", "update"],
            vec!["show recent notes", "open latest note fully"],
            notes_provider::status(),
            vec!["AppleScript fallback only if Notes is already running"],
        ),
        apple_capability(
            "apple.contacts",
            "Apple Contacts",
            "Contacts.framework",
            vec!["read", "search"],
            vec!["find contacts named Yurii"],
            contacts_provider::status(),
            vec!["name/email/phone/organization search", "contact notes are not requested"],
        ),
        local_files_capability(),
        scaffolded_google("gmail", "Gmail"),
        scaffolded_google("google.calendar", "Google Calendar"),
        scaffolded_google("google.drive", "Google Drive"),
    ]
}

fn apple_capability(
    id: &str,
    label: &str,
    provider: &str,
    operations: Vec<&str>,
    examples: Vec<&str>,
    status: ProviderStatus,
    works_when_available: Vec<&str>,
) -> CapabilityDiagnostic {
    let available = status.status == "available";
    let status_label = if available {
        "available"
    } else {
        match status.error_kind {
            Some(ProviderErrorKind::Permission) => "needs-permission",
            Some(ProviderErrorKind::Unsupported) => "not-implemented",
            _ => "failed",
        }
    };

    CapabilityDiagnostic {
        id: id.to_string(),
        label: label.to_string(),
        provider: format!("{provider} ({})", status.provider_name),
        status: status_label.to_string(),
        supported_operations: strings(operations),
        last_checked_at: epoch_ms(),
        last_error: status.exact_error,
        permission_instructions: permission_instructions(id),
        test_command_examples: strings(examples),
        works: if available {
            works_when_available.into_iter().map(ToOwned::to_owned).collect()
        } else {
            Vec::new()
        },
        does_not_work: if available {
            vec!["does not open external Apple apps for read/list/search".to_string()]
        } else {
            vec!["read/list/search does not open external Apple apps; unavailable providers return an honest status".to_string()]
        },
    }
}

fn local_files_capability() -> CapabilityDiagnostic {
    let checked = epoch_ms();
    let roots = trusted_file_roots();
    let existing_roots = roots
        .iter()
        .filter(|path| path.is_dir())
        .map(|path| path.display().to_string())
        .collect::<Vec<String>>();
    let status = if existing_roots.is_empty() { "failed" } else { "available" };

    CapabilityDiagnostic {
        id: "local.files".to_string(),
        label: "Local files".to_string(),
        provider: "Tauri local filesystem".to_string(),
        status: status.to_string(),
        supported_operations: strings(vec!["read", "list", "search"]),
        last_checked_at: checked,
        last_error: if existing_roots.is_empty() {
            Some("Desktop, Documents, and Downloads trusted roots could not be resolved.".to_string())
        } else {
            None
        },
        permission_instructions: "Reads are limited to Desktop, Documents, and Downloads trusted roots.".to_string(),
        test_command_examples: strings(vec!["show files from Desktop", "search Documents for PDF files"]),
        works: existing_roots
            .into_iter()
            .map(|root| format!("trusted root available: {root}"))
            .chain(strings(vec!["metadata indexing", "name search", "extension search", "safe text previews"]))
            .collect(),
        does_not_work: strings(vec!["system folders", "hidden folder crawling", "pdf/docx/xlsx full reads"]),
    }
}

fn trusted_file_roots() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else {
        return Vec::new();
    };

    ["Desktop", "Documents", "Downloads"]
        .iter()
        .map(|name| PathBuf::from(&home).join(name))
        .collect()
}

fn permission_instructions(id: &str) -> String {
    match id {
        "apple.calendar" => "Allow Calendar access for Adaptive Surface in macOS Privacy & Security. Automation is only used for optional fallbacks.".to_string(),
        "apple.reminders" => "Allow Reminders access for Adaptive Surface in macOS Privacy & Security. Automation is only used for optional fallbacks.".to_string(),
        "apple.contacts" => "Allow Contacts access for Adaptive Surface in macOS Privacy & Security. Contact notes are not requested.".to_string(),
        "apple.mail" => "Mail reads use local Envelope Index metadata first. Automation is only used if Mail is already running.".to_string(),
        "apple.notes" => "Notes support uses a non-opening provider chain. If Notes is closed and local decoding is unavailable, Adaptive Surface reports unavailable.".to_string(),
        _ => "No app-opening diagnostics are used.".to_string(),
    }
}

fn scaffolded_google(id: &str, label: &str) -> CapabilityDiagnostic {
    CapabilityDiagnostic {
        id: id.to_string(),
        label: label.to_string(),
        provider: "Google OAuth".to_string(),
        status: "needs-configuration".to_string(),
        supported_operations: strings(vec!["read", "list", "search"]),
        last_checked_at: epoch_ms(),
        last_error: Some("OAuth client configuration is not present in this local app.".to_string()),
        permission_instructions: "Configure a Google OAuth client before enabling this connector.".to_string(),
        test_command_examples: Vec::new(),
        works: Vec::new(),
        does_not_work: strings(vec!["not connected", "not used as fallback for Apple/local data"]),
    }
}

fn strings(values: Vec<&str>) -> Vec<String> {
    values.into_iter().map(ToOwned::to_owned).collect()
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
