import type { CreateCalendarEventRequest, CreateNoteRequest, CreateReminderRequest, FileSearchQuery } from "@/types/context";

export type FoundationCommandKind =
  | "show_capability_status"
  | "show_recent_emails"
  | "open_latest_email"
  | "show_today_calendar"
  | "create_calendar_event"
  | "show_reminders"
  | "create_reminder"
  | "show_recent_notes"
  | "open_latest_note"
  | "create_note"
  | "find_contacts"
  | "show_files"
  | "search_files"
  | "open_file_summary"
  | "unsupported_local_context"
  | "approve_pending_action";

export interface FoundationCommand {
  kind: FoundationCommandKind;
  utterance: string;
  surfaceKind: string;
  adapter: string;
  requiresApproval: boolean;
  payload: Record<string, unknown>;
}

export type PendingApproval =
  | { kind: "create_calendar_event"; request: CreateCalendarEventRequest; utterance: string }
  | { kind: "create_reminder"; request: CreateReminderRequest; utterance: string }
  | { kind: "create_note"; request: CreateNoteRequest; utterance: string };

export interface FoundationCommandMemory {
  latestEmailId?: string;
  latestNoteId?: string;
  latestFilePath?: string;
  pendingApproval?: PendingApproval;
}

export interface FileCommandPayload extends FileSearchQuery {
  root?: string;
}
