export type FoundationIntentName =
  | "capability.status"
  | "briefing.daily"
  | "payment.items"
  | "meeting.prep"
  | "email.list"
  | "email.readLatest"
  | "email.summarizeLatest"
  | "email.createSummaryArtifact"
  | "email.triageArtifact"
  | "calendar.today"
  | "reminder.list"
  | "notes.list"
  | "notes.readLatest"
  | "contacts.search"
  | "files.listRoot"
  | "files.search"
  | "connector.needsConfiguration"
  | "local.unsupported";

export interface FoundationIntentResult {
  intent: FoundationIntentName;
  confidence: "high" | "medium" | "low";
  reason: string;
  normalizedText: string;
  query?: string;
  root?: "Desktop" | "Documents" | "Downloads";
  extension?: string;
}

const LOCAL_CONTEXT_WORDS = [
  "email",
  "emails",
  "mail",
  "inbox",
  "calendar",
  "schedule",
  "reminder",
  "reminders",
  "todos",
  "note",
  "notes",
  "contact",
  "contacts",
  "file",
  "files",
  "desktop",
  "documents",
  "downloads",
  "folder",
  "folders",
  "pdf",
  "pdfs",
  "catch up",
  "catch me up",
  "briefing",
  "morning",
  "today",
  "attention",
  "bill",
  "bills",
  "payment",
  "payments",
  "invoice",
  "invoices",
  "meeting",
  "meetings",
  "prep",
  "task",
  "tasks",
  "due",
];

