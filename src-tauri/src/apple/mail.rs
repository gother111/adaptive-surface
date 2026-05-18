use super::models::{AppleMailMessage, AppleMailMessageDetail, MailQuery};
use crate::providers::mail_provider;

pub fn load_mail_messages(query: MailQuery) -> Result<Vec<AppleMailMessage>, String> {
    mail_provider::list(query).map_err(|error| error.message())
}

pub fn read_mail_message(id: String) -> Result<AppleMailMessageDetail, String> {
    mail_provider::read(id).map_err(|error| error.message())
}
