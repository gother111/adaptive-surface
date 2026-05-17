export type WorkObjectKind =
  | "email_thread"
  | "email_message"
  | "email_draft"
  | "calendar_event"
  | "note"
  | "reminder"
  | "file"
  | "directory"
  | "document"
  | "spreadsheet"
  | "contact"
  | "task"
  | "decision"
  | "artifact"
  | "surface"
  | "unknown";

export type WorkObjectSource =
  | "apple_mail"
  | "apple_calendar"
  | "apple_notes"
  | "apple_reminders"
  | "finder"
  | "local_directory"
  | "voice"
  | "surface"
  | "manual"
  | "future_connector";

export interface WorkObjectBase {
  id: string;
  kind: WorkObjectKind;
  source: WorkObjectSource;
  title: string;
  subtitle?: string;
  contentPreview?: string;
  rawRef?: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

export interface EmailMessageObject extends WorkObjectBase {
  kind: "email_message";
  source: "apple_mail" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    sender?: string;
    mailbox?: string;
    receivedAt?: string | null;
    isRead?: boolean;
  };
}

export interface EmailThreadObject extends WorkObjectBase {
  kind: "email_thread";
  source: "apple_mail" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    messageIds: string[];
    participants?: string[];
  };
}

export interface EmailDraftObject extends WorkObjectBase {
  kind: "email_draft";
  source: "voice" | "surface" | "manual";
  metadata: WorkObjectBase["metadata"] & {
    to?: string;
    subject?: string;
    tone?: string;
  };
}

export interface CalendarEventObject extends WorkObjectBase {
  kind: "calendar_event";
  source: "apple_calendar" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    calendarName?: string;
    startAt?: string;
    endAt?: string | null;
    location?: string | null;
  };
}

export interface NoteObject extends WorkObjectBase {
  kind: "note";
  source: "apple_notes" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    folder?: string;
    createdAtSource?: string | null;
    modifiedAtSource?: string | null;
  };
}

export interface ReminderObject extends WorkObjectBase {
  kind: "reminder";
  source: "apple_reminders" | "voice" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    dueAt?: string | null;
    listName?: string;
    completed?: boolean;
  };
}

export interface FileObject extends WorkObjectBase {
  kind: "file" | "document" | "spreadsheet";
  source: "finder" | "local_directory";
  metadata: WorkObjectBase["metadata"] & {
    path: string;
    extension?: string;
    modifiedAtMs?: number;
    trustedRoot?: string;
  };
}

export interface DirectoryObject extends WorkObjectBase {
  kind: "directory";
  source: "finder" | "local_directory";
  metadata: WorkObjectBase["metadata"] & {
    path: string;
    trustedRoot?: string;
  };
}

export interface TaskObject extends WorkObjectBase {
  kind: "task";
  source: "voice" | "manual" | "surface" | "future_connector";
  metadata: WorkObjectBase["metadata"] & {
    dueAt?: string | null;
    status?: string;
  };
}

export interface DecisionObject extends WorkObjectBase {
  kind: "decision";
  source: "voice" | "manual" | "surface";
  metadata: WorkObjectBase["metadata"] & {
    options?: string[];
    selectedOption?: string;
  };
}

export interface ArtifactObject extends WorkObjectBase {
  kind: "artifact";
  source: "surface" | "manual";
  metadata: WorkObjectBase["metadata"] & {
    artifactType?: string;
  };
}

export interface SurfaceObject extends WorkObjectBase {
  kind: "surface";
  source: "surface";
  metadata: WorkObjectBase["metadata"] & {
    surfaceKind?: string;
    surfaceId?: string;
  };
}

export type WorkObject =
  | EmailMessageObject
  | EmailThreadObject
  | EmailDraftObject
  | CalendarEventObject
  | NoteObject
  | ReminderObject
  | FileObject
  | DirectoryObject
  | TaskObject
  | DecisionObject
  | ArtifactObject
  | SurfaceObject
  | WorkObjectBase;
