use crate::apple::models::{AppleCalendarEvent, AppleCommandResult, CalendarQuery, CreateCalendarEventRequest};
use crate::providers::eventkit_bridge;
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use crate::providers::run_swift_helper;
use serde::Deserialize;

const PROVIDER_NAME: &str = "EventKitCalendarProvider";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeCalendarEvent {
    id: String,
    title: String,
    calendar_name: String,
    start_at: String,
    end_at: Option<String>,
    location: Option<String>,
    notes: Option<String>,
}

pub fn status() -> ProviderStatus {
    eventkit_bridge::eventkit_status(false, PROVIDER_NAME)
}

pub fn list(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, ProviderError> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let days_ahead = query.days_ahead.unwrap_or(14).clamp(1, 365);
    let stdout = eventkit_bridge::calendar_events_json(days_ahead, limit)?;
    let events: Vec<NativeCalendarEvent> = serde_json::from_str(&stdout)
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Calendar provider returned invalid JSON: {error}")))?;
    Ok(events
        .into_iter()
        .map(|event| AppleCalendarEvent {
            id: event.id,
            title: event.title,
            calendar_name: event.calendar_name,
            start_at: event.start_at,
            end_at: event.end_at,
            location: event.location,
            notes: event.notes,
        })
        .collect())
}

pub fn create(request: CreateCalendarEventRequest) -> Result<AppleCommandResult, ProviderError> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err(ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Unsupported, "Calendar event title is required."));
    }

    let start = parse_date_for_provider(request.start_at.as_str())?;
    let end = request
        .end_at
        .as_deref()
        .map(parse_date_for_provider)
        .transpose()?
        .unwrap_or(start + 3600.0);
    let source = calendar_create_swift(title, start, end, request.calendar_name.as_deref(), request.notes.as_deref());
    let stdout = run_swift_helper(PROVIDER_NAME, &source)?;
    let id = stdout.trim().trim_matches('"').to_string();
    Ok(AppleCommandResult {
        id,
        ok: true,
        message: format!("Created calendar event \"{title}\" without opening Calendar."),
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
  fputs("unsupported date format; use yyyy-MM-dd HH:mm for native create actions\n", stderr)
  exit(2)
}}
"#,
        escape_swift(value)
    );
    let stdout = run_swift_helper(PROVIDER_NAME, &script)?;
    stdout
        .trim()
        .parse::<f64>()
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Calendar date parser returned invalid timestamp: {error}")))
}

fn calendar_create_swift(title: &str, start: f64, end: f64, calendar_name: Option<&str>, notes: Option<&str>) -> String {
    format!(
        r#"import EventKit
import Foundation

let store = EKEventStore()
let raw = EKEventStore.authorizationStatus(for: .event).rawValue
guard raw == 3 || raw == 4 else {{
  fputs("permission: Calendar write access is not authorized for Adaptive Surface\n", stderr)
  exit(3)
}}
let event = EKEvent(eventStore: store)
event.title = "{}"
event.startDate = Date(timeIntervalSince1970: {})
event.endDate = Date(timeIntervalSince1970: {})
event.notes = "{}"
let requestedCalendar = "{}"
if !requestedCalendar.isEmpty, let calendar = store.calendars(for: .event).first(where: {{ $0.title == requestedCalendar }}) {{
  event.calendar = calendar
}} else {{
  event.calendar = store.defaultCalendarForNewEvents
}}
try store.save(event, span: .thisEvent, commit: true)
print(event.eventIdentifier ?? "")
"#,
        escape_swift(title),
        start,
        end,
        escape_swift(notes.unwrap_or("")),
        escape_swift(calendar_name.unwrap_or(""))
    )
}

fn escape_swift(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
