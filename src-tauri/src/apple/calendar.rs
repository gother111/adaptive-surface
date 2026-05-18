use super::applescript::{launch_application, optional_field, quote_applescript, run_osascript_records};
use super::models::{AppleCalendarEvent, AppleCommandResult, CalendarQuery, CreateCalendarEventRequest};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_calendar_events(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let days_ahead = query.days_ahead.unwrap_or(14).clamp(1, 365);
    let script = calendar_script(limit, days_ahead);

    launch_application("Calendar");
    let rows = run_osascript_records(&script)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let title = row.first()?.trim().to_string();
            let calendar_name = row.get(1)?.trim().to_string();
            let start_at = row.get(2)?.trim().to_string();

            if title.is_empty() || calendar_name.is_empty() || start_at.is_empty() {
                return None;
            }

            let native_id = optional_field(row.get(6));
            let id = native_id.unwrap_or_else(|| stable_id(&[&calendar_name, &title, &start_at]));

            Some(AppleCalendarEvent {
                id,
                title,
                calendar_name,
                start_at,
                end_at: optional_field(row.get(3)),
                location: optional_field(row.get(4)),
                notes: optional_field(row.get(5)),
            })
        })
        .take(limit)
        .collect())
}

pub fn create_calendar_event(request: CreateCalendarEventRequest) -> Result<AppleCommandResult, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("Calendar event title is required.".to_string());
    }

    launch_application("Calendar");
    let rows = run_osascript_records(&create_calendar_event_script(&request))?;
    let id = rows
        .first()
        .and_then(|row| optional_field(row.first()))
        .unwrap_or_else(|| stable_id(&[request.calendar_name.as_deref().unwrap_or("Calendar"), title, &request.start_at]));

    Ok(AppleCommandResult {
        id,
        ok: true,
        message: format!("Created calendar event \"{title}\"."),
    })
}

fn calendar_script(limit: usize, days_ahead: u32) -> String {
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
set startDate to current date
set time of startDate to 0
set endDate to startDate + ({days_ahead} * days)
tell application "Calendar"
	repeat with cal in calendars
		repeat with evt in (every event of cal whose start date >= startDate and start date < endDate)
			set eventTitle to ""
			set calendarName to ""
			set startText to ""
			set endText to ""
			set locationText to ""
			set notesText to ""
			set nativeId to ""
			try
				set eventTitle to summary of evt as text
			end try
			try
				set calendarName to name of cal as text
			end try
			try
				set startText to start date of evt as text
			end try
			try
				set endText to end date of evt as text
			end try
			try
				set locationText to location of evt as text
			end try
			try
				set notesText to description of evt as text
			end try
			try
				set nativeId to uid of evt as text
			end try
			set end of outputRows to eventTitle & fieldSeparator & calendarName & fieldSeparator & startText & fieldSeparator & endText & fieldSeparator & locationText & fieldSeparator & notesText & fieldSeparator & nativeId
			if (count of outputRows) >= maxRows then exit repeat
		end repeat
		if (count of outputRows) >= maxRows then exit repeat
	end repeat
end tell
set AppleScript's text item delimiters to recordSeparator
set outputText to outputRows as text
set AppleScript's text item delimiters to ""
return outputText
"#
    )
}

fn create_calendar_event_script(request: &CreateCalendarEventRequest) -> String {
    let title = quote_applescript(&request.title);
    let start_at = quote_applescript(&request.start_at);
    let end_at = quote_applescript(request.end_at.as_deref().unwrap_or(&request.start_at));
    let notes = quote_applescript(request.notes.as_deref().unwrap_or(""));
    let calendar_name = quote_applescript(request.calendar_name.as_deref().unwrap_or(""));
    format!(
        r#"
set fieldSeparator to ASCII character 31
set outputText to ""
set requestedCalendar to {calendar_name}
tell application "Calendar"
	set targetCalendar to first calendar
	if requestedCalendar is not "" then
		try
			set targetCalendar to calendar requestedCalendar
		end try
	end if
	set startDate to date {start_at}
	set endDate to date {end_at}
	if endDate is not greater than startDate then set endDate to startDate + (60 * minutes)
	tell targetCalendar
		set createdEvent to make new event with properties {{summary:{title}, start date:startDate, end date:endDate, description:{notes}}}
	end tell
	try
		set outputText to uid of createdEvent as text
	end try
end tell
return outputText
"#
    )
}

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("calendar-{:x}", hasher.finish())
}
