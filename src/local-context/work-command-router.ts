import type { FoundationCommand } from "@/local-context/work-command-types";

export function routeFoundationCommand(utterance: string): FoundationCommand | null {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();

  if (/\b(approve|confirm|yes create|go ahead)\b/.test(text)) {
    return command("approve_pending_action", utterance, "approval", "approval", false, {});
  }

  if (/\b(show capability status|check app permissions|what can you access)\b/.test(text)) {
    return command("show_capability_status", utterance, "capability_status", "load_capability_diagnostics", false, {});
  }

  if (/\b(show|list).*\b(recent )?(emails?|mail|inbox messages)\b/.test(text)) {
    return command("show_recent_emails", utterance, "email_list", "load_mail_messages", false, { limit: 25 });
  }

  if (/\b(open|read).*\b(latest|last).*\b(email|mail|message).*\b(fully|full|body)?\b/.test(text)) {
    return command("open_latest_email", utterance, "email_detail", "read_mail_message", false, {});
  }

  if (/\b(show|open|check).*\b(today'?s|today).*\b(calendar|schedule|events?)\b/.test(text) || /\bshow my calendar\b/.test(text)) {
    return command("show_today_calendar", utterance, "calendar_day", "load_calendar_events", false, { daysAhead: 1, limit: 30 });
  }

  if (/\b(create|add).*\b(calendar event|event)\b/.test(text)) {
    return command("create_calendar_event", utterance, "approval", "create_calendar_event", true, {
      title: extractCalledTitle(utterance) ?? "Test Event",
      startAt: extractDatePhrase(text) ?? "tomorrow at 10:00 AM",
      endAt: "tomorrow at 11:00 AM",
    });
  }

  if (/\b(show|list|open|check).*\b(reminders?|todos?)\b/.test(text)) {
    return command("show_reminders", utterance, "reminder_list", "load_reminders", false, { includeCompleted: false, limit: 50 });
  }

  if (/\b(create|add|set).*\b(reminder|todo)\b/.test(text)) {
    return command("create_reminder", utterance, "approval", "create_reminder", true, {
      title: extractReminderTitle(utterance),
      dueAt: text.includes("tomorrow morning") ? "tomorrow at 9:00 AM" : text.includes("tomorrow") ? "tomorrow at 10:00 AM" : null,
    });
  }

  if (/\b(show|list).*\b(recent )?notes?\b/.test(text)) {
    return command("show_recent_notes", utterance, "notes_list", "load_notes", false, { limit: 25 });
  }

  if (/\b(open|read).*\b(latest|last).*\bnotes?.*\b(fully|full|body)?\b/.test(text)) {
    return command("open_latest_note", utterance, "note_detail", "read_note", false, {});
  }

  if (/\b(create|add).*\bnote\b/.test(text)) {
    return command("create_note", utterance, "approval", "create_note", true, {
      title: extractCalledTitle(utterance) ?? "Seemless Test Note",
      body: "",
    });
  }

  if (/\b(find|search).*\bcontacts?\b/.test(text) || /\bfind contact\b/.test(text)) {
    return command("find_contacts", utterance, "contacts", "search_contacts", false, {
      query: extractAfter(text, "named") ?? extractAfter(text, "contact") ?? extractAfter(text, "contacts") ?? "",
      limit: 25,
    });
  }

  if (/\bshow files from\b/.test(text)) {
    return command("show_files", utterance, "files", "search_local_files", false, {
      root: extractRoot(text) ?? "Desktop",
      limit: 50,
    });
  }

  if (/\bsearch\b.*\b(documents|desktop|downloads)\b/.test(text)) {
    return command("search_files", utterance, "files", "search_local_files", false, {
      root: extractRoot(text) ?? "Documents",
      extension: text.includes("pdf") ? "pdf" : undefined,
      query: extractFileQuery(text),
      limit: 80,
    });
  }

  if (/\b(open|read|show).*\b(file summary|this file summary|file)\b/.test(text)) {
    return command("open_file_summary", utterance, "file_detail", "read_local_file", false, {});
  }

  return null;
}

function command(
  kind: FoundationCommand["kind"],
  utterance: string,
  surfaceKind: string,
  adapter: string,
  requiresApproval: boolean,
  payload: Record<string, unknown>,
): FoundationCommand {
  return { kind, utterance, surfaceKind, adapter, requiresApproval, payload };
}

function extractCalledTitle(utterance: string) {
  return utterance.match(/\bcalled\s+(.+?)(?:\.|$)/i)?.[1]?.trim();
}

function extractReminderTitle(utterance: string) {
  return utterance
    .replace(/\b(create|add|set)\s+(a\s+)?reminder\s+(to|for)?/i, "")
    .replace(/\btomorrow\b.*$/i, "")
    .replace(/[.]/g, "")
    .trim() || "Untitled reminder";
}

function extractDatePhrase(text: string) {
  if (text.includes("tomorrow at 10")) return "tomorrow at 10:00 AM";
  if (text.includes("tomorrow")) return "tomorrow at 10:00 AM";
  return null;
}

function extractAfter(text: string, marker: string) {
  const index = text.indexOf(marker);
  if (index === -1) return null;
  return text.slice(index + marker.length).replace(/[.]/g, "").trim() || null;
}

function extractRoot(text: string) {
  if (text.includes("desktop")) return "Desktop";
  if (text.includes("downloads")) return "Downloads";
  if (text.includes("documents")) return "Documents";
  return null;
}

function extractFileQuery(text: string) {
  if (text.includes("pdf")) return undefined;
  return text.replace(/\b(search|desktop|documents|downloads|for|files?|from|my)\b/g, " ").replace(/\s+/g, " ").trim() || undefined;
}
