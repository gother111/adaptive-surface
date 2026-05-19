use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_ulong};

#[link(name = "contacts_bridge", kind = "static")]
#[allow(dead_code)]
extern "C" {
    fn adaptive_contacts_status_json(error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_contacts_request_access_json(error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_contacts_search_json(query: *const c_char, limit: c_ulong, error_out: *mut *mut c_char) -> *mut c_char;
    fn adaptive_contacts_free(value: *mut c_char);
}

pub fn contacts_status(provider_name: &str) -> ProviderStatus {
    match contacts_status_json(provider_name) {
        Ok(json) => {
            if json.contains("\"authorized\":true") {
                ProviderStatus::available(provider_name)
            } else {
                ProviderStatus::unavailable(
                    provider_name,
                    ProviderErrorKind::Permission,
                    format!("Contacts provider is not authorized in the Adaptive Surface app process. status={json}"),
                )
            }
        }
        Err(error) => ProviderStatus::unavailable(provider_name, error.kind, error.exact_error),
    }
}

pub fn contacts_status_json(provider_name: &str) -> Result<String, ProviderError> {
    call_contacts_json(provider_name, |error| unsafe { adaptive_contacts_status_json(error) })
}

#[allow(dead_code)]
pub fn request_access_json(provider_name: &str) -> Result<String, ProviderError> {
    call_contacts_json(provider_name, |error| unsafe { adaptive_contacts_request_access_json(error) })
}

pub fn search_json(provider_name: &str, query: &str, limit: usize) -> Result<String, ProviderError> {
    let query = CString::new(query)
        .map_err(|_| ProviderError::new(provider_name, ProviderErrorKind::Adapter, "Contacts query contains an interior NUL byte."))?;
    call_contacts_json(provider_name, |error| unsafe {
        adaptive_contacts_search_json(query.as_ptr(), limit as c_ulong, error)
    })
}

fn call_contacts_json(
    provider_name: &str,
    call: impl FnOnce(*mut *mut c_char) -> *mut c_char,
) -> Result<String, ProviderError> {
    let mut error_ptr: *mut c_char = std::ptr::null_mut();
    let value_ptr = call(&mut error_ptr);

    if value_ptr.is_null() {
        let exact_error = read_and_free(error_ptr).unwrap_or_else(|| "Native Contacts bridge failed without details.".to_string());
        return Err(classify_contacts_error(provider_name, exact_error));
    }

    read_and_free(value_ptr).ok_or_else(|| {
        ProviderError::new(
            provider_name,
            ProviderErrorKind::Adapter,
            "Native Contacts bridge returned invalid UTF-8.",
        )
    })
}

fn read_and_free(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }

    let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() };
    unsafe { adaptive_contacts_free(ptr) };
    Some(value)
}

fn classify_contacts_error(provider_name: &str, exact_error: String) -> ProviderError {
    let lower = exact_error.to_lowercase();
    let kind = if lower.contains("permission") || lower.contains("not authorized") || lower.contains("denied") {
        ProviderErrorKind::Permission
    } else if lower.contains("timeout") {
        ProviderErrorKind::Timeout
    } else {
        ProviderErrorKind::Adapter
    };

    ProviderError::new(provider_name, kind, exact_error)
}
