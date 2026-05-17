use super::applescript::{optional_field, run_osascript_records};
use super::models::{AppleNotePreview, NotesQuery};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_notes(query: NotesQuery) -> Result<Vec<AppleNotePreview>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let script = notes_script(limit);

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

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("note-{:x}", hasher.finish())
}
