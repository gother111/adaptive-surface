pub mod calendar_provider;
pub mod contacts_provider;
pub mod eventkit_bridge;
pub mod mail_provider;
pub mod notes_provider;
pub mod provider_status;
pub mod reminders_provider;

use provider_status::{ProviderError, ProviderErrorKind};
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const SWIFT_TIMEOUT: Duration = Duration::from_secs(12);

fn run_swift_helper(provider_name: &str, source: &str) -> Result<String, ProviderError> {
    let swift_path = "/usr/bin/swift";
    if !std::path::Path::new(swift_path).is_file() {
        return Err(ProviderError::new(
            provider_name,
            ProviderErrorKind::Unavailable,
            "The system Swift runtime is unavailable, so the native macOS provider cannot run.",
        ));
    }

    let helper_path = write_helper_source(provider_name, source)?;
    let mut child = Command::new(swift_path)
        .arg(&helper_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Failed to start Swift helper: {error}")))?;

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started_at.elapsed() >= SWIFT_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(&helper_path);
                return Err(ProviderError::new(
                    provider_name,
                    ProviderErrorKind::Timeout,
                    format!("Native provider timed out after {} seconds.", SWIFT_TIMEOUT.as_secs()),
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                let _ = fs::remove_file(&helper_path);
                return Err(ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Failed while waiting for Swift helper: {error}")));
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Failed to collect Swift helper output: {error}")))?;
    let _ = fs::remove_file(&helper_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(classify_provider_error(provider_name, stderr));
    }

    String::from_utf8(output.stdout)
        .map(|stdout| stdout.trim().to_string())
        .map_err(|error| ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Swift helper returned invalid UTF-8: {error}")))
}

fn write_helper_source(provider_name: &str, source: &str) -> Result<std::path::PathBuf, ProviderError> {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "adaptive-surface-{}-{}.swift",
        provider_name.replace(|ch: char| !ch.is_ascii_alphanumeric(), "-"),
        std::process::id()
    ));
    let mut file = fs::File::create(&path)
        .map_err(|error| ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Failed to create Swift helper: {error}")))?;
    file.write_all(source.as_bytes())
        .map_err(|error| ProviderError::new(provider_name, ProviderErrorKind::Adapter, format!("Failed to write Swift helper: {error}")))?;
    Ok(path)
}

fn classify_provider_error(provider_name: &str, stderr: String) -> ProviderError {
    let lower = stderr.to_lowercase();
    let kind = if lower.contains("permission") || lower.contains("not authorized") || lower.contains("denied") {
        ProviderErrorKind::Permission
    } else if lower.contains("unsupported") {
        ProviderErrorKind::Unsupported
    } else if lower.contains("unavailable") {
        ProviderErrorKind::Unavailable
    } else {
        ProviderErrorKind::Adapter
    };

    ProviderError::new(
        provider_name,
        kind,
        if stderr.is_empty() {
            "Native provider failed without stderr output.".to_string()
        } else {
            stderr
        },
    )
}
