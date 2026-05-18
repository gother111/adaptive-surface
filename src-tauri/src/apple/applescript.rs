use std::process::Command;
use std::process::Stdio;
use std::thread;
use std::time::{Duration, Instant};

pub const FIELD_SEPARATOR: char = '\u{001f}';
pub const RECORD_SEPARATOR: char = '\u{001e}';

pub fn run_osascript(script: &str) -> Result<String, String> {
    let timeout = Duration::from_secs(12);
    let mut child = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to launch osascript: {error}"))?;

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("AppleScript timed out after {} seconds.", timeout.as_secs()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => return Err(format!("Failed while waiting for osascript: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to collect osascript output: {error}"))?;

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

pub fn is_application_running(app_name: &str) -> bool {
    Command::new("/usr/bin/pgrep")
        .args(["-x", app_name])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn run_applescript_without_launch(script: &str) -> Result<String, String> {
    run_osascript(script)
}

pub fn run_optional_applescript_fallback_only_if_running(
    app_name: &str,
    script: &str,
) -> Result<String, String> {
    if !is_application_running(app_name) {
        return Err(format!(
            "{app_name} AppleScript fallback is not available because {app_name} is not running. Adaptive Surface did not open it."
        ));
    }

    run_applescript_without_launch(script)
}

#[allow(dead_code)]
pub fn run_osascript_lines(script: &str) -> Result<Vec<String>, String> {
    let output = run_osascript(script)?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

#[allow(dead_code)]
pub fn run_osascript_records(script: &str) -> Result<Vec<Vec<String>>, String> {
    let output = run_osascript(script)?;
    Ok(output
        .split(RECORD_SEPARATOR)
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| {
            record
                .split(FIELD_SEPARATOR)
                .map(clean_field)
                .collect::<Vec<String>>()
        })
        .collect())
}

pub fn clean_field(value: &str) -> String {
    value
        .replace(FIELD_SEPARATOR, " ")
        .replace(RECORD_SEPARATOR, " ")
        .replace('\n', " ")
        .replace('\r', " ")
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
        .trim()
        .to_string()
}

pub fn optional_field(value: Option<&String>) -> Option<String> {
    value
        .map(|item| item.trim())
        .filter(|item| !item.is_empty() && *item != "missing value")
        .map(ToOwned::to_owned)
}

pub fn quote_applescript(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
