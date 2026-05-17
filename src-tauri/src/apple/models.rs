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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderQuery {
    pub limit: Option<usize>,
    pub include_completed: Option<bool>,
}

impl Default for ReminderQuery {
    fn default() -> Self {
        Self {
            limit: Some(50),
            include_completed: Some(false),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactQuery {
    pub query: String,
    pub limit: Option<usize>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCalendarEventRequest {
    pub title: String,
    pub start_at: String,
    pub end_at: Option<String>,
    pub calendar_name: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderRequest {
    pub title: String,
    pub due_at: Option<String>,
    pub list_name: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderRequest {
    pub id: String,
    pub due_at: Option<String>,
    pub completed: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub title: String,
    pub body: Option<String>,
    pub folder_name: Option<String>,
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
pub struct AppleMailMessageDetail {
    pub id: String,
    pub mailbox: String,
    pub subject: String,
    pub sender: String,
    pub received_at: Option<String>,
    pub is_read: bool,
    pub body: String,
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
pub struct AppleNoteDetail {
    pub id: String,
    pub title: String,
    pub folder: String,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub body: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleReminder {
    pub id: String,
    pub title: String,
    pub list_name: String,
    pub due_at: Option<String>,
    pub completed: bool,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleContact {
    pub id: String,
    pub display_name: String,
    pub emails: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub organization: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCommandResult {
    pub id: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleContextBundle {
    pub calendar_events: Vec<AppleCalendarEvent>,
    pub mail_messages: Vec<AppleMailMessage>,
    pub notes: Vec<AppleNotePreview>,
    pub reminders: Vec<AppleReminder>,
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
    Reminders,
    #[allow(dead_code)]
    Contacts,
    #[allow(dead_code)]
    System,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDiagnostic {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub status: String,
    pub supported_operations: Vec<String>,
    pub last_checked_at: u64,
    pub last_error: Option<String>,
    pub permission_instructions: String,
    pub test_command_examples: Vec<String>,
    pub works: Vec<String>,
    pub does_not_work: Vec<String>,
}
