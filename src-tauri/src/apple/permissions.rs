use super::applescript::{launch_application, run_osascript};
use super::models::CapabilityDiagnostic;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn capability_diagnostics() -> Vec<CapabilityDiagnostic> {
    vec![
        apple_capability("apple.mail", "Apple Mail", "Mail", vec!["read", "list", "search", "draft"], vec!["show recent emails", "open latest email fully"], r#"tell application "Mail"
	if not (exists inbox) then return "no inbox"
	return "inbox available"
end tell"#),
        apple_capability("apple.calendar", "Apple Calendar", "Calendar", vec!["read", "list", "create"], vec!["show today's calendar", "create a calendar event tomorrow at 10 called Test Event"], r#"tell application "Calendar"
	launch
	return (count of calendars) as text
end tell"#),
        apple_capability("apple.reminders", "Apple Reminders", "Reminders", vec!["read", "list", "create", "update"], vec!["show my reminders", "create a reminder to test Seemless tomorrow morning"], r#"tell application "Reminders"
	return (count of lists) as text
end tell"#),
        apple_capability("apple.notes", "Apple Notes", "Notes", vec!["read", "list", "search", "create", "update"], vec!["show recent notes", "open latest note fully", "create a note called Seemless Test Note"], r#"tell application "Notes"
	return (count of notes) as text
end tell"#),
        apple_capability("apple.contacts", "Apple Contacts", "Contacts", vec!["read", "search"], vec!["find contacts named Yurii"], r#"tell application "Contacts"
	return (count of people) as text
end tell"#),
        local_files_capability(),
        scaffolded_google("google.calendar", "Google Calendar"),
        scaffolded_google("google.drive", "Google Drive"),
    ]
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
        does_not_work: strings(vec!["system folders", "hidden folder crawling", "large-file full reads"]),
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

fn apple_capability(
    id: &str,
    label: &str,
    app_name: &str,
    operations: Vec<&str>,
    examples: Vec<&str>,
    probe_script: &str,
) -> CapabilityDiagnostic {
    let checked = epoch_ms();
    launch_application(app_name);
    match run_osascript(probe_script) {
        Ok(probe_result) => CapabilityDiagnostic {
            id: id.to_string(),
            label: label.to_string(),
            provider: format!("{app_name} AppleScript adapter"),
            status: "available".to_string(),
            supported_operations: strings(operations),
            last_checked_at: checked,
            last_error: None,
            permission_instructions: format!("macOS may ask to allow Adaptive Surface to control {app_name}. Approve it in System Settings > Privacy & Security > Automation if blocked."),
            test_command_examples: strings(examples),
            works: vec![
                "adapter launches".to_string(),
                "real read/list probe succeeded".to_string(),
                format!("probe result: {probe_result}"),
            ],
            does_not_work: strings(vec!["no background daemon", "requires local macOS app data", "AppleScript can still fail on specific records"]),
        },
        Err(error) => CapabilityDiagnostic {
            id: id.to_string(),
            label: label.to_string(),
            provider: format!("{app_name} AppleScript adapter"),
            status: "needs-permission".to_string(),
            supported_operations: strings(operations),
            last_checked_at: checked,
            last_error: Some(error),
            permission_instructions: format!("Open {app_name} once, then allow Adaptive Surface under System Settings > Privacy & Security > Automation."),
            test_command_examples: strings(examples),
            works: Vec::new(),
            does_not_work: strings(vec!["permission check failed"]),
        },
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
