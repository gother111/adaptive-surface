use crate::apple::applescript::{
    clean_field, optional_field, quote_applescript, run_optional_applescript_fallback_only_if_running, FIELD_SEPARATOR,
    RECORD_SEPARATOR,
};
use crate::apple::models::{AppleCommandResult, AppleNoteDetail, AppleNotePreview, CreateNoteRequest, NotesQuery};
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use std::path::PathBuf;

const PROVIDER_NAME: &str = "LocalNotesDatabaseProvider";

pub fn status() -> ProviderStatus {
    if notes_store_path().is_some() {
        ProviderStatus::unavailable(
            PROVIDER_NAME,
            ProviderErrorKind::Unsupported,
            "Local Notes store exists, but this milestone does not safely decode Apple's private Notes schema. Adaptive Surface did not open Notes.",
        )
    } else {
        ProviderStatus::unavailable(
            PROVIDER_NAME,
            ProviderErrorKind::Unavailable,
            "Local Notes store was not found. Adaptive Surface did not open Notes.",
        )
    }
}

pub fn list(query: NotesQuery) -> Result<Vec<AppleNotePreview>, ProviderError> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let rows = run_optional_applescript_fallback_only_if_running("Notes", &notes_script(limit))
        .map(|output| parse_records(&output))
        .map_err(|error| {
            ProviderError::new(
                "NotesProviderChain",
                ProviderErrorKind::Unavailable,
                format!("Local Notes database decoding is not safely implemented; AppleScript fallback unavailable: {error}"),
            )
        })?;
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

            Some(AppleNotePreview {
                id: native_id.unwrap_or_else(|| format!("note-{title}-{folder}")),
                title,
                folder,
                created_at,
                modified_at,
                preview,
            })
        })
        .collect())
}

pub fn read(id: String) -> Result<AppleNoteDetail, ProviderError> {
    let rows = run_optional_applescript_fallback_only_if_running("Notes", &read_note_script(&id))
        .map(|output| parse_records(&output))
        .map_err(|error| {
            ProviderError::new(
                "NotesProviderChain",
                ProviderErrorKind::Unavailable,
                format!("Full local Notes decoding is not safely implemented; AppleScript fallback unavailable: {error}"),
            )
        })?;
    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| ProviderError::new("NotesAppleScriptProvider", ProviderErrorKind::Unavailable, format!("No Apple Note found for id {id}.")))?;

    Ok(AppleNoteDetail {
        id,
        title: row.first().cloned().unwrap_or_else(|| "Untitled note".to_string()),
        folder: row.get(1).cloned().unwrap_or_default(),
        created_at: optional_field(row.get(2)),
        modified_at: optional_field(row.get(3)),
        body: row.get(4).cloned().unwrap_or_default(),
    })
}

pub fn create(request: CreateNoteRequest) -> Result<AppleCommandResult, ProviderError> {
    Err(ProviderError::new(
        "NotesProviderChain",
        ProviderErrorKind::Unsupported,
        format!(
            "Creating Notes without opening Notes is not implemented in this foundation pass. Requested title: {}. Body length: {}. Folder: {}. Nothing was sent to Notes.",
            request.title,
            request.body.as_deref().unwrap_or("").len(),
            request.folder_name.as_deref().unwrap_or("(default)")
        ),
    ))
}

fn notes_store_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    [
        "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite",
        "Library/Containers/com.apple.Notes/Data/Library/Notes/NotesV7.storedata",
    ]
    .iter()
    .map(|relative| PathBuf::from(&home).join(relative))
    .find(|path| path.is_file())
}

fn parse_records(output: &str) -> Vec<Vec<String>> {
    output
        .split(RECORD_SEPARATOR)
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| record.split(FIELD_SEPARATOR).map(clean_field).collect::<Vec<String>>())
        .collect()
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
				set outputText to (name of noteRef as text) & fieldSeparator & (name of folderRef as text) & fieldSeparator & (creation date of noteRef as text) & fieldSeparator & (modification date of noteRef as text) & fieldSeparator & (plaintext of noteRef as text)
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
