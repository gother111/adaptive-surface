use super::{
    epoch_ms, permission_check, ActiveAppInfo, ActiveWindowInfo, DesktopObservation,
    DesktopPermissionStatus, DeviceActionResult, OpenAppRequest, PasteTextRequest,
    PermissionState, ReplaceSelectionRequest, SelectedTextResult, FIELD_SEPARATOR,
};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_TEXT_PAYLOAD_CHARS: usize = 50_000;
const CLIPBOARD_SETTLE_MS: u64 = 180;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

pub fn desktop_permission_status() -> Result<DesktopPermissionStatus, String> {
    Ok(permission_status())
}

pub fn desktop_observe() -> Result<DesktopObservation, String> {
    let permission_status = permission_status();
    let mut warnings = Vec::new();

    let (active_app, active_window) = match read_frontmost_app() {
        Ok(result) => result,
        Err(error) => {
            warnings.push(format!("Could not read active app/window metadata: {error}"));
            (None, None)
        }
    };

    let selected_text = match read_selected_text_with_clipboard_restore() {
        Ok(result) => Some(result),
        Err(error) => {
            warnings.push(format!("Could not capture selected text: {error}"));
            None
        }
    };

    Ok(DesktopObservation {
        platform: "macos".to_string(),
        supported: true,
        active_app,
        active_window,
        selected_text,
        permission_status,
        captured_at_ms: epoch_ms(),
        warnings,
    })
}

pub fn desktop_read_selected_text() -> Result<SelectedTextResult, String> {
    read_selected_text_with_clipboard_restore()
}

pub fn desktop_paste_text(request: PasteTextRequest) -> Result<DeviceActionResult, String> {
    paste_text(
        request.text,
        request.restore_clipboard.unwrap_or(true),
        "desktop.pasteText",
        "Pasted text into the active app.",
    )
}

pub fn desktop_replace_selection(
    request: ReplaceSelectionRequest,
) -> Result<DeviceActionResult, String> {
    paste_text(
        request.text,
        request.restore_clipboard.unwrap_or(true),
        "desktop.replaceSelection",
        "Replaced the active selection when the target app accepted paste.",
    )
}

pub fn desktop_open_app(request: OpenAppRequest) -> Result<DeviceActionResult, String> {
    let mut command = Command::new("/usr/bin/open");
    let target = if let Some(bundle_id) = clean_optional(request.bundle_id) {
        validate_bundle_id(&bundle_id)?;
        command.arg("-b").arg(&bundle_id);
        bundle_id
    } else if let Some(app_name) = clean_optional(request.app_name) {
        validate_app_name(&app_name)?;
        command.arg("-a").arg(&app_name);
        app_name
    } else {
        return Err("Provide a bundle ID or app name to open.".to_string());
    };

    let output = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Failed to launch /usr/bin/open: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("macOS open failed for {target}.")
        } else {
            stderr
        });
    }

    Ok(DeviceActionResult {
        ok: true,
        action: "desktop.openApp".to_string(),
        message: format!("Requested macOS to open {target}."),
        requires_user_approval: true,
        warnings: vec!["Opening apps is approval-gated in the frontend action broker.".to_string()],
    })
}

fn permission_status() -> DesktopPermissionStatus {
    let accessibility_granted = unsafe { AXIsProcessTrusted() };

    DesktopPermissionStatus {
        platform: "macos".to_string(),
        supported: true,
        accessibility: permission_check(
            if accessibility_granted {
                PermissionState::Granted
            } else {
                PermissionState::Needed
            },
            "Accessibility",
            if accessibility_granted {
                None
            } else {
                Some("Required for the fixed System Events keyboard shortcuts used by copy and paste fallbacks.".to_string())
            },
        ),
        screen_recording: permission_check(
            PermissionState::Unknown,
            "Screen Recording (not required yet)",
            Some("Not checked because this runtime version does not capture screenshots or screen pixels.".to_string()),
        ),
        automation: permission_check(
            PermissionState::Unknown,
            "Automation",
            Some("macOS may prompt for Automation when fixed AppleScript fallbacks access System Events.".to_string()),
        ),
        instructions: vec![
            "Open System Settings > Privacy & Security > Accessibility and enable Adaptive Surface.".to_string(),
            "Allow Automation for System Events if macOS prompts during selected-text or paste testing.".to_string(),
            "Restart Adaptive Surface after granting permission if macOS does not update immediately.".to_string(),
        ],
        checked_at_ms: epoch_ms(),
    }
}

fn read_frontmost_app() -> Result<(Option<ActiveAppInfo>, Option<ActiveWindowInfo>), String> {
    let script = [
        "set fieldSeparator to ASCII character 31",
        "tell application \"System Events\"",
        "set frontProcess to first application process whose frontmost is true",
        "set appName to name of frontProcess",
        "set bundleId to \"\"",
        "try",
        "set bundleId to bundle identifier of frontProcess",
        "end try",
        "set processId to \"\"",
        "try",
        "set processId to unix id of frontProcess as text",
        "end try",
        "set windowTitle to \"\"",
        "try",
        "if (count of windows of frontProcess) > 0 then set windowTitle to name of front window of frontProcess",
        "end try",
        "end tell",
        "return appName & fieldSeparator & bundleId & fieldSeparator & processId & fieldSeparator & windowTitle",
    ];
    let output = run_osascript(&script, &[], Duration::from_secs(3))?;
    let fields = split_fields(&output);

    if fields.is_empty() || fields[0].is_empty() {
        return Ok((None, None));
    }

    let process_id = fields
        .get(2)
        .and_then(|value| value.parse::<i32>().ok());
    let active_app = Some(ActiveAppInfo {
        name: fields[0].clone(),
        bundle_id: fields.get(1).and_then(|value| optional_string(value)),
        process_id,
    });
    let active_window = Some(ActiveWindowInfo {
        title: fields.get(3).and_then(|value| optional_string(value)),
    });

    Ok((active_app, active_window))
}