export function classifyFoundationIntent(utterance: string): FoundationIntentResult | null {
  const normalizedText = normalizeFoundationUtterance(utterance);
  const original = utterance.toLowerCase().replace(/\s+/g, " ").trim();
  const localContext = isLocalContextUtterance(utterance);

  if (/\b(go back to|return to|keep)\b.*\b(email|draft|reply)\b/.test(original)) {
    return null;
  }

  if (/\b(go back to|return to|show)\b.*\b(briefing|brief|payment|bill|invoice|meeting prep|document|artifact)\b/.test(original)) {
    return null;
  }

  if (/^(mention|include|add|tell|say)\b/.test(original) || /\b(mention|include|add|tell|say)\b.*\b(draft|email|mail|message|reply|brief)\b/.test(original)) {
    return null;
  }

  const connector = scaffoldedConnectorFor(original);
  if (connector) {
    return {
      intent: "connector.needsConfiguration",
      confidence: "high",
      reason: `${connector.label} is scaffolded but has no OAuth configuration in this app.`,
      normalizedText,
      query: connector.id,
    };
  }

  if (/\b(latest|last)\b.*\bnotes?\b/.test(normalizedText) || /\bnotes?\b.*\b(latest|last)\b/.test(normalizedText)) {
    return high("notes.readLatest", normalizedText, "Latest note read phrase matched.");
  }

  if (
    /\b(create|make|turn|produce|build)\b.*\b(artifact|document|doc|writeup|write up|brief)\b/.test(normalizedText) &&
    /\b(email|mail|message|summary|analysis)\b/.test(normalizedText)
  ) {
    return high("email.createSummaryArtifact", normalizedText, "Email summary artifact phrase matched.");
  }

  if (isInboxTriageWork(normalizedText)) {
    return high("email.triageArtifact", normalizedText, "Inbox triage synthesis phrase matched.");
  }

  if (/\b(capability status|app permissions|what can you access)\b/.test(normalizedText)) {
    return high("capability.status", normalizedText, "Capability status phrase matched.");
  }

  if (
    /\b(morning briefing|daily briefing|brief me|what needs my attention|what should i focus on|what is on my plate|what's on my plate)\b/.test(original) ||
    (/\b(today|morning)\b/.test(normalizedText) && /\b(brief|briefing|attention|focus)\b/.test(normalizedText))
  ) {
    return high("briefing.daily", normalizedText, "Daily briefing phrase matched.");
  }

  if (/\b(bills?|payments?|invoices?|receipts?|subscriptions?)\b/.test(normalizedText) && /\b(show|list|what|which|review|attention|due|need)\b/.test(normalizedText)) {
    return high("payment.items", normalizedText, "Payment triage phrase matched.");
  }

  if (/\b(prep|prepare|brief)\b.*\b(next )?(meeting|call|standup)\b/.test(normalizedText) || /\b(next )?(meeting|call|standup)\b.*\b(prep|prepare|brief)\b/.test(normalizedText)) {
    return high("meeting.prep", normalizedText, "Meeting prep phrase matched.");
  }

  if (
    /\b(summarize|summary|analyze|analyse|what is|what's|what does|extract|tell me)\b/.test(normalizedText) &&
    /\b(latest|last|recent|this|selected)?\s*(email|mail|message)\b/.test(normalizedText)
  ) {
    return high("email.summarizeLatest", normalizedText, "Latest email analysis phrase matched.");
  }

  if (/\b(latest|last)\b.*\b(email|mail|message)\b/.test(normalizedText) && /\b(open|read|full|fully|body)\b/.test(normalizedText)) {
    return high("email.readLatest", normalizedText, "Latest email read phrase matched.");
  }

  if (
    /\b(recent )?(email|emails|mail|inbox|inbox messages)\b/.test(normalizedText) &&
    /\b(show|list|open|pull up|bring up|recent|inbox)\b/.test(original)
  ) {
    return high("email.list", normalizedText, "Email list phrase matched.");
  }

  if (
    /\b(calendar|schedule)\b/.test(normalizedText) ||
    (/\b(events?|meetings?)\b/.test(normalizedText) && /\b(show|list|open|check|today|tomorrow|next)\b/.test(original))
  ) {
    return high("calendar.today", normalizedText, "Calendar phrase matched.");
  }

  if (
    /\b(reminders?|todos?|tasks?)\b/.test(normalizedText) ||
    /\b(what|which).*\b(due|need to do|should do)\b.*\b(today|tomorrow)\b/.test(normalizedText) ||
    /\b(due today|due tomorrow)\b/.test(normalizedText)
  ) {
    return high("reminder.list", normalizedText, "Reminder phrase matched.");
  }

  if (/\bnotes?\b/.test(normalizedText)) {
    return high("notes.list", normalizedText, "Notes list phrase matched.");
  }

  if (/\b(find|search)\b.*\bcontacts?\b/.test(original) || /\bcontacts?\b/.test(normalizedText) || /^find\s+[a-z][a-z]+(?:\s+[a-z][a-z]+)?$/.test(original)) {
    return {
      ...high("contacts.search", normalizedText, "Contact search phrase matched."),
      query: extractContactQuery(original),
    };
  }

  const root = extractRoot(normalizedText);
  if (root && (/\b(search|find)\b/.test(normalizedText) || /\b(pdfs?|markdown|md)\b/.test(normalizedText))) {
    return {
      ...high("files.search", normalizedText, "Trusted-root file search phrase matched."),
      root,
      extension: fileExtensionFromText(normalizedText),
      query: extractFileQuery(normalizedText),
    };
  }

  if (root || /\bfiles?\b/.test(normalizedText)) {
    return {
      ...high("files.listRoot", normalizedText, "Trusted-root file listing phrase matched."),
      root: root ?? "Desktop",
    };
  }

  if (localContext) {
    return {
      intent: "local.unsupported",
      confidence: "medium",
      reason: "Local-context words were detected but no supported foundation intent matched.",
      normalizedText,
    };
  }

  return null;
}

function scaffoldedConnectorFor(text: string) {
  if (/\b(gmail|google mail)\b/.test(text)) return { id: "gmail", label: "Gmail" };
  if (/\bgoogle calendar\b/.test(text)) return { id: "google.calendar", label: "Google Calendar" };
  if (/\b(google drive|drive files|google docs)\b/.test(text)) return { id: "google.drive", label: "Google Drive" };
  return null;
}

export function isLocalContextUtterance(utterance: string) {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();
  return LOCAL_CONTEXT_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(text));
}

export function normalizeFoundationUtterance(utterance: string) {
  return utterance
    .toLowerCase()
    .replace(/[?.!,]/g, " ")
    .replace(/\b(can you|could you|would you|please|for me|my|me|the)\b/g, " ")
    .replace(/\b(pull up|bring up|show me|open up)\b/g, "show")
    .replace(/\s+/g, " ")
    .trim();
}

function high(intent: FoundationIntentName, normalizedText: string, reason: string): FoundationIntentResult {
  return { intent, confidence: "high", reason, normalizedText };
}

function isInboxTriageWork(text: string) {
  if (!/\b(email|emails|mail|inbox|message|messages)\b/.test(text)) return false;
  if (!/\b(triage|catch up|catch|decisions?|records?|requests?|organize|context|compare|options?|plan|next steps?|actionable|sources?|assumptions?|gaps?)\b/.test(text)) return false;

  return /\b(catch up|catch|find|key|organize|compare|plan|next steps?|actionable|looking across|show.*sources?|assumptions?|gaps?)\b/.test(text);
}

function extractRoot(text: string): FoundationIntentResult["root"] {
  if (/\bdesktop\b/.test(text)) return "Desktop";
  if (/\bdownloads\b/.test(text)) return "Downloads";
  if (/\bdocuments\b/.test(text)) return "Documents";
  return undefined;
}

function fileExtensionFromText(text: string) {
  if (/\bpdfs?\b/.test(text)) return "pdf";
  if (/\b(markdown|md)\b/.test(text)) return "md";
  return undefined;
}

function extractContactQuery(text: string) {
  return text
    .replace(/\b(find|search|for|in|contacts?|contact|named|called)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFileQuery(text: string) {
  if (/\bpdfs?\b/.test(text)) return undefined;
  return text
    .replace(/\b(search|find|show|files?|from|in|desktop|documents|downloads|folder|folders|pdfs?|markdown|md)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}
