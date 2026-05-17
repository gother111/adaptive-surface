use super::applescript::{optional_field, quote_applescript, run_osascript_records};
use super::models::{AppleMailMessage, AppleMailMessageDetail, MailQuery};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn load_mail_messages(query: MailQuery) -> Result<Vec<AppleMailMessage>, String> {
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let unread_first = query.unread_first.unwrap_or(true);
    let script = mail_script(limit, unread_first);

    let rows = run_osascript_records(&script)?;
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

fn mail_script(limit: usize, unread_first: bool) -> String {
    let message_source = if unread_first {
        r#"
set candidateMessages to {}
set unreadMessages to (messages of inbox whose read status is false)
repeat with msg in unreadMessages
	set end of candidateMessages to msg
	if (count of candidateMessages) >= maxRows then exit repeat
end repeat
if (count of candidateMessages) < maxRows then
	repeat with msg in messages of inbox
		if read status of msg is true then
			set end of candidateMessages to msg
			if (count of candidateMessages) >= maxRows then exit repeat
		end if
	end repeat
end if
"#
    } else {
        r#"
set candidateMessages to {}
repeat with msg in messages of inbox
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
