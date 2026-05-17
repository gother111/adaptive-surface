use super::applescript::{optional_field, run_osascript_records};
use super::models::{AppleCalendarEvent, CalendarQuery};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_calendar_events(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let days_ahead = query.days_ahead.unwrap_or(14).clamp(1, 365);
    let script = calendar_script(limit, days_ahead);

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

fn calendar_script(limit: usize, days_ahead: u32) -> String {
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
set endDate to (current date) + ({days_ahead} * days)
tell application "Calendar"
	repeat with cal in calendars
		repeat with evt in (every event of cal whose start date >= (current date) and start date <= endDate)
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

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("calendar-{:x}", hasher.finish())
}
