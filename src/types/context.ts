import type { ContextSourceId } from "@/types/surface";

export interface LocalContextExtensionCount {
  extension: string;
  count: number;
}

export interface LocalContextRecentFile {
  path: string;
  modifiedAtMs: number;
}

export interface LocalContextPreview {
  trustedRoots: string[];
  personalIndexPath: string;
  indexFound: boolean;
  totalFiles: number;
  totalDirectories: number;
  scannedEntries: number;
  topExtensions: LocalContextExtensionCount[];
  recentFiles: LocalContextRecentFile[];
  indexPreview: string[];
}

export interface CalendarQuery {
  daysAhead?: number;
  limit?: number;
}

export interface MailQuery {
  limit?: number;
  unreadFirst?: boolean;
}

export interface NotesQuery {
  limit?: number;
}

export interface ReminderQuery {
  limit?: number;
  includeCompleted?: boolean;
}

export interface ContactQuery {
  query: string;
  limit?: number;
}

export interface FileSearchQuery {
  root?: "Desktop" | "Documents" | "Downloads" | string;
  query?: string;
  extension?: string;
  modifiedAfterMs?: number;
  limit?: number;
}

export interface FileReadQuery {
  path: string;
}

export interface AppleCalendarEvent {
  id: string;
  title: string;
  calendarName: string;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface AppleMailMessage {
  id: string;
  mailbox: string;
  subject: string;
  sender: string;
  receivedAt?: string | null;
  isRead: boolean;
  preview?: string | null;
}

export interface AppleMailMessageDetail extends AppleMailMessage {
  body: string;
}

export interface AppleNotePreview {
  id: string;
  title: string;
  folder: string;
  createdAt?: string | null;
  modifiedAt?: string | null;
  preview?: string | null;
}

export interface AppleNoteDetail {
  id: string;
  title: string;
  folder: string;
  createdAt?: string | null;
  modifiedAt?: string | null;
  body: string;
}

export interface AppleReminder {
  id: string;
  title: string;
  listName: string;
  dueAt?: string | null;
  completed: boolean;
  notes?: string | null;
}

export interface AppleContact {
  id: string;
  displayName: string;
  emails: string[];
  phoneNumbers: string[];
  organization?: string | null;
}

export interface AppleCommandResult {
  id: string;
  ok: boolean;
  message: string;
}

export interface CreateCalendarEventRequest {
  title: string;
  startAt: string;
  endAt?: string | null;
  calendarName?: string | null;
  notes?: string | null;
}

export interface CreateReminderRequest {
  title: string;
  dueAt?: string | null;
  listName?: string | null;
  notes?: string | null;
}

export interface UpdateReminderRequest {
  id: string;
  dueAt?: string | null;
  completed?: boolean | null;
}

export interface CreateNoteRequest {
  title: string;
  body?: string | null;
  folderName?: string | null;
}

export interface WorkFileRecord {
  id: string;
  path: string;
  name: string;
  extension?: string | null;
  size: number;
  modifiedAt?: number | null;
  root: string;
  readableType: string;
}

export interface FileReadResult {
  file: WorkFileRecord;
  supported: boolean;
  contentPreview: string;
  chunks: string[];
  error?: string | null;
}

export interface CapabilityDiagnostic {
  id: string;
  label: string;
  provider: string;
  status: "available" | "needs-permission" | "needs-configuration" | "failed" | "not-implemented";
  supportedOperations: Array<"read" | "list" | "search" | "create" | "update" | "delete" | "draft" | "send" | string>;
  lastCheckedAt: number;
  lastError?: string | null;
  permissionInstructions: string;
  testCommandExamples: string[];
  works: string[];
  doesNotWork: string[];
}

export interface AppleContextWarning {
  source: "calendar" | "mail" | "notes" | "reminders" | "contacts" | "system";
  message: string;
}

export interface AppleContextBundle {
  calendarEvents: AppleCalendarEvent[];
  mailMessages: AppleMailMessage[];
  notes: AppleNotePreview[];
  reminders: AppleReminder[];
  warnings: AppleContextWarning[];
  loadedAt: number;
}

export interface ExternalAuthRequirement {
  id: ContextSourceId;
  label: string;
  provider: string;
  status: "ready-to-configure";
  requiredValues: string[];
  redirectStrategy: string;
  notes: string[];
}

export interface NativePermissionDebug {
  appBundleIdentifier: string;
  executablePath?: string | null;
  calendar: Record<string, unknown>;
  reminders: Record<string, unknown>;
  contacts: Record<string, unknown>;
  mail: Record<string, unknown>;
  notes: Record<string, unknown>;
  didOpenExternalApp: false;
}
