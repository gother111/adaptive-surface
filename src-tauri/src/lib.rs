use std::process::Command;

#[tauri::command]
async fn run_applescript(script: String) -> Result<String, String> {
    if script.trim().is_empty() {
        return Err("AppleScript command cannot be empty.".to_string());
    }

    // TODO: Gate production AppleScript behind explicit user approval, permission checks,
    // audit logging, and a narrow allowlist of action templates.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_applescript])
        .run(tauri::generate_context!())
        .expect("error while running Adaptive Surface");
}
