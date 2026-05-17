import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  AppleCalendarEvent,
  AppleContextBundle,
  AppleMailMessage,
  AppleNotePreview,
  CalendarQuery,
  ExternalAuthRequirement,
  LocalContextPreview,
  MailQuery,
  NotesQuery,
} from "@/types/context";

export async function loadLocalContextPreview(
  trustedRoots: string[],
  personalIndexPath: string,
): Promise<LocalContextPreview> {
  if (!isTauriRuntime()) {
    throw new Error("Local context preview is available only inside the Tauri desktop runtime.");
  }

  return invoke<LocalContextPreview>("load_local_context_preview", {
    trustedRoots,
    personalIndexPath,
  });
}

export async function loadExternalAuthRequirements(): Promise<ExternalAuthRequirement[]> {
  if (!isTauriRuntime()) {
    throw new Error("OAuth requirements are available only inside the Tauri desktop runtime.");
  }

  return invoke<ExternalAuthRequirement[]>("load_external_auth_requirements");
}

export async function loadCalendarEvents(query: CalendarQuery = {}): Promise<AppleCalendarEvent[]> {
  if (!isTauriRuntime()) {
    throw new Error("Apple Calendar context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleCalendarEvent[]>("load_calendar_events", { query });
}

export async function loadMailMessages(query: MailQuery = {}): Promise<AppleMailMessage[]> {
  if (!isTauriRuntime()) {
    throw new Error("Apple Mail context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleMailMessage[]>("load_mail_messages", { query });
}

export async function loadNotes(query: NotesQuery = {}): Promise<AppleNotePreview[]> {
  if (!isTauriRuntime()) {
    throw new Error("Apple Notes context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleNotePreview[]>("load_notes", { query });
}

export async function loadAppleContextBundle(): Promise<AppleContextBundle> {
  if (!isTauriRuntime()) {
    throw new Error("Apple app context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleContextBundle>("load_apple_context_bundle");
}
