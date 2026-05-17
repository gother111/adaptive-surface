use std::process::Command;

pub const FIELD_SEPARATOR: char = '\u{001f}';
pub const RECORD_SEPARATOR: char = '\u{001e}';

pub fn run_osascript(script: &str) -> Result<String, String> {
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