fn read_selected_text_with_clipboard_restore() -> Result<SelectedTextResult, String> {
    let mut warnings = vec![
        "Selected-text capture uses a clipboard + Cmd+C fallback and restores text clipboard contents when possible.".to_string(),
    ];
    let sentinel = format!("__ADAPTIVE_SURFACE_SELECTION_SENTINEL_{}__", epoch_ms());
    let previous_clipboard = match read_clipboard_text() {
        Ok(text) => Some(text),
        Err(error) => {
            warnings.push(format!("Previous clipboard text could not be read for restore: {error}"));
            None
        }
    };

    set_clipboard_text(&sentinel)?;
    send_command_shortcut("c")?;
    thread::sleep(Duration::from_millis(CLIPBOARD_SETTLE_MS));

    let captured_text = read_clipboard_text()?;
    let text = if captured_text == sentinel {
        warnings.push("Cmd+C did not produce readable selected text.".to_string());
        String::new()
    } else {
        captured_text
    };

    if let Some(previous) = previous_clipboard {
        if let Err(error) = set_clipboard_text(&previous) {
            warnings.push(format!("Clipboard text restore failed: {error}"));
        }
    } else {
        warnings.push("Clipboard restore was skipped because the previous clipboard was not readable as text.".to_string());
    }

    let confidence = if text.trim().is_empty() { 0.2 } else { 0.75 };
    Ok(SelectedTextResult {
        text,
        source: "clipboard-shortcut-fallback".to_string(),
        confidence,
        warnings,
    })
}

fn paste_text(
    text: String,
    restore_clipboard: bool,
    action: &str,
    message: &str,
) -> Result<DeviceActionResult, String> {
    validate_text_payload(&text)?;

    let mut warnings = Vec::new();
    let previous_clipboard = match read_clipboard_text() {
        Ok(value) => Some(value),
        Err(error) => {
            warnings.push(format!("Previous clipboard text could not be read for restore: {error}"));
            None
        }
    };

    set_clipboard_text(&text)?;
    thread::sleep(Duration::from_millis(60));
    send_command_shortcut("v")?;
    thread::sleep(Duration::from_millis(CLIPBOARD_SETTLE_MS));

    if restore_clipboard {
        if let Some(previous) = previous_clipboard {
            if let Err(error) = set_clipboard_text(&previous) {
                warnings.push(format!("Clipboard text restore failed: {error}"));
            }
        } else {
            warnings.push("Clipboard restore was requested, but the previous clipboard was not readable as text.".to_string());
        }
    }

    Ok(DeviceActionResult {
        ok: true,
        action: action.to_string(),
        message: message.to_string(),
        requires_user_approval: true,
        warnings,
    })
}

fn read_clipboard_text() -> Result<String, String> {
    run_osascript(&["return the clipboard as text"], &[], Duration::from_secs(2))
}

fn set_clipboard_text(text: &str) -> Result<(), String> {
    run_osascript(
        &[
            "on run argv",
            "set the clipboard to item 1 of argv",
            "end run",
        ],
        &[text],
        Duration::from_secs(2),
    )
    .map(|_| ())
}

fn send_command_shortcut(key: &str) -> Result<(), String> {
    run_osascript(
        &[
            "on run argv",
            "tell application \"System Events\" to keystroke (item 1 of argv) using command down",
            "end run",
        ],
        &[key],
        Duration::from_secs(3),
    )
    .map(|_| ())
}

fn run_osascript(script_lines: &[&str], args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = Command::new("/usr/bin/osascript");
    for line in script_lines {
        command.arg("-e").arg(line);
    }

    if !args.is_empty() {
        command.arg("--");
        for arg in args {
            command.arg(arg);
        }
    }

    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to launch /usr/bin/osascript: {error}"))?;

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("AppleScript timed out after {} seconds.", timeout.as_secs()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(format!("Failed while waiting for AppleScript: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to collect AppleScript output: {error}"))?;

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

fn split_fields(output: &str) -> Vec<String> {
    output
        .split(FIELD_SEPARATOR)
        .map(|field| field.trim().to_string())
        .collect()
}

fn optional_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "missing value" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value.map(|item| item.trim().to_string()).filter(|item| !item.is_empty())
}

fn validate_text_payload(text: &str) -> Result<(), String> {
    if text.chars().count() > MAX_TEXT_PAYLOAD_CHARS {
        return Err(format!(
            "Text payload is too large for the clipboard fallback. Limit is {MAX_TEXT_PAYLOAD_CHARS} characters."
        ));
    }

    Ok(())
}

fn validate_bundle_id(value: &str) -> Result<(), String> {
    let valid = value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '.' || character == '-' || character == '_');

    if valid && value.len() <= 160 {
        Ok(())
    } else {
        Err("Bundle ID must contain only letters, numbers, dots, dashes, or underscores.".to_string())
    }
}

fn validate_app_name(value: &str) -> Result<(), String> {
    if value.len() <= 80 && !value.contains('/') && !value.contains(':') && !value.contains('\0') {
        Ok(())
    } else {
        Err("App name is not valid for the safe open-app action.".to_string())
    }
}
