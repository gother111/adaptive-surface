pub mod applescript;
pub mod calendar;
pub mod mail;
pub mod models;
pub mod notes;

use calendar::load_calendar_events as load_calendar_events_impl;
use mail::load_mail_messages as load_mail_messages_impl;
use models::{
    AppleContextBundle, AppleContextWarning, AppleContextWarningSource, CalendarQuery, MailQuery,
    NotesQuery,
};
use notes::load_notes as load_notes_impl;
use std::time::{SystemTime, UNIX_EPOCH};

pub use models::{
    AppleCalendarEvent, AppleMailMessage, AppleNotePreview,
};

#[tauri::command]
pub async fn load_calendar_events(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, String> {
    load_calendar_events_impl(query)
}

#[tauri::command]
pub async fn load_mail_messages(query: MailQuery) -> Result<Vec<AppleMailMessage>, String> {
    load_mail_messages_impl(query)
}

#[tauri::command]
pub async fn load_notes(query: NotesQuery) -> Result<Vec<AppleNotePreview>, String> {
    load_notes_impl(query)
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

    Ok(AppleContextBundle {
        calendar_events,
        mail_messages,
        notes,
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
