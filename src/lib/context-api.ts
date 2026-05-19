import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  AppleCalendarEvent,
  AppleCommandResult,
  AppleContact,
  AppleContextBundle,
  AppleMailMessage,
  AppleMailMessageDetail,
  AppleNoteDetail,
  AppleNotePreview,
  AppleReminder,
  CalendarQuery,
  CapabilityDiagnostic,
  ContactQuery,
  CreateCalendarEventRequest,
  CreateNoteRequest,
  CreateReminderRequest,
  ExternalAuthRequirement,
  FileReadQuery,
  FileReadResult,
  FileSearchQuery,
  LocalContextPreview,
  MailQuery,
  NativePermissionDebug,
  NotesQuery,
  ReminderQuery,
  UpdateReminderRequest,
  WorkFileRecord,
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

export async function createCalendarEvent(request: CreateCalendarEventRequest): Promise<AppleCommandResult> {
  ensureTauri("Apple Calendar writes are available only inside the Tauri desktop runtime.");
  return invoke<AppleCommandResult>("create_calendar_event", { request });
}

export async function loadMailMessages(query: MailQuery = {}): Promise<AppleMailMessage[]> {
  if (!isTauriRuntime()) {
    throw new Error("Apple Mail context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleMailMessage[]>("load_mail_messages", { query });
}

export async function readMailMessage(id: string): Promise<AppleMailMessageDetail> {
  ensureTauri("Apple Mail full-message reads are available only inside the Tauri desktop runtime.");
  return invoke<AppleMailMessageDetail>("read_mail_message", { id });
}

export async function loadNotes(query: NotesQuery = {}): Promise<AppleNotePreview[]> {
  if (!isTauriRuntime()) {
    throw new Error("Apple Notes context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleNotePreview[]>("load_notes", { query });
}

export async function readNote(id: string): Promise<AppleNoteDetail> {
  ensureTauri("Apple Notes full-note reads are available only inside the Tauri desktop runtime.");
  return invoke<AppleNoteDetail>("read_note", { id });
}

export async function createNote(request: CreateNoteRequest): Promise<AppleCommandResult> {
  ensureTauri("Apple Notes writes are available only inside the Tauri desktop runtime.");
  return invoke<AppleCommandResult>("create_note", { request });
}

export async function loadReminders(query: ReminderQuery = {}): Promise<AppleReminder[]> {
  ensureTauri("Apple Reminders context is available only inside the Tauri desktop runtime.");
  return invoke<AppleReminder[]>("load_reminders", { query });
}

export async function createReminder(request: CreateReminderRequest): Promise<AppleCommandResult> {
  ensureTauri("Apple Reminders writes are available only inside the Tauri desktop runtime.");
  return invoke<AppleCommandResult>("create_reminder", { request });
}

export async function updateReminder(request: UpdateReminderRequest): Promise<AppleCommandResult> {
  ensureTauri("Apple Reminders updates are available only inside the Tauri desktop runtime.");
  return invoke<AppleCommandResult>("update_reminder", { request });
}

export async function searchContacts(query: ContactQuery): Promise<AppleContact[]> {
  ensureTauri("Apple Contacts search is available only inside the Tauri desktop runtime.");
  return invoke<AppleContact[]>("search_contacts", { query });
}

export async function loadCapabilityDiagnostics(): Promise<CapabilityDiagnostic[]> {
  ensureTauri("Capability diagnostics are available only inside the Tauri desktop runtime.");
  return invoke<CapabilityDiagnostic[]>("load_capability_diagnostics");
}

export async function searchLocalFiles(query: FileSearchQuery): Promise<WorkFileRecord[]> {
  ensureTauri("Local file search is available only inside the Tauri desktop runtime.");
  return invoke<WorkFileRecord[]>("search_local_files", { query });
}

export async function readLocalFile(query: FileReadQuery): Promise<FileReadResult> {
  ensureTauri("Local file reads are available only inside the Tauri desktop runtime.");
  return invoke<FileReadResult>("read_local_file", { query });
}

export async function loadAppleContextBundle(): Promise<AppleContextBundle> {
  if (!isTauriRuntime()) {
    throw new Error("Apple app context is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleContextBundle>("load_apple_context_bundle");
}

export async function loadNativePermissionDebug(): Promise<NativePermissionDebug> {
  ensureTauri("Native permission diagnostics are available only inside the Tauri desktop runtime.");
  return invoke<NativePermissionDebug>("load_native_permission_debug");
}

function ensureTauri(message: string) {
  if (!isTauriRuntime()) {
    throw new Error(message);
  }
}
