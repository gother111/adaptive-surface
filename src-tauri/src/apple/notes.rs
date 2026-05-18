use super::applescript::{launch_application, optional_field, quote_applescript, run_osascript_records};
use super::models::{AppleCommandResult, AppleNoteDetail, AppleNotePreview, CreateNoteRequest, NotesQuery};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_notes(query: NotesQuery) -> Result<Vec<AppleNotePreview>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let script = notes_script(limit);

    launch_application("Notes");
    let rows = run_osascript_records(&script)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let title = row.first()?.trim().to_string();
            let folder = row.get(1)?.trim().to_string();
            let created_at = optional_field(row.get(2));
            let modified_at = optional_field(row.get(3));
            let preview = optional_field(row.get(4));
            let native_id = optional_field(row.get(5));

            if title.is_empty() || folder.is_empty() {
                return None;
            }

            let id = native_id.unwrap_or_else(|| {
                stable_id(&[&folder, &title, modified_at.as_deref().unwrap_or("")])
            });

            Some(AppleNotePreview {
                id,
                title,
                folder,
                created_at,
                modified_at,
                preview,
            })
        })
        .take(limit)
        .collect())
}

pub fn read_note(id: String) -> Result<AppleNoteDetail, String> {
    launch_application("Notes");
    let rows = run_osascript_records(&read_note_script(&id))?;
    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| format!("No Apple Note found for id {id}."))?;

    Ok(AppleNoteDetail {
        id,
        title: row.first().cloned().unwrap_or_else(|| "Untitled note".to_string()),
        folder: row.get(1).cloned().unwrap_or_default(),
        created_at: optional_field(row.get(2)),
        modified_at: optional_field(row.get(3)),
        body: row.get(4).cloned().unwrap_or_default(),
    })
}

pub fn create_note(request: CreateNoteRequest) -> Result<AppleCommandResult, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("Note title is required.".to_string());
    }

    let body = request.body.unwrap_or_default();
    let folder_name = request.folder_name.unwrap_or_else(|| "Notes".to_string());
    launch_application("Notes");
    let rows = run_osascript_records(&create_note_script(title, &body, &folder_name))?;
    let id = rows
        .first()
        .and_then(|row| optional_field(row.first()))
        .unwrap_or_else(|| stable_id(&[&folder_name, title]));

    Ok(AppleCommandResult {
        id,
        ok: true,
        message: format!("Created note \"{title}\"."),
    })
}

fn notes_script(limit: usize) -> String {
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
tell application "Notes"
	repeat with folderRef in folders
		repeat with noteRef in notes of folderRef
			set titleText to ""
			set folderName to ""
			set createdText to ""
			set modifiedText to ""
			set previewText to ""
			set nativeId to ""
			try
				set titleText to name of noteRef as text
			end try
			try
				set folderName to name of folderRef as text
			end try
			try
				set createdText to creation date of noteRef as text
			end try
			try
				set modifiedText to modification date of noteRef as text
			end try
			try
				set previewText to plaintext of noteRef as text
				if (length of previewText) > 240 then set previewText to text 1 thru 240 of previewText
			end try
			try
				set nativeId to id of noteRef as text
			end try
			set end of outputRows to titleText & fieldSeparator & folderName & fieldSeparator & createdText & fieldSeparator & modifiedText & fieldSeparator & previewText & fieldSeparator & nativeId
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

fn read_note_script(id: &str) -> String {
    let quoted_id = quote_applescript(id);
    format!(
        r#"
set fieldSeparator to ASCII character 31
set targetId to {quoted_id}
set outputText to ""
tell application "Notes"
	repeat with folderRef in folders
		repeat with noteRef in notes of folderRef
			set nativeId to ""
			try
				set nativeId to id of noteRef as text
			end try
			if nativeId is targetId then
				set titleText to ""
				set folderName to ""
				set createdText to ""
				set modifiedText to ""
				set bodyText to ""
				try
					set titleText to name of noteRef as text
				end try
				try
					set folderName to name of folderRef as text
				end try
				try
					set createdText to creation date of noteRef as text
				end try
				try
					set modifiedText to modification date of noteRef as text
				end try
				try
					set bodyText to plaintext of noteRef as text
				end try
				set outputText to titleText & fieldSeparator & folderName & fieldSeparator & createdText & fieldSeparator & modifiedText & fieldSeparator & bodyText
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

fn create_note_script(title: &str, body: &str, folder_name: &str) -> String {
    let title = quote_applescript(title);
    let body = quote_applescript(body);
    let folder_name = quote_applescript(folder_name);
    format!(
        r#"
set fieldSeparator to ASCII character 31
set outputText to ""
tell application "Notes"
	set targetFolder to missing value
	try
		set targetFolder to folder {folder_name}
	end try
	if targetFolder is missing value then
		set targetFolder to first folder
	end if
	set createdNote to make new note at targetFolder with properties {{name:{title}, body:{body}}}
	set outputText to (id of createdNote as text)
end tell
return outputText
"#
    )
}

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("note-{:x}", hasher.finish())
}
