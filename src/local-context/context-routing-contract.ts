import type { FoundationCommand } from "@/local-context/work-command-types";
import type { ObjectiveFrame } from "@/objectives/objective-types";
import type { WorkspaceSession } from "@/workspace/types";

const SUPPORTING_CONTEXT_RE =
  /\b(use|check|include|mention|based on|compare (it )?with|compare .* with|supporting|as support|context only|keep .* open|keep .* draft|do not switch|don't switch|but keep)\b/;
const EXPLICIT_PRIMARY_SWITCH_RE =
  /\b(switch to|open .* instead|show .* instead|make .* primary|as the main|new task|start a new task)\b/;

export function shouldRunFoundationBeforeWorkspace(
  utterance: string,
  command: FoundationCommand,
  session: WorkspaceSession,
  activeObjective: ObjectiveFrame | null,
) {
  const text = normalize(utterance);
  const hasActiveWork = Boolean(activeObjective || session.primarySurfaceId);

  if (command.requiresApproval || command.kind === "approve_pending_action") {
    return true;
  }

  if (command.kind === "show_scaffolded_connector_status") {
    return true;
  }

  if (
    activeObjective?.kind === "draft_email" &&
    command.kind === "unsupported_email_action" &&
    (
      command.payload.draftCompatible ||
      command.payload.intent === "email.send_or_schedule" ||
      command.payload.intent === "email.control_or_review"
    )
  ) {
    return false;
  }

  if (!hasActiveWork) {
    return true;
  }

  if (isExplicitPrimaryContextSwitch(text)) {
    return true;
  }

  if (isSupportingContextRequest(text)) {
    return false;
  }

  if (activeObjective?.kind === "draft_email" && command.kind === "show_today_calendar") {
    return false;
  }

  if (activeObjective?.kind === "draft_email" && command.kind === "show_recent_notes") {
    return false;
  }

  if (activeObjective?.kind === "prepare_meeting" && ["show_recent_emails", "show_recent_notes", "show_reminders"].includes(command.kind)) {
    return false;
  }

  if (command.kind === "unsupported_local_context" && /\b(go back to|return to)\b/.test(text)) {
    return false;
  }

  return true;
}

export function isExplicitPrimaryContextSwitch(utterance: string) {
  const text = normalize(utterance);
  if (/\b(do not switch|don't switch|dont switch)\b/.test(text)) return false;
  return EXPLICIT_PRIMARY_SWITCH_RE.test(text);
}

export function isSupportingContextRequest(utterance: string) {
  return SUPPORTING_CONTEXT_RE.test(normalize(utterance));
}

export function requestedSupportSurfaceKinds(utterance: string): Array<"calendar" | "mail" | "notes" | "reminders" | "files"> {
  const text = normalize(utterance);
  const kinds: Array<"calendar" | "mail" | "notes" | "reminders" | "files"> = [];

  if (/\b(calendar|schedule|events?|meetings?|availability|free slot)\b/.test(text)) kinds.push("calendar");
  if (/\b(mail|email|emails|inbox|message|messages|thread)\b/.test(text) && !/\b(email|reply)?\s*draft\b/.test(text)) kinds.push("mail");
  if (/\b(notes?|apple notes)\b/.test(text)) kinds.push("notes");
  if (/\b(reminders?|todos?)\b/.test(text)) kinds.push("reminders");
  if (/\b(files?|documents?|downloads|desktop|folder|pdfs?|markdown)\b/.test(text)) kinds.push("files");

  return Array.from(new Set(kinds));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
