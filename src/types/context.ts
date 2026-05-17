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

export interface AppleNotePreview {
  id: string;
  title: string;
  folder: string;
  createdAt?: string | null;
  modifiedAt?: string | null;
  preview?: string | null;
}

export interface AppleContextWarning {
  source: "calendar" | "mail" | "notes" | "system";
  message: string;
}

export interface AppleContextBundle {
  calendarEvents: AppleCalendarEvent[];
  mailMessages: AppleMailMessage[];
  notes: AppleNotePreview[];
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
