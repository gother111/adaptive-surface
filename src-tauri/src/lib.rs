pub mod control_plane;
mod apple;
mod deepseek;
mod desktop_control;
mod local_files;
mod providers;

use apple::{
    create_calendar_event, create_note, create_reminder, load_apple_context_bundle,
    load_calendar_events, load_capability_diagnostics, load_mail_messages, load_notes,
    load_reminders, read_mail_message, read_note, search_contacts, update_reminder,
};
use control_plane::{OperationCommand, SubmitObjectiveInput};
use deepseek::{load_model_provider_status, refine_voice_intent_with_model};
use desktop_control::{
    desktop_observe, desktop_open_app, desktop_paste_text, desktop_permission_status,
    desktop_read_selected_text, desktop_replace_selection,
};
use local_files::{FileReadQuery, FileReadResult, FileSearchQuery, WorkFileRecord};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Emitter;

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
struct ExternalAuthRequirement {
    id: String,
    label: String,
    provider: String,
    status: String,
    required_values: Vec<String>,
    redirect_strategy: String,
    notes: Vec<String>,
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

#[tauri::command]
fn load_native_permission_debug() -> Result<serde_json::Value, String> {
    let calendar_status = providers::eventkit_bridge::eventkit_status_json(false, "EventKitCalendarProvider")
        .and_then(|json| serde_json::from_str::<serde_json::Value>(&json).map_err(|error| {
            providers::provider_status::ProviderError::new(
                "EventKitCalendarProvider",
                providers::provider_status::ProviderErrorKind::Adapter,
                format!("Calendar status JSON was invalid: {error}"),
            )
        }))
        .map_err(|error| error.message())?;
    let reminders_status = providers::eventkit_bridge::eventkit_status_json(true, "EventKitRemindersProvider")
        .and_then(|json| serde_json::from_str::<serde_json::Value>(&json).map_err(|error| {
            providers::provider_status::ProviderError::new(
                "EventKitRemindersProvider",
                providers::provider_status::ProviderErrorKind::Adapter,
                format!("Reminders status JSON was invalid: {error}"),
            )
        }))
        .map_err(|error| error.message())?;
    let contacts_status = providers::contacts_bridge::contacts_status_json("ContactsFrameworkProvider")
        .and_then(|json| serde_json::from_str::<serde_json::Value>(&json).map_err(|error| {
            providers::provider_status::ProviderError::new(
                "ContactsFrameworkProvider",
                providers::provider_status::ProviderErrorKind::Adapter,
                format!("Contacts status JSON was invalid: {error}"),
            )
        }))
        .map_err(|error| error.message())?;
    let mail = providers::mail_provider::mail_metadata_diagnostics();
    let notes = providers::notes_provider::notes_diagnostics();

    Ok(json!({
        "appBundleIdentifier": "com.adaptivesurface.desktop",
        "executablePath": std::env::current_exe().ok().map(|path| path.display().to_string()),
        "calendar": calendar_status,
        "reminders": reminders_status,
        "contacts": contacts_status,
        "mail": mail,
        "notes": notes,
        "didOpenExternalApp": false
    }))
}

fn system_time_to_epoch_ms(value: SystemTime) -> u64 {
    value
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn eventkit_smoke_report() -> String {
    let calendar_status = providers::calendar_provider::status();
    let reminders_status = providers::reminders_provider::status();
    let calendar_result = providers::calendar_provider::list(apple::models::CalendarQuery {
        days_ahead: Some(1),
        limit: Some(5),
    });
    let reminders_result = providers::reminders_provider::list(apple::models::ReminderQuery {
        limit: Some(5),
        include_completed: Some(false),
    });

    json!({
        "calendarStatus": calendar_status,
        "remindersStatus": reminders_status,
        "calendar": match calendar_result {
            Ok(events) => json!({
                "ok": true,
                "count": events.len(),
                "sampleTitles": events.into_iter().take(3).map(|event| event.title).collect::<Vec<_>>()
            }),
            Err(error) => json!({ "ok": false, "error": error.message() }),
        },
        "reminders": match reminders_result {
            Ok(reminders) => json!({
                "ok": true,
                "count": reminders.len(),
                "sampleTitles": reminders.into_iter().take(3).map(|reminder| reminder.title).collect::<Vec<_>>()
            }),
            Err(error) => json!({ "ok": false, "error": error.message() }),
        }
    })
    .to_string()
}

#[tauri::command]
fn search_local_files(query: FileSearchQuery) -> Result<Vec<WorkFileRecord>, String> {
    local_files::search_files(query)
}

#[tauri::command]
fn read_local_file(query: FileReadQuery) -> Result<FileReadResult, String> {
    local_files::read_file(query)
}

#[tauri::command]
fn submit_final_utterance(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
    input: SubmitObjectiveInput,
) -> Result<control_plane::SubmitObjectiveResponse, String> {
    let response = {
        let mut service = state
            .lock()
            .map_err(|_| "control-plane service lock was poisoned".to_string())?;
        service
            .submit_final_utterance(input)
            .map_err(|error| error.message)?
    };

    for event in &response.events {
        let _ = app.emit("control-plane://runtime-event", event);
    }

    Ok(response)
}

#[tauri::command]
fn cancel_operation(
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
    command: OperationCommand,
) -> Result<control_plane::ControlPlaneSessionSnapshot, String> {
    let mut service = state
        .lock()
        .map_err(|_| "control-plane service lock was poisoned".to_string())?;
    service.cancel_operation(command).map_err(|error| error.message)
}

#[tauri::command]
fn approve_operation(
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
    command: OperationCommand,
) -> Result<control_plane::ControlPlaneSessionSnapshot, String> {
    let mut service = state
        .lock()
        .map_err(|_| "control-plane service lock was poisoned".to_string())?;
    service.approve_operation(command).map_err(|error| error.message)
}

#[tauri::command]
fn reject_operation(
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
    command: OperationCommand,
) -> Result<control_plane::ControlPlaneSessionSnapshot, String> {
    let mut service = state
        .lock()
        .map_err(|_| "control-plane service lock was poisoned".to_string())?;
    service.reject_operation(command).map_err(|error| error.message)
}

#[tauri::command]
fn get_session_snapshot(
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
    session_id: String,
) -> Result<control_plane::ControlPlaneSessionSnapshot, String> {
    let mut service = state
        .lock()
        .map_err(|_| "control-plane service lock was poisoned".to_string())?;
    service
        .get_session_snapshot(control_plane::contracts::SessionId::new(session_id))
        .map_err(|error| error.message)
}

#[tauri::command]
fn list_pending_approvals(
    state: tauri::State<'_, Mutex<control_plane::ControlPlaneService>>,
) -> Result<Vec<control_plane::contracts::ApprovalRequest>, String> {
    let service = state
        .lock()
        .map_err(|_| "control-plane service lock was poisoned".to_string())?;
    Ok(service.list_pending_approvals())
}

#[tauri::command]
fn list_control_plane_capabilities() -> Vec<control_plane::SemanticCapabilityDescriptor> {
    control_plane::ControlPlaneService::canonical_capabilities()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let control_plane_service = control_plane::ControlPlaneService::new_app()
        .expect("control-plane SQLite repository should initialize");

    tauri::Builder::default()
        .manage(Mutex::new(control_plane_service))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_local_context_preview,
            load_calendar_events,
            create_calendar_event,
            load_mail_messages,
            read_mail_message,
            load_notes,
            read_note,
            create_note,
            load_reminders,
            create_reminder,
            update_reminder,
            search_contacts,
            load_capability_diagnostics,
            search_local_files,
            read_local_file,
            load_apple_context_bundle,
            load_external_auth_requirements,
            load_native_permission_debug,
            load_model_provider_status,
            refine_voice_intent_with_model,
            desktop_permission_status,
            desktop_observe,
            desktop_read_selected_text,
            desktop_paste_text,
            desktop_replace_selection,
            desktop_open_app,
            submit_final_utterance,
            cancel_operation,
            approve_operation,
            reject_operation,
            get_session_snapshot,
            list_pending_approvals,
            list_control_plane_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("error while running Adaptive Surface");
}
