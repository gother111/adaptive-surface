export type WorkAvailableAction = "read" | "list" | "search" | "create" | "update" | "delete" | "draft" | "send" | "open" | "summarize";

export interface CanonicalWorkObjectBase {
  id: string;
  source: string;
  title: string;
  subtitle?: string;
  timestamp?: string | number | null;
  body?: string;
  preview?: string | null;
  rawRef?: string;
  nativeId?: string;
  availableActions: WorkAvailableAction[];
}

export interface WorkEmail extends CanonicalWorkObjectBase {
  source: "apple.mail";
  sender: string;
  mailbox: string;
  isRead: boolean;
}

export interface WorkCalendarEvent extends CanonicalWorkObjectBase {
  source: "apple.calendar";
  calendarName: string;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
}

export interface WorkReminder extends CanonicalWorkObjectBase {
  source: "apple.reminders";
  listName: string;
  dueAt?: string | null;
  completed: boolean;
}

export interface WorkNote extends CanonicalWorkObjectBase {
  source: "apple.notes";
  folder: string;
}

export interface WorkContact extends CanonicalWorkObjectBase {
  source: "apple.contacts";
  emails: string[];
  phoneNumbers: string[];
  organization?: string | null;
}

export interface WorkFile extends CanonicalWorkObjectBase {
  source: "local.files";
  path: string;
  extension?: string | null;
  size: number;
  root: string;
  readableType: string;
}

export interface WorkSearchResult extends CanonicalWorkObjectBase {
  source: string;
  resultType: "email" | "calendar" | "reminder" | "note" | "contact" | "file";
}

export interface WorkCommandResult {
  id: string;
  source: string;
  title: string;
  subtitle?: string;
  timestamp?: string | number | null;
  body?: string;
  preview?: string | null;
  rawRef?: string;
  nativeId?: string;
  availableActions: WorkAvailableAction[];
  ok: boolean;
  command: string;
  adapter: string;
  error?: string | null;
}
