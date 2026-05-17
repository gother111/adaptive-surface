use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarQuery {
    pub days_ahead: Option<u32>,
    pub limit: Option<usize>,
}

impl Default for CalendarQuery {
    fn default() -> Self {
        Self {
            days_ahead: Some(14),
            limit: Some(25),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailQuery {
    pub limit: Option<usize>,
    pub unread_first: Option<bool>,
}

impl Default for MailQuery {
    fn default() -> Self {
        Self {
            limit: Some(25),
            unread_first: Some(true),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesQuery {
    pub limit: Option<usize>,
}

impl Default for NotesQuery {
    fn default() -> Self {
        Self { limit: Some(25) }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarEvent {
    pub id: String,
    pub title: String,
    pub calendar_name: String,
    pub start_at: String,
    pub end_at: Option<String>,
    pub location: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleMailMessage {
    pub id: String,
    pub mailbox: String,
    pub subject: String,
    pub sender: String,
    pub received_at: Option<String>,
    pub is_read: bool,
    pub preview: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleNotePreview {
    pub id: String,
    pub title: String,
    pub folder: String,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub preview: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleContextBundle {
    pub calendar_events: Vec<AppleCalendarEvent>,
    pub mail_messages: Vec<AppleMailMessage>,
    pub notes: Vec<AppleNotePreview>,
    pub warnings: Vec<AppleContextWarning>,
    pub loaded_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleContextWarning {
    pub source: AppleContextWarningSource,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppleContextWarningSource {
    Calendar,
    Mail,
    Notes,
    #[allow(dead_code)]
    System,
}
