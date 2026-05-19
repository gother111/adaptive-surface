use crate::apple::models::{AppleContact, ContactQuery};
use crate::providers::contacts_bridge;
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use serde::Deserialize;

const PROVIDER_NAME: &str = "ContactsFrameworkProvider";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeContact {
    id: String,
    display_name: String,
    emails: Vec<String>,
    phone_numbers: Vec<String>,
    organization: Option<String>,
}

pub fn status() -> ProviderStatus {
    contacts_bridge::contacts_status(PROVIDER_NAME)
}

pub fn search(query: ContactQuery) -> Result<Vec<AppleContact>, ProviderError> {
    let needle = query.query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let stdout = contacts_bridge::search_json(PROVIDER_NAME, needle, limit)?;
    let contacts: Vec<NativeContact> = serde_json::from_str(&stdout)
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Contacts provider returned invalid JSON: {error}")))?;
    Ok(contacts
        .into_iter()
        .map(|contact| AppleContact {
            id: contact.id,
            display_name: contact.display_name,
            emails: contact.emails,
            phone_numbers: contact.phone_numbers,
            organization: contact.organization,
        })
        .collect())
}
