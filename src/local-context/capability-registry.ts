import type { CapabilityDiagnostic } from "@/types/context";

export type LocalCapabilityId =
  | "apple.mail"
  | "apple.calendar"
  | "apple.reminders"
  | "apple.notes"
  | "apple.contacts"
  | "local.files"
  | "google.calendar"
  | "google.drive";

export type LocalCapabilityStatus = "available" | "needs-permission" | "needs-configuration" | "failed" | "not-implemented";
export type LocalCapabilityOperation = "read" | "list" | "search" | "create" | "update" | "delete" | "draft" | "send";

export interface LocalCapabilityDefinition {
  id: LocalCapabilityId;
  label: string;
  provider: string;
  status: LocalCapabilityStatus;
  supportedOperations: LocalCapabilityOperation[];
  lastCheckedAt: number | null;
  lastError: string | null;
  permissionInstructions: string;
  testCommandExamples: string[];
}

export const localCapabilityRegistry: Record<LocalCapabilityId, LocalCapabilityDefinition> = {
  "apple.mail": definition("apple.mail", "Apple Mail", "AppleScript", "needs-permission", ["read", "list", "search", "draft"], ["show recent emails", "open latest email fully"]),
  "apple.calendar": definition("apple.calendar", "Apple Calendar", "AppleScript", "needs-permission", ["read", "list", "create"], ["show today's calendar"]),
  "apple.reminders": definition("apple.reminders", "Apple Reminders", "AppleScript", "needs-permission", ["read", "list", "create", "update"], ["show my reminders"]),
  "apple.notes": definition("apple.notes", "Apple Notes", "AppleScript", "needs-permission", ["read", "list", "search", "create", "update"], ["show recent notes", "open latest note fully"]),
  "apple.contacts": definition("apple.contacts", "Apple Contacts", "AppleScript", "needs-permission", ["read", "search"], ["find contacts named Yurii"]),
  "local.files": definition("local.files", "Local files", "Tauri filesystem", "available", ["read", "list", "search"], ["show files from Desktop", "search Documents for PDF files"]),
  "google.calendar": definition("google.calendar", "Google Calendar", "Google OAuth", "needs-configuration", ["read", "list", "search"], []),
  "google.drive": definition("google.drive", "Google Drive", "Google OAuth", "needs-configuration", ["read", "list", "search"], []),
};

export function mergeCapabilityDiagnostics(diagnostics: CapabilityDiagnostic[]): LocalCapabilityDefinition[] {
  return Object.values(localCapabilityRegistry).map((definition) => {
    const diagnostic = diagnostics.find((item) => item.id === definition.id);
    if (!diagnostic) {
      return definition;
    }

    return {
      ...definition,
      provider: diagnostic.provider,
      status: diagnostic.status,
      supportedOperations: diagnostic.supportedOperations as LocalCapabilityOperation[],
      lastCheckedAt: diagnostic.lastCheckedAt,
      lastError: diagnostic.lastError ?? null,
      permissionInstructions: diagnostic.permissionInstructions,
      testCommandExamples: diagnostic.testCommandExamples,
    };
  });
}

function definition(
  id: LocalCapabilityId,
  label: string,
  provider: string,
  status: LocalCapabilityStatus,
  supportedOperations: LocalCapabilityOperation[],
  testCommandExamples: string[],
): LocalCapabilityDefinition {
  return {
    id,
    label,
    provider,
    status,
    supportedOperations,
    lastCheckedAt: null,
    lastError: null,
    permissionInstructions: "Open the matching macOS app once, then approve Adaptive Surface in System Settings > Privacy & Security > Automation if prompted.",
    testCommandExamples,
  };
}
