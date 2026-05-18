import { classifyFoundationIntent } from "@/local-context/foundation-intent-router";
import type { FoundationCommand } from "@/local-context/work-command-types";

export function routeFoundationCommand(utterance: string): FoundationCommand | null {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();

  if (/\b(approve|confirm|yes create|go ahead)\b/.test(text)) {
    return command("approve_pending_action", utterance, "approval", "approval", false, {});
  }

  if (/\b(draft|write|compose|start).*\b(email|mail|message)\b/.test(text)) {
    return null;
  }

  if (/\b(create|add).*\b(calendar event|event)\b/.test(text) || /\b(schedule|book).*\b(meeting|event)\b/.test(text)) {
    return command("create_calendar_event", utterance, "approval", "create_calendar_event", true, {
      title: extractCalledTitle(utterance) ?? "Test Event",
      startAt: extractDatePhrase(text) ?? "tomorrow at 10:00 AM",
      endAt: "tomorrow at 11:00 AM",
    });
  }

  if (/\b(create|add|set).*\b(reminder|todo)\b/.test(text)) {
    return command("create_reminder", utterance, "approval", "create_reminder", true, {
      title: extractReminderTitle(utterance),
      dueAt: text.includes("tomorrow morning") ? "tomorrow at 9:00 AM" : text.includes("tomorrow") ? "tomorrow at 10:00 AM" : null,
    });
  }

  if (/\b(create|add).*\bnote\b/.test(text)) {
    return command("create_note", utterance, "approval", "create_note", true, {
      title: extractCalledTitle(utterance) ?? "Seemless Test Note",
      body: "",
    });
  }

  const intent = classifyFoundationIntent(utterance);
  if (!intent) {
    return null;
  }

  switch (intent.intent) {
    case "capability.status":
      return command("show_capability_status", utterance, "capability_status", "load_capability_diagnostics", false, {});
    case "email.list":
      return command("show_recent_emails", utterance, "email_list", "load_mail_messages", false, { limit: 25 });
    case "email.readLatest":
      return command("open_latest_email", utterance, "email_detail", "read_mail_message", false, {});
    case "calendar.today":
      return command("show_today_calendar", utterance, "calendar_day", "load_calendar_events", false, { daysAhead: 1, limit: 30 });
    case "reminder.list":
      return command("show_reminders", utterance, "reminder_list", "load_reminders", false, { includeCompleted: false, limit: 50 });
    case "notes.list":
      return command("show_recent_notes", utterance, "notes_list", "load_notes", false, { limit: 25 });
    case "notes.readLatest":
      return command("open_latest_note", utterance, "note_detail", "read_note", false, {});
    case "contacts.search":
      return command("find_contacts", utterance, "contacts", "search_contacts", false, {
        query: intent.query ?? "",
        limit: 25,
      });
    case "files.listRoot":
      return command("show_files", utterance, "files", "search_local_files", false, {
        root: intent.root ?? "Desktop",
        limit: 50,
      });
    case "files.search":
      return command("search_files", utterance, "files", "search_local_files", false, {
        root: intent.root ?? "Documents",
        extension: intent.extension,
        query: intent.query,
        limit: 80,
      });
    case "local.unsupported":
      return command("unsupported_local_context", utterance, "unsupported_context", "foundation_intent_router", false, {
        reason: intent.reason,
        normalizedText: intent.normalizedText,
      });
  }
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
