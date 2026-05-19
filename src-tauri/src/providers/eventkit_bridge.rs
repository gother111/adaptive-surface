use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use std::ffi::CStr;
use std::os::raw::{c_char, c_ulong};

#[link(name = "eventkit_bridge", kind = "static")]
extern "C" {
    fn adaptive_calendar_events_json(days_ahead: u32, limit: c_ulong, error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_reminders_json(include_completed: bool, limit: c_ulong, error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_eventkit_status_json(reminders: bool, error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_eventkit_free(value: *mut c_char);
}

pub fn calendar_events_json(days_ahead: u32, limit: usize) -> Result<String, ProviderError> {
    call_eventkit_json("EventKitCalendarProvider", |error| unsafe {
        adaptive_calendar_events_json(days_ahead, limit as c_ulong, error)
    })
}

pub fn reminders_json(include_completed: bool, limit: usize) -> Result<String, ProviderError> {
    call_eventkit_json("EventKitRemindersProvider", |error| unsafe {
        adaptive_reminders_json(include_completed, limit as c_ulong, error)
    })
}

pub fn eventkit_status(reminders: bool, provider_name: &str) -> ProviderStatus {
    match eventkit_status_json(reminders, provider_name) {
        Ok(json) => {
            let authorized = json.contains("\"authorized\":true");
            if authorized {
                ProviderStatus::available(provider_name)
            } else {
                ProviderStatus::unavailable(
                    provider_name,
                    ProviderErrorKind::Permission,
                    format!("EventKit provider is not authorized in the Adaptive Surface app process. status={json}"),
                )
            }
        }
        Err(error) => ProviderStatus::unavailable(provider_name, error.kind, error.exact_error),
    }
}

pub fn eventkit_status_json(reminders: bool, provider_name: &str) -> Result<String, ProviderError> {
    call_eventkit_json(provider_name, |error| unsafe { adaptive_eventkit_status_json(reminders, error) })
}

fn call_eventkit_json(
    provider_name: &str,
    call: impl FnOnce(*mut *mut c_char) -> *mut c_char,
) -> Result<String, ProviderError> {
    let mut error_ptr: *mut c_char = std::ptr::null_mut();
    let value_ptr = call(&mut error_ptr);

    if value_ptr.is_null() {
        let exact_error = read_and_free(error_ptr).unwrap_or_else(|| "Native EventKit bridge failed without details.".to_string());
        return Err(classify_eventkit_error(provider_name, exact_error));
    }

    read_and_free(value_ptr).ok_or_else(|| {
        ProviderError::new(
            provider_name,
            ProviderErrorKind::Adapter,
            "Native EventKit bridge returned invalid UTF-8.",
        )
    })
}

fn read_and_free(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }

    let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() };
    unsafe { adaptive_eventkit_free(ptr) };
    Some(value)
}

fn classify_eventkit_error(provider_name: &str, exact_error: String) -> ProviderError {
    let lower = exact_error.to_lowercase();
    let kind = if lower.contains("permission") || lower.contains("not authorized") || lower.contains("not granted") {
        ProviderErrorKind::Permission
    } else if lower.contains("timeout") {
        ProviderErrorKind::Timeout
    } else {
        ProviderErrorKind::Adapter
    };

    ProviderError::new(provider_name, kind, exact_error)
}
