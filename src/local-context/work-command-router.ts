import { classifyFoundationIntent } from "@/local-context/foundation-intent-router";
import type { FoundationCommand } from "@/local-context/work-command-types";

export function routeFoundationCommand(utterance: string): FoundationCommand | null {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();

  if (/\b(go back to|return to|keep)\b.*\b(email|draft|reply)\b/.test(text)) {
    return null;
  }

  if (isDirectApprovalCommand(text)) {
    return command("approve_pending_action", utterance, "approval", "approval", false, {});
  }

  if (isEmailDraftCorrection(text)) {
    return null;
  }

  if (isCancelCommand(text)) {
    return command("cancel_pending_action", utterance, "approval", "approval", false, {});
  }

  if (/\b(draft|write|compose|start).*\b(email|mail|message)\b/.test(text)) {
    return null;
  }

  if (/\b(create|add).*\bcalendar event\b/.test(text) || /\b(schedule|book).*\b(meeting|event)\b/.test(text)) {
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

  const unsupportedEmailAction = unsupportedEmailActionPayload(utterance);
  if (unsupportedEmailAction && !isImplementedEmailReadCommand(text)) {
    return command("unsupported_email_action", utterance, "unsupported_context", "email_intent_guard", false, unsupportedEmailAction);
  }

  if (/\b(open|read|summarize|summary)\b.*\b(latest|selected|readable|this)\b.*\b(file|document|pdf|markdown|md)\b/.test(text) || /\b(open|read|summarize|summary)\b.*\b(file|document)\b/.test(text)) {
    return command("open_file_summary", utterance, "file_detail", "read_local_file", false, {});
  }

  const intent = classifyFoundationIntent(utterance);
  if (!intent) {
    return null;
  }

  switch (intent.intent) {
    case "capability.status":
      return command("show_capability_status", utterance, "capability_status", "load_capability_diagnostics", false, {});
    case "briefing.daily":
      return command("show_daily_briefing", utterance, "document", "daily_briefing", false, {});
    case "payment.items":
      return command("show_payment_items", utterance, "document", "payment_triage", false, {});
    case "meeting.prep":
      return command("prepare_next_meeting", utterance, "document", "meeting_prep", false, {});
    case "connector.needsConfiguration":
      return command("show_scaffolded_connector_status", utterance, "capability_status", "connector_status", false, {
        connectorId: intent.query,
      });
    case "email.list":
      return command("show_recent_emails", utterance, "email_list", "load_mail_messages", false, { limit: 25 });
    case "email.readLatest":
      return command("open_latest_email", utterance, "email_detail", "read_mail_message", false, {});
    case "email.summarizeLatest":
      return command("summarize_latest_email", utterance, "email_detail", "analyze_mail_message", false, {});
    case "email.createSummaryArtifact":
      return command("create_email_summary_artifact", utterance, "document", "create_email_summary_artifact", false, {});
    case "email.triageArtifact":
      return command("create_email_triage_artifact", utterance, "document", "email_triage_artifact", false, {
        mode: inferEmailTriageMode(text),
      });
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

function isDirectApprovalCommand(text: string) {
  if (/\b(approve nothing|approve none|approve no|do not approve|don't approve|dont approve)\b/.test(text)) {
    return false;
  }

  if (/\b(what|show|which|asked to approve|being asked|provided|only if|if|first|provided that|condition|conditional)\b/.test(text)) {
    return false;
  }

  return /^(approve|confirm|yes create|go ahead|yes,? do it|yes)$/i.test(text);
}

function isCancelCommand(text: string) {
  return /\b(cancel|stop|never mind|nevermind|do not create|don't create|dont create|do not do it|don't do it|dont do it|discard)\b/.test(text);
}

function isEmailDraftCorrection(text: string) {
  return /\b(stop|do not send|don't send|dont send)\b/.test(text) && /\b(change|friday|monday|draft|email|message|that|this)\b/.test(text);
}

function isImplementedEmailReadCommand(text: string) {
  return (
    /\b(recent )?(email|emails|mail|inbox|inbox messages)\b/.test(text) && /\b(show|list|open|pull up|bring up|recent|inbox)\b/.test(text)
  ) || (
    /\b(latest|last)\b.*\b(email|mail|message)\b/.test(text) && /\b(open|read|full|fully|body)\b/.test(text)
  ) || (
    /\b(summarize|summary|analyze|analyse|what is|what's|what does|extract|tell me)\b/.test(text) &&
    /\b(latest|last|recent|this|selected)?\s*(email|mail|message)\b/.test(text)
  ) || (
    /\b(create|make|turn|produce|build)\b.*\b(artifact|document|doc|writeup|write up|brief)\b/.test(text) &&
    /\b(email|mail|message|summary|analysis)\b/.test(text)
  );
}

function inferEmailTriageMode(text: string) {
  if (/\b(compare|options?)\b/.test(text)) return "compare_options";
  if (/\b(plan|next steps?|actionable)\b/.test(text)) return "plan_next_steps";
  if (/\b(organize|context)\b/.test(text)) return "organize_context";
  if (/\b(decisions?|records?|requests?|key)\b/.test(text)) return "extract_records";
  return "catch_up";
}

function unsupportedEmailActionPayload(utterance: string) {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^send\s+(it|this|that)\.?$/.test(text)) {
    return null;
  }

  const intent = inferUnsupportedEmailIntent(text);
  if (!intent) return null;

  const mutating = /\b(send|forward|reply|attach|schedule|hold|save|task|remind|approve|decline|label|archive|delete|clear out|unsubscribe|rule|report|block)\b/.test(text);
  const prohibitedOutcomes = prohibitedOutcomesFor(text);

  return {
    intent,
    confidence: "medium",
    proposedAction: "No executable email action is available for this command in the current app.",
    confirmationRequirement: mutating ? "required before any real email or mailbox change" : "not applicable until the feature exists",
    reversibility: mutating ? "unknown or not reliable after a provider accepts the action" : "no external action ran",
    prohibitedOutcomes,
    draftCompatible: /\b(reply|tell|make|shorten|follow up|decline|approve|agree|warmer|professional|confrontational|escalation)\b/.test(text),
    externalWrite: false,
    writesToMailbox: false,
  };
}

function inferUnsupportedEmailIntent(text: string) {
  if (/\bcatch (me )?up\b.*\b(email|mail)\b/.test(text)) return "email.catch_up";
  if (/\bfind\b.*\b(email|mail)\b/.test(text)) return "email.search";
  if (/\bthread|conversation|finally decide|changed\b/.test(text)) return "email.thread_analysis";
  if (/\bwaiting for a response|response from me|unanswered\b/.test(text)) return "email.response_queue";
  if (/\breply|tell them|tell everyone|follow up|decline|approve it\b/.test(text)) return "email.draft_reply";
  if (/\brecipient|send this to|reply only|add .*remove|everyone\b/.test(text)) return "email.recipient_control";
  if (/\bforward\b/.test(text)) return "email.forward";
  if (/\battach|attachment|attached|contract|proposal\b/.test(text)) return "email.attachment";
  if (/\bsend|hold this|save this as a draft\b/.test(text)) return "email.send_or_schedule";
  if (/\btask|remind me|reminder\b/.test(text)) return "email.task_or_reminder";
  if (/\basked to approve|being asked to approve|approval request\b/.test(text)) return "email.approval_review";
  if (/\bworkspace|orion\b/.test(text)) return "email.project_workspace";
  if (/\blabel|archive|junk|unsubscribe|rule|from now on\b/.test(text)) return "email.mailbox_organization";
  if (/\blegitimate|phishing|block\b/.test(text)) return "email.security_review";
  if (/\bclient|confidential|report\b/.test(text)) return "email.confidential_send";
  if (/\bread .*email\b/.test(text)) return "email.read_privacy";
  if (/\bstop|undo|what are you about to do\b/.test(text)) return "email.control_or_review";
  return null;
}

function prohibitedOutcomesFor(text: string) {
  const outcomes = new Set<string>(["send_before_preview", "mutate_mailbox_without_confirmation"]);

  if (/\breply|send|forward|everyone|recipient|client\b/.test(text)) {
    outcomes.add("use_wrong_recipient_or_reply_mode");
  }
  if (/\bforward|client|report|confidential|internal\b/.test(text)) {
    outcomes.add("expose_sensitive_history_or_attachments");
  }
  if (/\bdelete|junk|archive|unsubscribe|label|rule|block|phishing\b/.test(text)) {
    outcomes.add("perform_destructive_or_bulk_action_without_review");
  }
  if (/\bapprove|decline|deadline|friday|september|condition|legal\b/.test(text)) {
    outcomes.add("alter_user_commitment_or_condition");
  }
  if (/\battach|attachment|contract|proposal\b/.test(text)) {
    outcomes.add("use_wrong_or_unreviewed_attachment");
  }

  return Array.from(outcomes);
}
