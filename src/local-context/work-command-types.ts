import type { CreateCalendarEventRequest, CreateNoteRequest, CreateReminderRequest, FileSearchQuery } from "@/types/context";

export type FoundationCommandKind =
  | "show_capability_status"
  | "show_scaffolded_connector_status"
  | "show_daily_briefing"
  | "show_payment_items"
  | "prepare_next_meeting"
  | "show_recent_emails"
  | "open_latest_email"
  | "summarize_latest_email"
  | "create_email_summary_artifact"
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
  | "unsupported_email_action"
  | "cancel_pending_action"
  | "approve_pending_action";

export interface FoundationCommand {
  kind: FoundationCommandKind;
  utterance: string;
  surfaceKind: string;
  adapter: string;
  requiresApproval: boolean;
  payload: Record<string, unknown>;
  layoutPreference?: "primary" | "supporting" | "temporary";
}

export type PendingApproval =
  | { kind: "create_calendar_event"; request: CreateCalendarEventRequest; utterance: string }
  | { kind: "create_reminder"; request: CreateReminderRequest; utterance: string }
  | { kind: "create_note"; request: CreateNoteRequest; utterance: string };

export interface FoundationCommandMemory {
  latestEmailId?: string;
  latestEmailAnalysis?: EmailAnalysisMemory;
  latestNoteId?: string;
  latestFilePath?: string;
  pendingApproval?: PendingApproval;
}

export interface EmailAnalysisMemory {
  sourceEmailId: string;
  subject: string;
  sender: string;
  receivedAt?: string | null;
  mailbox: string;
  summary: string;
  requestedAction: string;
  relevanceJudgment: string;
  evidence: string[];
  artifactBody: string;
}

export interface FileCommandPayload extends FileSearchQuery {
  root?: string;
}
