use super::applescript::{launch_application, optional_field, quote_applescript, run_osascript_records};
use super::models::{AppleMailMessage, AppleMailMessageDetail, MailQuery};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::process::Command;

pub fn load_mail_messages(query: MailQuery) -> Result<Vec<AppleMailMessage>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let unread_first = query.unread_first.unwrap_or(true);
    let script = mail_script(limit, unread_first);

    launch_application("Mail");
    let rows = match run_osascript_records(&script) {
        Ok(rows) => rows,
        Err(error) => {
            return load_mail_messages_from_envelope_index(limit)
                .map_err(|fallback_error| format!("{error}; Envelope Index fallback also failed: {fallback_error}"));
        }
    };
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

            let id = native_id.unwrap_or_else(|| {
                stable_id(&[
                    &mailbox,
                    &subject,
                    &sender,
                    received_at.as_deref().unwrap_or(""),
                ])
            });

            Some(AppleMailMessage {
                id,
                mailbox,
                subject: if subject.is_empty() {
                    "(No subject)".to_string()
                } else {
                    subject
                },
                sender,
                received_at,
                is_read,
                preview,
            })
        })
        .take(limit)
        .collect())
}

pub fn read_mail_message(id: String) -> Result<AppleMailMessageDetail, String> {
    if let Some(message_id) = id.strip_prefix("mail-sqlite-") {
        return read_envelope_index_message(message_id, id.clone());
    }

    launch_application("Mail");
    let rows = run_osascript_records(&read_mail_script(&id))?;
    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| format!("No Mail message found for id {id}."))?;

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
    let index_path = envelope_index_path().ok_or_else(|| "Apple Mail Envelope Index was not found.".to_string())?;
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
        .arg(super::applescript::FIELD_SEPARATOR.to_string())
        .arg(index_path)
        .arg(query)
        .output()
        .map_err(|error| format!("Failed to launch sqlite3 for Apple Mail fallback: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Apple Mail fallback returned invalid UTF-8: {error}"))?;

    Ok(stdout
        .lines()
        .filter_map(|line| {
            let row = line
                .split(super::applescript::FIELD_SEPARATOR)
                .map(super::applescript::clean_field)
                .collect::<Vec<String>>();
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
                preview: Some("Loaded from Apple Mail Envelope Index fallback.".to_string()),
            })
        })
        .collect())
}

fn read_envelope_index_message(message_id: &str, id: String) -> Result<AppleMailMessageDetail, String> {
    let message_id = message_id
        .parse::<i64>()
        .map_err(|_| "Apple Mail Envelope Index id is invalid.".to_string())?;
    let index_path = envelope_index_path().ok_or_else(|| "Apple Mail Envelope Index was not found.".to_string())?;
    let query = format!(
        "select coalesce(s.subject,''), coalesce(a.address,''), datetime(m.date_received, 'unixepoch'), m.read, coalesce(mb.url,'') \
         from messages m \
         left join subjects s on s.ROWID=m.subject \
         left join addresses a on a.ROWID=m.sender \
         left join mailboxes mb on mb.ROWID=m.mailbox \
         where m.message_id={message_id} limit 1;"
    );
    let output = Command::new("/usr/bin/sqlite3")
        .arg("-readonly")
        .arg("-separator")
        .arg(super::applescript::FIELD_SEPARATOR.to_string())
        .arg(index_path)
        .arg(query)
        .output()
        .map_err(|error| format!("Failed to launch sqlite3 for Apple Mail detail fallback: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Apple Mail detail fallback returned invalid UTF-8: {error}"))?;
    let row = stdout
        .lines()
        .next()
        .map(|line| line.split(super::applescript::FIELD_SEPARATOR).map(super::applescript::clean_field).collect::<Vec<String>>())
        .ok_or_else(|| format!("No Apple Mail Envelope Index row found for id {message_id}."))?;

    Ok(AppleMailMessageDetail {
        id,
        mailbox: row.get(4).cloned().unwrap_or_else(|| "Mail".to_string()),
        subject: row.first().cloned().unwrap_or_else(|| "(No subject)".to_string()),
        sender: row.get(1).cloned().unwrap_or_default(),
        received_at: optional_field(row.get(2)),
        is_read: row.get(3).map(|value| value == "1").unwrap_or(false),
        body: "Full body was not accessible through AppleScript before timeout. Metadata is loaded from the local Apple Mail Envelope Index; grant/repair Mail Automation access for full body reads.".to_string(),
    })
}

fn envelope_index_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let mail_dir = PathBuf::from(home).join("Library/Mail");
    let mut candidates = fs::read_dir(mail_dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(|name| name.starts_with('V'))
                .unwrap_or(false)
        })
        .collect::<Vec<PathBuf>>();
    candidates.sort();
    candidates
        .into_iter()
        .rev()
        .map(|path| path.join("MailData/Envelope Index"))
        .find(|path| path.is_file())
}

fn mail_script(limit: usize, unread_first: bool) -> String {
    let message_source = if unread_first {
        r#"
set candidateMessages to {}
try
	set inboxMessages to messages 1 thru maxRows of inbox
on error
	set inboxMessages to messages of inbox
end try
repeat with msg in inboxMessages
	set end of candidateMessages to msg
	if (count of candidateMessages) >= maxRows then exit repeat
end repeat
"#
    } else {
        r#"
set candidateMessages to {}
try
	set inboxMessages to messages 1 thru maxRows of inbox
on error
	set inboxMessages to messages of inbox
end try
repeat with msg in inboxMessages
	set end of candidateMessages to msg
	if (count of candidateMessages) >= maxRows then exit repeat
end repeat
"#
    };

    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set outputRows to {{}}
set maxRows to {limit}
tell application "Mail"
	{message_source}
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
			if (length of previewText) > 220 then set previewText to text 1 thru 220 of previewText
		end try
		try
			set nativeId to message id of msg as text
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
    let quoted_id = quote_applescript(id);
    format!(
        r#"
set fieldSeparator to ASCII character 31
set targetId to {quoted_id}
set outputText to ""
tell application "Mail"
	repeat with msg in messages of inbox
		set nativeId to ""
		try
			set nativeId to message id of msg as text
		end try
		if nativeId is targetId then
			set subjectText to ""
			set senderText to ""
			set receivedText to ""
			set readText to "false"
			set bodyText to ""
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
				set bodyText to content of msg as text
			end try
			set outputText to "Inbox" & fieldSeparator & subjectText & fieldSeparator & senderText & fieldSeparator & receivedText & fieldSeparator & readText & fieldSeparator & bodyText
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
