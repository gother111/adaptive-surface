use super::{
    epoch_ms, unsupported_action, unsupported_permission_status, DesktopObservation,
    DesktopPermissionStatus, DeviceActionResult, OpenAppRequest, PasteTextRequest,
    ReplaceSelectionRequest, SelectedTextResult,
};

pub fn desktop_permission_status() -> Result<DesktopPermissionStatus, String> {
    Ok(unsupported_permission_status(std::env::consts::OS))
}

pub fn desktop_observe() -> Result<DesktopObservation, String> {
    let permission_status = unsupported_permission_status(std::env::consts::OS);

    Ok(DesktopObservation {
        platform: std::env::consts::OS.to_string(),
        supported: false,
        active_app: None,
        active_window: None,
        selected_text: None,
        permission_status,
        captured_at_ms: epoch_ms(),
        warnings: vec!["Desktop observation is only supported on macOS in this version.".to_string()],
    })
}

pub fn desktop_read_selected_text() -> Result<SelectedTextResult, String> {
    Ok(SelectedTextResult {
        text: String::new(),
        source: "unsupported".to_string(),
        confidence: 0.0,
        warnings: vec!["Selected-text capture is only supported on macOS in this version.".to_string()],
    })
}

pub fn desktop_paste_text(_request: PasteTextRequest) -> Result<DeviceActionResult, String> {
    Ok(unsupported_action("desktop.pasteText"))
}

pub fn desktop_replace_selection(_request: ReplaceSelectionRequest) -> Result<DeviceActionResult, String> {
    Ok(unsupported_action("desktop.replaceSelection"))
}

pub fn desktop_open_app(_request: OpenAppRequest) -> Result<DeviceActionResult, String> {
    Ok(unsupported_action("desktop.openApp"))
}
