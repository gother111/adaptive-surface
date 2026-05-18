export type FoundationIntentName =
  | "capability.status"
  | "email.list"
  | "email.readLatest"
  | "calendar.today"
  | "reminder.list"
  | "notes.list"
  | "notes.readLatest"
  | "contacts.search"
  | "files.listRoot"
  | "files.search"
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
  "message",
  "messages",
  "calendar",
  "event",
  "events",
  "schedule",
  "meeting",
  "meetings",
  "reminder",
  "reminders",
  "todo",
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
];

export function classifyFoundationIntent(utterance: string): FoundationIntentResult | null {
  const normalizedText = normalizeFoundationUtterance(utterance);
  const original = utterance.toLowerCase().replace(/\s+/g, " ").trim();
  const localContext = isLocalContextUtterance(utterance);

  if (/\b(latest|last)\b.*\bnotes?\b/.test(normalizedText) || /\bnotes?\b.*\b(latest|last)\b/.test(normalizedText)) {
    return high("notes.readLatest", normalizedText, "Latest note read phrase matched.");
  }

  if (/\b(capability status|app permissions|what can you access)\b/.test(normalizedText)) {
    return high("capability.status", normalizedText, "Capability status phrase matched.");
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

  if (/\b(calendar|schedule|events?|meetings?)\b/.test(normalizedText)) {
    return high("calendar.today", normalizedText, "Calendar phrase matched.");
  }

  if (/\b(reminders?|todos?)\b/.test(normalizedText)) {
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
  if (root && (/\b(search|find)\b/.test(normalizedText) || /\bpdfs?\b/.test(normalizedText))) {
    return {
      ...high("files.search", normalizedText, "Trusted-root file search phrase matched."),
      root,
      extension: /\bpdfs?\b/.test(normalizedText) ? "pdf" : undefined,
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

function extractRoot(text: string): FoundationIntentResult["root"] {
  if (/\bdesktop\b/.test(text)) return "Desktop";
  if (/\bdownloads\b/.test(text)) return "Downloads";
  if (/\bdocuments\b/.test(text)) return "Documents";
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
    .replace(/\b(search|find|show|files?|from|in|desktop|documents|downloads|folder|folders|pdfs?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}
