use crate::apple::applescript::{
    clean_field, optional_field, quote_applescript, run_optional_applescript_fallback_only_if_running,
    FIELD_SEPARATOR,
};
use crate::apple::models::{AppleMailMessage, AppleMailMessageDetail, MailQuery};
use crate::providers::provider_status::{ProviderError, ProviderErrorKind, ProviderStatus};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

const PROVIDER_NAME: &str = "EnvelopeIndexProvider";

pub fn status() -> ProviderStatus {
    let diagnostics = mail_metadata_diagnostics();
    if diagnostics.envelope_index_found {
        ProviderStatus::available(PROVIDER_NAME)
    } else {
        ProviderStatus::unavailable(
            PROVIDER_NAME,
            ProviderErrorKind::Unavailable,
            diagnostics.summary(),
        )
    }
}

pub fn list(query: MailQuery) -> Result<Vec<AppleMailMessage>, ProviderError> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let _unread_first = query.unread_first.unwrap_or(true);
    match load_mail_messages_from_envelope_index(limit) {
        Ok(messages) => Ok(messages),
        Err(envelope_error) => {
            let fallback = run_optional_applescript_fallback_only_if_running("Mail", &mail_script(limit));
            match fallback {
                Ok(output) => parse_mail_rows(run_osascript_records_from_output(&output)?, limit),
                Err(script_error) => Err(ProviderError::new(
                    "MailProviderChain",
                    ProviderErrorKind::Unavailable,
                    format!("{envelope_error}; AppleScript fallback also unavailable: {script_error}"),
                )),
            }
        }
    }
}

pub fn read(id: String) -> Result<AppleMailMessageDetail, ProviderError> {
    if let Some(message_id) = id.strip_prefix("mail-sqlite-") {
        return read_envelope_index_message(message_id, id.clone());
    }

    let output = run_optional_applescript_fallback_only_if_running("Mail", &read_mail_script(&id))
        .map_err(|error| ProviderError::new("MailAppleScriptProvider", ProviderErrorKind::Unavailable, error))?;
    let rows = run_osascript_records_from_output(&output)?;
    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| ProviderError::new("MailAppleScriptProvider", ProviderErrorKind::Unavailable, format!("No Mail message found for id {id}.")))?;

    Ok(AppleMailMessageDetail {
        id,
        mailbox: row.first().cloned().unwrap_or_else(|| "Inbox".to_string()),
        subject: row.get(1).cloned().unwrap_or_else(|| "(No subject)".to_string()),
        sender: row.get(2).cloned().unwrap_or_default(),
        received_at: optional_field(row.get(3)),
        is_read: row.get(4).map(|value| value == "true").unwrap_or(false),
        body: row.get(5).cloned().unwrap_or_default(),
    })
}

fn load_mail_messages_from_envelope_index(limit: usize) -> Result<Vec<AppleMailMessage>, String> {
    let diagnostics = mail_metadata_diagnostics();
    let index_path = diagnostics.envelope_index_path.clone().ok_or_else(|| diagnostics.summary())?;
    let query = format!(
        "select m.message_id, coalesce(s.subject,''), coalesce(a.address,''), datetime(m.date_received, 'unixepoch'), m.read, coalesce(mb.url,'') \
         from messages m \
         left join subjects s on s.ROWID=m.subject \
         left join addresses a on a.ROWID=m.sender \
         left join mailboxes mb on mb.ROWID=m.mailbox \
         where m.deleted=0 \
         order by m.date_received desc limit {limit};"
    );
    let output = Command::new("/usr/bin/sqlite3")
        .arg("-readonly")
        .arg("-separator")
        .arg(FIELD_SEPARATOR.to_string())
        .arg(index_path)
        .arg(query)
        .output()
        .map_err(|error| format!("Failed to launch sqlite3 for Apple Mail Envelope Index: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Apple Mail Envelope Index returned invalid UTF-8: {error}"))?;

    Ok(stdout
        .lines()
        .filter_map(|line| {
            let row = line.split(FIELD_SEPARATOR).map(clean_field).collect::<Vec<String>>();
            let message_id = row.first()?.trim();
            let subject = row.get(1).cloned().unwrap_or_default();
            let sender = row.get(2).cloned().unwrap_or_default();
            Some(AppleMailMessage {
                id: format!("mail-sqlite-{message_id}"),
                mailbox: row.get(5).cloned().unwrap_or_else(|| "Mail".to_string()),
                subject: if subject.is_empty() { "(No subject)".to_string() } else { subject },
                sender,
                received_at: optional_field(row.get(3)),
                is_read: row.get(4).map(|value| value == "1").unwrap_or(false),
                preview: Some("Metadata loaded from Apple Mail Envelope Index. Mail was not opened.".to_string()),
            })
        })
        .collect())
}

