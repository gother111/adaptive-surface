use crate::apple::models::{AppleContact, ContactQuery};
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use crate::providers::run_swift_helper;
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
    match run_swift_helper(PROVIDER_NAME, CONTACTS_STATUS_SWIFT) {
        Ok(_) => ProviderStatus::available(PROVIDER_NAME),
        Err(error) => ProviderStatus::unavailable(PROVIDER_NAME, error.kind, error.exact_error),
    }
}

pub fn search(query: ContactQuery) -> Result<Vec<AppleContact>, ProviderError> {
    let needle = query.query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let source = contacts_search_swift(needle, limit);
    let stdout = run_swift_helper(PROVIDER_NAME, &source)?;
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

fn contacts_search_swift(query: &str, limit: usize) -> String {
    format!(
        r#"import Contacts
import Foundation

let raw = CNContactStore.authorizationStatus(for: .contacts).rawValue
guard raw == 3 else {{
  fputs("permission: Contacts access is not authorized for Adaptive Surface\n", stderr)
  exit(3)
}}
let store = CNContactStore()
let keys: [CNKeyDescriptor] = [
  CNContactIdentifierKey as CNKeyDescriptor,
  CNContactGivenNameKey as CNKeyDescriptor,
  CNContactFamilyNameKey as CNKeyDescriptor,
  CNContactOrganizationNameKey as CNKeyDescriptor,
  CNContactEmailAddressesKey as CNKeyDescriptor,
  CNContactPhoneNumbersKey as CNKeyDescriptor
]
let request = CNContactFetchRequest(keysToFetch: keys)
let query = "{}".lowercased()
var rows: [[String: Any]] = []
try store.enumerateContacts(with: request) {{ contact, stop in
  let displayName = [contact.givenName, contact.familyName].filter {{ !$0.isEmpty }}.joined(separator: " ")
  let emails = contact.emailAddresses.map {{ String($0.value) }}
  let phones = contact.phoneNumbers.map {{ $0.value.stringValue }}
  let haystack = ([displayName, contact.organizationName] + emails + phones).joined(separator: " ").lowercased()
  if haystack.contains(query) {{
    rows.append([
      "id": contact.identifier,
      "displayName": displayName.isEmpty ? contact.organizationName : displayName,
      "emails": emails,
      "phoneNumbers": phones,
      "organization": contact.organizationName.isEmpty ? NSNull() : contact.organizationName
    ])
    if rows.count >= {limit} {{
      stop.pointee = true
    }}
  }}
}}
let data = try JSONSerialization.data(withJSONObject: rows)
print(String(data: data, encoding: .utf8)!)
"#,
        escape_swift(query)
    )
}

const CONTACTS_STATUS_SWIFT: &str = r#"import Contacts
import Foundation
let raw = CNContactStore.authorizationStatus(for: .contacts).rawValue
guard raw == 3 else {
  fputs("permission: Contacts access is not authorized for Adaptive Surface\n", stderr)
  exit(3)
}
print("available")
"#;

fn escape_swift(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
