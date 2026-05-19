use crate::apple::models::{AppleCommandResult, AppleReminder, CreateReminderRequest, ReminderQuery, UpdateReminderRequest};
use crate::providers::eventkit_bridge;
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use crate::providers::run_swift_helper;
use serde::Deserialize;

const PROVIDER_NAME: &str = "EventKitRemindersProvider";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeReminder {
    id: String,
    title: String,
    list_name: String,
    due_at: Option<String>,
    completed: bool,
    notes: Option<String>,
}

pub fn status() -> ProviderStatus {
    eventkit_bridge::eventkit_status(true, PROVIDER_NAME)
}

pub fn list(query: ReminderQuery) -> Result<Vec<AppleReminder>, ProviderError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let include_completed = query.include_completed.unwrap_or(false);
    let stdout = eventkit_bridge::reminders_json(include_completed, limit)?;
    let reminders: Vec<NativeReminder> = serde_json::from_str(&stdout)
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Reminders provider returned invalid JSON: {error}")))?;
    Ok(reminders
        .into_iter()
        .map(|reminder| AppleReminder {
            id: reminder.id,
            title: reminder.title,
            list_name: reminder.list_name,
            due_at: reminder.due_at,
            completed: reminder.completed,
            notes: reminder.notes,
        })
        .collect())
}

pub fn create(request: CreateReminderRequest) -> Result<AppleCommandResult, ProviderError> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err(ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Unsupported, "Reminder title is required."));
    }
    let due = request.due_at.as_deref().map(parse_date_for_provider).transpose()?;
    let source = reminders_create_swift(title, due, request.list_name.as_deref(), request.notes.as_deref());
    let stdout = run_swift_helper(PROVIDER_NAME, &source)?;
    let id = stdout.trim().trim_matches('"').to_string();
    Ok(AppleCommandResult {
        id,
        ok: true,
        message: format!("Created reminder \"{title}\" without opening Reminders."),
    })
}

pub fn update(request: UpdateReminderRequest) -> Result<AppleCommandResult, ProviderError> {
    let due = request.due_at.as_deref().map(parse_date_for_provider).transpose()?;
    let source = reminders_update_swift(&request.id, due, request.completed);
    let stdout = run_swift_helper(PROVIDER_NAME, &source)?;
    let id = stdout.trim().trim_matches('"').to_string();
    Ok(AppleCommandResult {
        id,
        ok: true,
        message: "Updated reminder without opening Reminders.".to_string(),
    })
}

fn parse_date_for_provider(value: &str) -> Result<f64, ProviderError> {
    let script = format!(
        r#"import Foundation
let formatter = DateFormatter()
formatter.locale = Locale(identifier: "en_US_POSIX")
formatter.dateFormat = "yyyy-MM-dd HH:mm"
if let date = formatter.date(from: "{}") {{
  print(date.timeIntervalSince1970)
}} else {{
  fputs("unsupported date format; use yyyy-MM-dd HH:mm for native reminder actions\n", stderr)
  exit(2)
}}
"#,
        escape_swift(value)
    );
    let stdout = run_swift_helper(PROVIDER_NAME, &script)?;
    stdout
        .trim()
        .parse::<f64>()
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Reminder date parser returned invalid timestamp: {error}")))
}

fn reminders_create_swift(title: &str, due: Option<f64>, list_name: Option<&str>, notes: Option<&str>) -> String {
    let due_block = due
        .map(|timestamp| format!("reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: Date(timeIntervalSince1970: {timestamp}))"))
        .unwrap_or_default();
    format!(
        r#"import EventKit
import Foundation

let store = EKEventStore()
let raw = EKEventStore.authorizationStatus(for: .reminder).rawValue
guard raw == 3 || raw == 4 else {{
  fputs("permission: Reminders write access is not authorized for Adaptive Surface\n", stderr)
  exit(3)
}}
let reminder = EKReminder(eventStore: store)
reminder.title = "{}"
reminder.notes = "{}"
let requestedList = "{}"
if !requestedList.isEmpty, let calendar = store.calendars(for: .reminder).first(where: {{ $0.title == requestedList }}) {{
  reminder.calendar = calendar
}} else {{
  reminder.calendar = store.defaultCalendarForNewReminders()
}}
{}
try store.save(reminder, commit: true)
print(reminder.calendarItemIdentifier)
"#,
        escape_swift(title),
        escape_swift(notes.unwrap_or("")),
        escape_swift(list_name.unwrap_or("")),
        due_block
    )
}

fn reminders_update_swift(id: &str, due: Option<f64>, completed: Option<bool>) -> String {
    let due_block = due
        .map(|timestamp| format!("reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: Date(timeIntervalSince1970: {timestamp}))"))
        .unwrap_or_default();
    let completed_block = completed
        .map(|value| format!("reminder.isCompleted = {}", if value { "true" } else { "false" }))
        .unwrap_or_default();
    format!(
        r#"import EventKit
import Foundation

let store = EKEventStore()
let raw = EKEventStore.authorizationStatus(for: .reminder).rawValue
guard raw == 3 || raw == 4 else {{
  fputs("permission: Reminders update access is not authorized for Adaptive Surface\n", stderr)
  exit(3)
}}
guard let reminder = store.calendarItem(withIdentifier: "{}") as? EKReminder else {{
  fputs("unavailable: reminder not found\n", stderr)
  exit(4)
}}
{}
{}
try store.save(reminder, commit: true)
print(reminder.calendarItemIdentifier)
"#,
        escape_swift(id),
        due_block,
        completed_block
    )
}

fn escape_swift(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
