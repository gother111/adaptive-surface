#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(not(target_os = "macos"))]
use unsupported as platform;

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const FIELD_SEPARATOR: char = '\u{001f}';

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPermissionStatus {
    pub platform: String,
    pub supported: bool,
    pub accessibility: PermissionCheck,
    pub screen_recording: PermissionCheck,
    pub automation: PermissionCheck,
    pub instructions: Vec<String>,
    pub checked_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheck {
    pub status: PermissionState,
    pub label: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionState {
    Granted,
    Needed,
    Unknown,
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopObservation {
    pub platform: String,
    pub supported: bool,
    pub active_app: Option<ActiveAppInfo>,
    pub active_window: Option<ActiveWindowInfo>,
    pub selected_text: Option<SelectedTextResult>,
    pub permission_status: DesktopPermissionStatus,
    pub captured_at_ms: u64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveAppInfo {
    pub name: String,
    pub bundle_id: Option<String>,
    pub process_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowInfo {
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedTextResult {
    pub text: String,
    pub source: String,
    pub confidence: f32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteTextRequest {
    pub text: String,
    pub restore_clipboard: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSelectionRequest {
    pub text: String,
    pub restore_clipboard: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAppRequest {
    pub bundle_id: Option<String>,
    pub app_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceActionResult {
    pub ok: bool,
    pub action: String,
    pub message: String,
    pub requires_user_approval: bool,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn desktop_permission_status() -> Result<DesktopPermissionStatus, String> {
    platform::desktop_permission_status()
}

#[tauri::command]
pub async fn desktop_observe() -> Result<DesktopObservation, String> {
    platform::desktop_observe()
}

#[tauri::command]
pub async fn desktop_read_selected_text() -> Result<SelectedTextResult, String> {
    platform::desktop_read_selected_text()
}

#[tauri::command]
pub async fn desktop_paste_text(request: PasteTextRequest) -> Result<DeviceActionResult, String> {
    platform::desktop_paste_text(request)
}

#[tauri::command]
pub async fn desktop_replace_selection(
    request: ReplaceSelectionRequest,
) -> Result<DeviceActionResult, String> {
    platform::desktop_replace_selection(request)
}

#[tauri::command]
pub async fn desktop_open_app(request: OpenAppRequest) -> Result<DeviceActionResult, String> {
    platform::desktop_open_app(request)
}

pub(crate) fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn permission_check(
    status: PermissionState,
    label: &str,
    reason: Option<String>,
) -> PermissionCheck {
    PermissionCheck {
        status,
        label: label.to_string(),
        reason,
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn unsupported_permission_status(platform: &str) -> DesktopPermissionStatus {
    DesktopPermissionStatus {
        platform: platform.to_string(),
        supported: false,
        accessibility: permission_check(
            PermissionState::Unsupported,
            "Accessibility",
            Some("Desktop control is only implemented on macOS in this version.".to_string()),
        ),
        screen_recording: permission_check(
            PermissionState::Unsupported,
            "Screen Recording (not required yet)",
            Some("Screen Recording is not used by this runtime version.".to_string()),
        ),
        automation: permission_check(
            PermissionState::Unsupported,
            "Automation",
            Some("Automation fallbacks are only implemented on macOS in this version.".to_string()),
        ),
        instructions: vec!["Device Capability Runtime is available on macOS only.".to_string()],
        checked_at_ms: epoch_ms(),
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn unsupported_action(action: &str) -> DeviceActionResult {
    DeviceActionResult {
        ok: false,
        action: action.to_string(),
        message: "Desktop control is only supported on macOS in this version.".to_string(),
        requires_user_approval: true,
        warnings: vec!["No device action was attempted.".to_string()],
    }
}
