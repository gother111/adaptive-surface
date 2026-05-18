use super::models::{AppleCommandResult, AppleReminder, CreateReminderRequest, ReminderQuery, UpdateReminderRequest};
use crate::providers::reminders_provider;

pub fn load_reminders(query: ReminderQuery) -> Result<Vec<AppleReminder>, String> {
    reminders_provider::list(query).map_err(|error| error.message())
}

pub fn create_reminder(request: CreateReminderRequest) -> Result<AppleCommandResult, String> {
    reminders_provider::create(request).map_err(|error| error.message())
}

pub fn update_reminder(request: UpdateReminderRequest) -> Result<AppleCommandResult, String> {
    reminders_provider::update(request).map_err(|error| error.message())
}