fn read_envelope_index_message(message_id: &str, id: String) -> Result<AppleMailMessageDetail, ProviderError> {
    let numeric_id = message_id
        .parse::<i64>()
        .map_err(|_| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, "Apple Mail Envelope Index id is invalid."))?;
    let diagnostics = mail_metadata_diagnostics();
    let index_path = diagnostics.envelope_index_path.clone().ok_or_else(|| {
        ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Unavailable, diagnostics.summary())
    })?;
    let query = format!(
        "select coalesce(s.subject,''), coalesce(a.address,''), datetime(m.date_received, 'unixepoch'), m.read, coalesce(mb.url,'') \
         from messages m \
         left join subjects s on s.ROWID=m.subject \
         left join addresses a on a.ROWID=m.sender \
         left join mailboxes mb on mb.ROWID=m.mailbox \
         where m.message_id={numeric_id} limit 1;"
    );
    let output = Command::new("/usr/bin/sqlite3")
        .arg("-readonly")
        .arg("-separator")
        .arg(FIELD_SEPARATOR.to_string())
        .arg(index_path)
        .arg(query)
        .output()
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Failed to launch sqlite3 for Apple Mail detail: {error}")))?;

    if !output.status.success() {
        return Err(ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, String::from_utf8_lossy(&output.stderr).trim()));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Adapter, format!("Apple Mail detail returned invalid UTF-8: {error}")))?;
    let row = stdout
        .lines()
        .next()
        .map(|line| line.split(FIELD_SEPARATOR).map(clean_field).collect::<Vec<String>>())
        .ok_or_else(|| ProviderError::new(PROVIDER_NAME, ProviderErrorKind::Unavailable, format!("No Apple Mail Envelope Index row found for id {message_id}.")))?;

    let body = find_emlx_body(message_id).unwrap_or_else(|| {
        "Full body was not found in local .emlx files. Metadata is loaded from the local Apple Mail Envelope Index; Mail was not opened.".to_string()
    });

    Ok(AppleMailMessageDetail {
        id,
        mailbox: row.get(4).cloned().unwrap_or_else(|| "Mail".to_string()),
        subject: row.first().cloned().unwrap_or_else(|| "(No subject)".to_string()),
        sender: row.get(1).cloned().unwrap_or_default(),
        received_at: optional_field(row.get(2)),
        is_read: row.get(3).map(|value| value == "1").unwrap_or(false),
        body,
    })
}

fn find_emlx_body(message_id: &str) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let mail_dir = PathBuf::from(home).join("Library/Mail");
    find_file_named(&mail_dir, &format!("{message_id}.emlx"), 0)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|contents| {
            let body = contents
                .lines()
                .skip_while(|line| !line.trim().is_empty())
                .skip(1)
                .take(800)
                .collect::<Vec<&str>>()
                .join("\n")
                .trim()
                .to_string();
            if body.is_empty() { None } else { Some(body) }
        })
}

fn find_file_named(dir: &Path, file_name: &str, depth: usize) -> Option<PathBuf> {
    if depth > 7 {
        return None;
    }
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().and_then(|value| value.to_str()) == Some(file_name) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_named(&path, file_name, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

#[derive(Default)]
struct MailMetadataDiagnostics {
    home_resolved: bool,
    home_path: Option<PathBuf>,
    library_mail_exists: bool,
    library_mail_readable: bool,
    v_folders: Vec<PathBuf>,
    mail_data_folders: Vec<PathBuf>,
    envelope_index_path: Option<PathBuf>,
    envelope_index_found: bool,
    read_error: Option<String>,
}

impl MailMetadataDiagnostics {
    fn summary(&self) -> String {
        format!(
            "Apple Mail local metadata unavailable. homeResolved={} homePath={} libraryMailExists={} libraryMailReadable={} vFoldersFound={} mailDataFound={} envelopeIndexFound={} readError={}. Adaptive Surface did not open Mail.",
            self.home_resolved,
            self.home_path.as_ref().map(|path| path.display().to_string()).unwrap_or_else(|| "(none)".to_string()),
            self.library_mail_exists,
            self.library_mail_readable,
            self.v_folders.len(),
            self.mail_data_folders.len(),
            self.envelope_index_found,
            self.read_error.clone().unwrap_or_else(|| "(none)".to_string())
        )
    }
}

fn mail_metadata_diagnostics() -> MailMetadataDiagnostics {
    let mut diagnostics = MailMetadataDiagnostics::default();
    let Ok(home) = std::env::var("HOME") else {
        diagnostics.read_error = Some("HOME is unavailable.".to_string());
        return diagnostics;
    };

    diagnostics.home_resolved = true;
    diagnostics.home_path = Some(PathBuf::from(&home));
    let mail_dir = PathBuf::from(home).join("Library/Mail");
    diagnostics.library_mail_exists = mail_dir.exists();

    let entries = match fs::read_dir(&mail_dir) {
        Ok(entries) => {
            diagnostics.library_mail_readable = true;
            entries
        }
        Err(error) => {
            diagnostics.read_error = Some(error.to_string());
            return diagnostics;
        }
    };

    let mut v_folders = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(|name| name.starts_with('V'))
                .unwrap_or(false)
        })
        .collect::<Vec<PathBuf>>();
    v_folders.sort();
    diagnostics.v_folders = v_folders.clone();

    diagnostics.mail_data_folders = v_folders
        .iter()
        .map(|path| path.join("MailData"))
        .filter(|path| path.is_dir())
        .collect();

    diagnostics.envelope_index_path = v_folders
        .into_iter()
        .rev()
        .flat_map(|path| {
            [
                path.join("MailData/Envelope Index"),
                path.join("MailData/Envelope Index-wal"),
                path.join("MailData/Protected Index"),
            ]
        })
        .find(|path| path.is_file() && path.file_name().and_then(|name| name.to_str()) == Some("Envelope Index"));
    diagnostics.envelope_index_found = diagnostics.envelope_index_path.is_some();
    diagnostics
}

