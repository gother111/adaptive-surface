use super::applescript::{launch_application, quote_applescript, run_osascript_records};
use super::models::{AppleContact, ContactQuery};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub fn search_contacts(query: ContactQuery) -> Result<Vec<AppleContact>, String> {
    let needle = query.query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }

    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    launch_application("Contacts");
    let rows = run_osascript_records(&contacts_script(needle, limit))?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let display_name = row.first()?.trim().to_string();
            if display_name.is_empty() {
                return None;
            }
            let emails = row
                .get(1)
                .map(|value| split_multi_value(value))
                .unwrap_or_default();
            let phone_numbers = row
                .get(2)
                .map(|value| split_multi_value(value))
                .unwrap_or_default();
            let organization = row.get(3).map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
            let id = row
                .get(4)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| stable_id(&[&display_name]));

            Some(AppleContact {
                id,
                display_name,
                emails,
                phone_numbers,
                organization,
            })
        })
        .take(limit)
        .collect())
}

fn contacts_script(query: &str, limit: usize) -> String {
    let query = quote_applescript(query);
    format!(
        r#"
set fieldSeparator to ASCII character 31
set recordSeparator to ASCII character 30
set multiSeparator to ASCII character 29
set queryText to {query}
set outputRows to {{}}
set maxRows to {limit}
tell application "Contacts"
	repeat with personRef in people
		set displayName to ""
		set emailsText to ""
		set phonesText to ""
		set orgText to ""
		set nativeId to ""
		try
			set displayName to name of personRef as text
		end try
		try
			set orgText to organization of personRef as text
		end try
		try
			set nativeId to id of personRef as text
		end try
		set matchText to displayName & " " & orgText
		try
			repeat with emailRef in emails of personRef
				set emailValue to value of emailRef as text
				set matchText to matchText & " " & emailValue
				if emailsText is "" then
					set emailsText to emailValue
				else
					set emailsText to emailsText & multiSeparator & emailValue
				end if
			end repeat
		end try
		try
			repeat with phoneRef in phones of personRef
				set phoneValue to value of phoneRef as text
				set matchText to matchText & " " & phoneValue
				if phonesText is "" then
					set phonesText to phoneValue
				else
					set phonesText to phonesText & multiSeparator & phoneValue
				end if
			end repeat
		end try
		ignoring case
			if matchText contains queryText then
				set end of outputRows to displayName & fieldSeparator & emailsText & fieldSeparator & phonesText & fieldSeparator & orgText & fieldSeparator & nativeId
				if (count of outputRows) >= maxRows then exit repeat
			end if
		end ignoring
	end repeat
end tell
set AppleScript's text item delimiters to recordSeparator
set outputText to outputRows as text
set AppleScript's text item delimiters to ""
return outputText
"#
    )
}

fn split_multi_value(value: &str) -> Vec<String> {
    value
        .split('\u{001d}')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn stable_id(parts: &[&str]) -> String {
    let mut hasher = DefaultHasher::new();
    parts.hash(&mut hasher);
    format!("contact-{:x}", hasher.finish())
}
