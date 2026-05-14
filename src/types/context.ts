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

export interface AppleContextPreview {
  calendarEvents: string[];
  reminders: string[];
  notes: string[];
  mailMessages: string[];
  warnings: string[];
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