fn parse_mail_rows(rows: Vec<Vec<String>>, limit: usize) -> Result<Vec<AppleMailMessage>, ProviderError> {
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let mailbox = row.first()?.trim().to_string();
            let subject = row.get(1)?.trim().to_string();
            let sender = row.get(2)?.trim().to_string();
            let received_at = optional_field(row.get(3));
            let is_read = row.get(4).map(|value| value == "true").unwrap_or(false);
            let preview = optional_field(row.get(5));
            let native_id = optional_field(row.get(6));

            if mailbox.is_empty() || (subject.is_empty() && sender.is_empty()) {
                return None;
            }

            let id = native_id.unwrap_or_else(|| stable_id(&[&mailbox, &subject, &sender, received_at.as_deref().unwrap_or("")]));

            Some(AppleMailMessage {
                id,
                mailbox,
                subject: if subject.is_empty() { "(No subject)".to_string() } else { subject },
                sender,
                received_at,
                is_read,
                preview,
            })
        })
        .take(limit)
        .collect())
}

fn run_osascript_records_from_output(output: &str) -> Result<Vec<Vec<String>>, ProviderError> {
    Ok(output
        .split(crate::apple::applescript::RECORD_SEPARATOR)
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| record.split(FIELD_SEPARATOR).map(clean_field).collect::<Vec<String>>())
        .collect())
}

fn mail_script(limit: usize) -> String {
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
tell application "Mail"
	set candidateMessages to {{}}
	try
		set inboxMessages to messages 1 thru maxRows of inbox
	on error
		set inboxMessages to messages of inbox
	end try
	repeat with msg in inboxMessages
		set end of candidateMessages to msg
		if (count of candidateMessages) >= maxRows then exit repeat
	end repeat
	repeat with msg in candidateMessages
		set mailboxName to "Inbox"
		set subjectText to ""
		set senderText to ""
		set receivedText to ""
		set readText to "false"
		set previewText to ""
		set nativeId to ""
		try
			set subjectText to subject of msg as text
		end try
		try
			set senderText to sender of msg as text
		end try
		try
			set receivedText to date received of msg as text
		end try
		try
			if read status of msg is true then set readText to "true"
		end try
		try
			set previewText to content of msg as text
			if (length of previewText) > 240 then set previewText to text 1 thru 240 of previewText
		end try
		try
			set nativeId to id of msg as text
		end try
		set end of outputRows to mailboxName & fieldSeparator & subjectText & fieldSeparator & senderText & fieldSeparator & receivedText & fieldSeparator & readText & fieldSeparator & previewText & fieldSeparator & nativeId
	end repeat
end tell
set AppleScript's text item delimiters to recordSeparator
set outputText to outputRows as text
set AppleScript's text item delimiters to ""
return outputText
"#
    )
}

fn read_mail_script(id: &str) -> String {
    let id = quote_applescript(id);
    format!(
        r#"
set fieldSeparator to ASCII character 31
set targetId to {id}
set outputText to ""
tell application "Mail"
	repeat with msg in messages of inbox
		set nativeId to ""
		try
			set nativeId to id of msg as text
		end try
		if nativeId is targetId then
			set outputText to "Inbox" & fieldSeparator & (subject of msg as text) & fieldSeparator & (sender of msg as text) & fieldSeparator & (date received of msg as text) & fieldSeparator & ((read status of msg) as text) & fieldSeparator & (content of msg as text)
			exit repeat
		end if
	end repeat
end tell
return outputText
"#
    )
}

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("mail-{:x}", hasher.finish())
}
