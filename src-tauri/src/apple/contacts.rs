use super::models::{AppleContact, ContactQuery};
use crate::providers::contacts_provider;

pub fn search_contacts(query: ContactQuery) -> Result<Vec<AppleContact>, String> {
    contacts_provider::search(query).map_err(|error| error.message())
}
