use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::SystemTime;

const MAX_SCANNED_ENTRIES: usize = 12_000;
const MAX_RECENT_FILES: usize = 6;
const MAX_TOP_EXTENSIONS: usize = 6;
const MAX_INDEX_PREVIEW_LINES: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalContextExtensionCount {
    extension: String,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalContextRecentFile {
    path: String,
    modified_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalContextPreview {
    trusted_roots: Vec<String>,
    personal_index_path: String,
    index_found: bool,
    total_files: usize,
    total_directories: usize,
    scanned_entries: usize,
    top_extensions: Vec<LocalContextExtensionCount>,
    recent_files: Vec<LocalContextRecentFile>,
    index_preview: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppleContextPreview {
    calendar_events: Vec<String>,
    reminders: Vec<String>,
    notes: Vec<String>,
    mail_messages: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalAuthRequirement {
    id: String,
    label: String,
    provider: String,
    status: String,
    required_values: Vec<String>,
    redirect_strategy: String,
    notes: Vec<String>,
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Failed to launch osascript: {error}"))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map(|stdout| stdout.trim().to_string())
            .map_err(|error| format!("AppleScript returned invalid UTF-8: {error}"))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "AppleScript failed without stderr output.".to_string()
        } else {
            stderr
        })
    }
}

fn run_osascript_list(script: &str) -> Result<Vec<String>, String> {
    let output = run_osascript(script)?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

#[tauri::command]
async fn run_applescript(script: String) -> Result<String, String> {
    if script.trim().is_empty() {
        return Err("AppleScript command cannot be empty.".to_string());
    }

    // TODO: Gate production AppleScript behind explicit user approval, permission checks,
    // audit logging, and a narrow allowlist of action templates.
    run_osascript(&script)
}

#[tauri::command]
async fn load_local_context_preview(
    trusted_roots: Vec<String>,
    personal_index_path: String,
) -> Result<LocalContextPreview, String> {
    let mut total_files = 0usize;
    let mut total_directories = 0usize;
    let mut scanned_entries = 0usize;
    let mut extension_counts: HashMap<String, usize> = HashMap::new();
    let mut recent_files: Vec<LocalContextRecentFile> = Vec::new();
    let mut stack: Vec<PathBuf> = trusted_roots.iter().map(PathBuf::from).collect();

    while let Some(dir) = stack.pop() {
        if scanned_entries >= MAX_SCANNED_ENTRIES {
            break;
        }

        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            if scanned_entries >= MAX_SCANNED_ENTRIES {
                break;
            }

            scanned_entries += 1;
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };

            if metadata.is_dir() {
                total_directories += 1;
                stack.push(path);
                continue;
            }

            if !metadata.is_file() {
                continue;
            }

            total_files += 1;

            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "(no extension)".to_string());

            *extension_counts.entry(extension).or_insert(0) += 1;

            if let Ok(modified_at) = metadata.modified() {
                recent_files.push(LocalContextRecentFile {
                    path: path.display().to_string(),
                    modified_at_ms: system_time_to_epoch_ms(modified_at),
                });
            }
        }
    }

    recent_files.sort_by(|left, right| right.modified_at_ms.cmp(&left.modified_at_ms));
    recent_files.truncate(MAX_RECENT_FILES);

    let mut top_extensions: Vec<LocalContextExtensionCount> = extension_counts
        .into_iter()
        .map(|(extension, count)| LocalContextExtensionCount { extension, count })
        .collect();
    top_extensions.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.extension.cmp(&right.extension))
    });
    top_extensions.truncate(MAX_TOP_EXTENSIONS);

    let personal_index = PathBuf::from(&personal_index_path);
    let index_found = personal_index.is_file();
    let index_preview = if index_found {
        fs::read_to_string(&personal_index)
            .map(|contents| {
                contents
                    .lines()
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .take(MAX_INDEX_PREVIEW_LINES)
                    .map(ToOwned::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(LocalContextPreview {
        trusted_roots,
        personal_index_path,
        index_found,
        total_files,
        total_directories,
        scanned_entries,
        top_extensions,
        recent_files,
        index_preview,
    })
}

#[tauri::command]
async fn load_apple_context_preview() -> Result<AppleContextPreview, String> {
    let mut warnings = Vec::new();

    let calendar_events = load_apple_list(CALENDAR_PREVIEW_SCRIPT, "Calendar", &mut warnings);
    let reminders = load_apple_list(REMINDERS_PREVIEW_SCRIPT, "Reminders", &mut warnings);
    let notes = load_apple_list(NOTES_PREVIEW_SCRIPT, "Notes", &mut warnings);
    let mail_messages = load_apple_list(MAIL_PREVIEW_SCRIPT, "Mail", &mut warnings);

    Ok(AppleContextPreview {
        calendar_events,
        reminders,
        notes,
        mail_messages,
        warnings,
    })
}

#[tauri::command]
async fn load_external_auth_requirements() -> Result<Vec<ExternalAuthRequirement>, String> {
    Ok(vec![
        ExternalAuthRequirement {
            id: "github".to_string(),
            label: "GitHub".to_string(),
            provider: "GitHub OAuth".to_string(),
            status: "ready-to-configure".to_string(),
            required_values: vec![
                "OAuth client ID".to_string(),
                "redirect URI".to_string(),
            ],
            redirect_strategy: "Loopback or custom app callback".to_string(),
            notes: vec![
                "GitHub is approved as read-only in this app.".to_string(),
                "The repo still needs a registered OAuth app before browser sign-in can work."
                    .to_string(),
            ],
        },
        ExternalAuthRequirement {
            id: "slack".to_string(),
            label: "Slack".to_string(),
            provider: "Slack OAuth".to_string(),
            status: "ready-to-configure".to_string(),
            required_values: vec![
                "OAuth client ID".to_string(),
                "redirect URI".to_string(),
                "approved workspace install".to_string(),
            ],
            redirect_strategy: "Loopback or custom app callback".to_string(),
            notes: vec![
                "Slack is approved for full write in this app.".to_string(),
                "A workspace app registration is required before sign-in can start.".to_string(),
            ],
        },
        ExternalAuthRequirement {
            id: "email-account".to_string(),
            label: "Gmail".to_string(),
            provider: "Google OAuth".to_string(),
            status: "ready-to-configure".to_string(),
            required_values: vec![
                "Google OAuth client ID".to_string(),
                "redirect URI".to_string(),
            ],
            redirect_strategy: "Installed-app browser flow".to_string(),
            notes: vec![
                "Gmail is approved for full write in this app.".to_string(),
                "The repo still needs a Google OAuth app configuration and token storage path."
                    .to_string(),
            ],
        },
    ])
}

fn system_time_to_epoch_ms(value: SystemTime) -> u64 {
    value
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn load_apple_list(script: &str, label: &str, warnings: &mut Vec<String>) -> Vec<String> {
    match run_osascript_list(script) {
        Ok(lines) => lines,
        Err(error) => {
            warnings.push(format!("{label}: {error}"));
            Vec::new()
        }
    }
}

const CALENDAR_PREVIEW_SCRIPT: &str = r#"
tell application "Calendar"
	set outputLines to {}
	set endDate to (current date) + (3 * days)
	repeat with cal in calendars
		repeat with evt in (every event of cal whose start date ≥ (current date) and start date ≤ endDate)
			set end of outputLines to ((summary of evt as text) & " | " & ((start date of evt) as text) & " | " & (name of cal as text))
			if (count of outputLines) ≥ 5 then exit repeat
		end repeat
		if (count of outputLines) ≥ 5 then exit repeat
	end repeat
	if (count of outputLines) is 0 then return "No upcoming calendar events found."
	return outputLines as string
end tell
"#;

const REMINDERS_PREVIEW_SCRIPT: &str = r#"
tell application "Reminders"
	set outputLines to {}
	repeat with reminderList in lists
		repeat with itemRef in (reminders of reminderList whose completed is false)
			set reminderName to (name of itemRef as text)
			try
				set dueText to (due date of itemRef as text)
			on error
				set dueText to "No due date"
			end try
			set end of outputLines to (reminderName & " | " & dueText & " | " & (name of reminderList as text))
			if (count of outputLines) ≥ 5 then exit repeat
		end repeat
		if (count of outputLines) ≥ 5 then exit repeat
	end repeat
	if (count of outputLines) is 0 then return "No incomplete reminders found."
	return outputLines as string
end tell
"#;

const NOTES_PREVIEW_SCRIPT: &str = r#"
tell application "Notes"
	set outputLines to {}
	repeat with folderRef in folders
		repeat with noteRef in notes of folderRef
			set end of outputLines to ((name of noteRef as text) & " | " & (name of folderRef as text))
			if (count of outputLines) ≥ 5 then exit repeat
		end repeat
		if (count of outputLines) ≥ 5 then exit repeat
	end repeat
	if (count of outputLines) is 0 then return "No notes found."
	return outputLines as string
end tell
"#;

const MAIL_PREVIEW_SCRIPT: &str = r#"
tell application "Mail"
	set outputLines to {}
	set unreadMessages to (messages of inbox whose read status is false)
	repeat with msg in unreadMessages
		set end of outputLines to ((subject of msg as text) & " | " & (sender of msg as text))
		if (count of outputLines) ≥ 5 then exit repeat
	end repeat
	if (count of outputLines) is 0 then
		repeat with msg in messages of inbox
			set end of outputLines to ((subject of msg as text) & " | " & (sender of msg as text))
			if (count of outputLines) ≥ 5 then exit repeat
		end repeat
	end if
	if (count of outputLines) is 0 then return "No inbox mail found."
	return outputLines as string
end tell
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_applescript,
            load_local_context_preview,
            load_apple_context_preview,
            load_external_auth_requirements
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaptive Surface");
}
