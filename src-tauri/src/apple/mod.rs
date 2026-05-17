pub mod applescript;
pub mod calendar;
pub mod contacts;
pub mod mail;
pub mod models;
pub mod notes;
pub mod permissions;
pub mod reminders;

use contacts::search_contacts as search_contacts_impl;
use calendar::load_calendar_events as load_calendar_events_impl;
use calendar::create_calendar_event as create_calendar_event_impl;
use mail::load_mail_messages as load_mail_messages_impl;
use mail::read_mail_message as read_mail_message_impl;
use models::{
    AppleContextBundle, AppleContextWarning, AppleContextWarningSource, CalendarQuery, ContactQuery,
    CreateCalendarEventRequest, CreateNoteRequest, CreateReminderRequest, MailQuery, NotesQuery,
    ReminderQuery, UpdateReminderRequest,
};
use notes::load_notes as load_notes_impl;
use notes::{create_note as create_note_impl, read_note as read_note_impl};
use permissions::capability_diagnostics as capability_diagnostics_impl;
use reminders::{create_reminder as create_reminder_impl, load_reminders as load_reminders_impl, update_reminder as update_reminder_impl};
use std::time::{SystemTime, UNIX_EPOCH};

pub use models::{
    AppleCalendarEvent, AppleCommandResult, AppleContact, AppleMailMessage, AppleMailMessageDetail,
    AppleNoteDetail, AppleNotePreview, AppleReminder, CapabilityDiagnostic,
};

#[tauri::command]
pub async fn load_calendar_events(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, String> {
    load_calendar_events_impl(query)
}

#[tauri::command]
pub async fn create_calendar_event(request: CreateCalendarEventRequest) -> Result<AppleCommandResult, String> {
    create_calendar_event_impl(request)
}

#[tauri::command]
pub async fn load_mail_messages(query: MailQuery) -> Result<Vec<AppleMailMessage>, String> {
    load_mail_messages_impl(query)
}

#[tauri::command]
pub async fn read_mail_message(id: String) -> Result<AppleMailMessageDetail, String> {
    read_mail_message_impl(id)
}

#[tauri::command]
pub async fn load_notes(query: NotesQuery) -> Result<Vec<AppleNotePreview>, String> {
    load_notes_impl(query)
}

#[tauri::command]
pub async fn read_note(id: String) -> Result<AppleNoteDetail, String> {
    read_note_impl(id)
}

#[tauri::command]
pub async fn create_note(request: CreateNoteRequest) -> Result<AppleCommandResult, String> {
    create_note_impl(request)
}

#[tauri::command]
pub async fn load_reminders(query: ReminderQuery) -> Result<Vec<AppleReminder>, String> {
    load_reminders_impl(query)
}

#[tauri::command]
pub async fn create_reminder(request: CreateReminderRequest) -> Result<AppleCommandResult, String> {
    create_reminder_impl(request)
}

#[tauri::command]
pub async fn update_reminder(request: UpdateReminderRequest) -> Result<AppleCommandResult, String> {
    update_reminder_impl(request)
}

#[tauri::command]
pub async fn search_contacts(query: ContactQuery) -> Result<Vec<AppleContact>, String> {
    search_contacts_impl(query)
}

#[tauri::command]
pub async fn load_capability_diagnostics() -> Result<Vec<CapabilityDiagnostic>, String> {
    Ok(capability_diagnostics_impl())
}

#[tauri::command]
pub async fn load_apple_context_bundle() -> Result<AppleContextBundle, String> {
    let mut warnings = Vec::new();

    let calendar_events = match load_calendar_events_impl(CalendarQuery::default()) {
        Ok(events) => events,
        Err(error) => {
            warnings.push(warning(AppleContextWarningSource::Calendar, error));
            Vec::new()
        }
    };

    let mail_messages = match load_mail_messages_impl(MailQuery::default()) {
        Ok(messages) => messages,
        Err(error) => {
            warnings.push(warning(AppleContextWarningSource::Mail, error));
            Vec::new()
        }
    };

    let notes = match load_notes_impl(NotesQuery::default()) {
        Ok(notes) => notes,
        Err(error) => {
            warnings.push(warning(AppleContextWarningSource::Notes, error));
            Vec::new()
        }
    };

    let reminders = match load_reminders_impl(ReminderQuery::default()) {
        Ok(reminders) => reminders,
        Err(error) => {
            warnings.push(warning(AppleContextWarningSource::Reminders, error));
            Vec::new()
        }
    };

    Ok(AppleContextBundle {
        calendar_events,
        mail_messages,
        notes,
        reminders,
        warnings,
        loaded_at: epoch_ms(),
    })
}

fn warning(source: AppleContextWarningSource, message: String) -> AppleContextWarning {
    AppleContextWarning { source, message }
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
