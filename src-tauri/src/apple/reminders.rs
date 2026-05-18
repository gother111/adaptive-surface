use super::applescript::{launch_application, optional_field, quote_applescript, run_osascript_records};
use super::models::{AppleCommandResult, AppleReminder, CreateReminderRequest, ReminderQuery, UpdateReminderRequest};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_reminders(query: ReminderQuery) -> Result<Vec<AppleReminder>, String> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let include_completed = query.include_completed.unwrap_or(false);
    launch_application("Reminders");
    let rows = run_osascript_records(&reminders_script(limit, include_completed))?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let title = row.first()?.trim().to_string();
            let list_name = row.get(1)?.trim().to_string();
            let due_at = optional_field(row.get(2));
            let completed = row.get(3).map(|value| value == "true").unwrap_or(false);
            let notes = optional_field(row.get(4));
            let native_id = optional_field(row.get(5));

            if title.is_empty() || list_name.is_empty() {
                return None;
            }

            let id = native_id.unwrap_or_else(|| stable_id(&[&list_name, &title, due_at.as_deref().unwrap_or("")]));
            Some(AppleReminder {
                id,
                title,
                list_name,
                due_at,
                completed,
                notes,
            })
        })
        .take(limit)
        .collect())
}

pub fn create_reminder(request: CreateReminderRequest) -> Result<AppleCommandResult, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("Reminder title is required.".to_string());
    }

    launch_application("Reminders");
    let rows = run_osascript_records(&create_reminder_script(&request))?;
    let id = rows
        .first()
        .and_then(|row| optional_field(row.first()))
        .unwrap_or_else(|| stable_id(&[request.list_name.as_deref().unwrap_or("Reminders"), title]));

    Ok(AppleCommandResult {
        id,
        ok: true,
        message: format!("Created reminder \"{title}\"."),
    })
}

pub fn update_reminder(request: UpdateReminderRequest) -> Result<AppleCommandResult, String> {
    launch_application("Reminders");
    let rows = run_osascript_records(&update_reminder_script(&request))?;
    let id = rows
        .first()
        .and_then(|row| optional_field(row.first()))
        .ok_or_else(|| format!("No reminder found for id {}.", request.id))?;

    Ok(AppleCommandResult {
        id,
        ok: true,
        message: "Updated reminder.".to_string(),
    })
}

fn reminders_script(limit: usize, include_completed: bool) -> String {
    let completion_filter = if include_completed {
        "true"
    } else {
        "completed of reminderRef is false"
    };
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
tell application "Reminders"
	repeat with listRef in lists
		repeat with reminderRef in reminders of listRef
			if {completion_filter} then
				set titleText to ""
				set listName to ""
				set dueText to ""
				set completedText to "false"
				set notesText to ""
				set nativeId to ""
				try
					set titleText to name of reminderRef as text
				end try
				try
					set listName to name of listRef as text
				end try
				try
					set dueText to due date of reminderRef as text
				end try
				try
					if completed of reminderRef is true then set completedText to "true"
				end try
				try
					set notesText to body of reminderRef as text
				end try
				try
					set nativeId to id of reminderRef as text
				end try
				set end of outputRows to titleText & fieldSeparator & listName & fieldSeparator & dueText & fieldSeparator & completedText & fieldSeparator & notesText & fieldSeparator & nativeId
				if (count of outputRows) >= maxRows then exit repeat
			end if
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

fn create_reminder_script(request: &CreateReminderRequest) -> String {
    let title = quote_applescript(&request.title);
    let list_name = quote_applescript(request.list_name.as_deref().unwrap_or(""));
    let notes = quote_applescript(request.notes.as_deref().unwrap_or(""));
    let due_clause = request
        .due_at
        .as_deref()
        .map(|due| format!(", due date:(date {})", quote_applescript(due)))
        .unwrap_or_default();
    format!(
        r#"
set outputText to ""
set requestedList to {list_name}
tell application "Reminders"
	set targetList to first list
	if requestedList is not "" then
		try
			set targetList to list requestedList
		end try
	end if
	tell targetList
		set createdReminder to make new reminder with properties {{name:{title}, body:{notes}{due_clause}}}
	end tell
	try
		set outputText to id of createdReminder as text
	end try
end tell
return outputText
"#
    )
}

fn update_reminder_script(request: &UpdateReminderRequest) -> String {
    let id = quote_applescript(&request.id);
    let completed_clause = request
        .completed
        .map(|completed| format!("set completed of reminderRef to {}", if completed { "true" } else { "false" }))
        .unwrap_or_default();
    let due_clause = request
        .due_at
        .as_deref()
        .map(|due| format!("set due date of reminderRef to date {}", quote_applescript(due)))
        .unwrap_or_default();
    format!(
        r#"
set targetId to {id}
set outputText to ""
tell application "Reminders"
	repeat with listRef in lists
		repeat with reminderRef in reminders of listRef
			set nativeId to ""
			try
				set nativeId to id of reminderRef as text
			end try
			if nativeId is targetId then
				{completed_clause}
				{due_clause}
				set outputText to nativeId
				exit repeat
			end if
		end repeat
		if outputText is not "" then exit repeat
	end repeat
end tell
return outputText
"#
    )
}

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("reminder-{:x}", hasher.finish())
}
