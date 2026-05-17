import {
  createCalendarEvent,
  createNote,
  createReminder,
  loadCalendarEvents,
  loadCapabilityDiagnostics,
  loadMailMessages,
  loadNotes,
  loadReminders,
  readLocalFile,
  readMailMessage,
  readNote,
  searchContacts,
  searchLocalFiles,
} from "@/lib/context-api";
import { mergeCapabilityDiagnostics } from "@/local-context/capability-registry";
import type { FoundationCommand, FoundationCommandMemory, PendingApproval } from "@/local-context/work-command-types";
import type { FoundationSurfaceProps, SurfaceInstance, WorkspacePatch, WorkspaceSession } from "@/workspace/types";

export interface FoundationCommandRunResult {
  patches: WorkspacePatch[];
  memory: FoundationCommandMemory;
}

export async function runFoundationCommand(
  command: FoundationCommand,
  session: WorkspaceSession,
  memory: FoundationCommandMemory,
): Promise<FoundationCommandRunResult> {
  if (command.requiresApproval) {
    const pendingApproval = pendingFromCommand(command);
    return {
      memory: { ...memory, pendingApproval },
      patches: surfacePatches(session, command.surfaceKind, approvalProps(command, pendingApproval), command.utterance),
    };
  }

  if (command.kind === "approve_pending_action") {
    return approvePendingAction(command, session, memory);
  }

  try {
    switch (command.kind) {
      case "show_capability_status": {
        const diagnostics = await loadCapabilityDiagnostics();
        const capabilities = mergeCapabilityDiagnostics(diagnostics);
        return result(session, command, memory, {
          title: "Capability status",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: "Real local capability diagnostics. Google connectors are configuration-only.",
          items: capabilities.map((capability) => ({ ...capability })),
        });
      }
      case "show_recent_emails": {
        const messages = await loadMailMessages({ limit: 25, unreadFirst: true });
        return result(session, command, { ...memory, latestEmailId: messages[0]?.id }, {
          title: "Recent emails",
          status: messages.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: messages.length ? `${messages.length} real Apple Mail messages loaded.` : "Apple Mail returned no messages.",
          items: messages.map((message) => ({ ...message })),
        });
      }
      case "open_latest_email": {
        if (!memory.latestEmailId) {
          throw new Error("No latest email is loaded yet. Say \"Show recent emails\" first.");
        }
        const message = await readMailMessage(memory.latestEmailId);
        return result(session, command, memory, {
          title: message.subject || "Email detail",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: `From ${message.sender}`,
          detail: { ...message, body: undefined },
          body: message.body,
        });
      }
      case "show_today_calendar": {
        const events = await loadCalendarEvents({ daysAhead: 1, limit: 30 });
        return result(session, command, memory, {
          title: "Today's calendar",
          status: events.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: events.length ? `${events.length} real Calendar events loaded.` : "Apple Calendar returned no events for today.",
          items: events.map((event) => ({ ...event })),
        });
      }
      case "show_reminders": {
        const reminders = await loadReminders({ includeCompleted: false, limit: 50 });
        return result(session, command, memory, {
          title: "Reminders",
          status: reminders.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: reminders.length ? `${reminders.length} real reminders loaded.` : "Apple Reminders returned no open reminders.",
          items: reminders.map((reminder) => ({ ...reminder })),
        });
      }
      case "show_recent_notes": {
        const notes = await loadNotes({ limit: 25 });
        return result(session, command, { ...memory, latestNoteId: notes[0]?.id }, {
          title: "Recent notes",
          status: notes.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: notes.length ? `${notes.length} real Apple Notes loaded.` : "Apple Notes returned no notes.",
          items: notes.map((note) => ({ ...note })),
        });
      }
      case "open_latest_note": {
        if (!memory.latestNoteId) {
          throw new Error("No latest note is loaded yet. Say \"Show recent notes\" first.");
        }
        const note = await readNote(memory.latestNoteId);
        return result(session, command, memory, {
          title: note.title,
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: note.folder,
          detail: { ...note, body: undefined },
          body: note.body,
        });
      }
      case "find_contacts": {
        const contacts = await searchContacts({ query: String(command.payload.query ?? ""), limit: 25 });
        return result(session, command, memory, {
          title: "Contacts",
          status: contacts.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: contacts.length ? `${contacts.length} matching contacts found.` : "Apple Contacts returned no matches.",
          items: contacts.map((contact) => ({ ...contact })),
        });
      }
      case "show_files":
      case "search_files": {
        const files = await searchLocalFiles(command.payload);
        return result(session, command, { ...memory, latestFilePath: files[0]?.path }, {
          title: command.kind === "show_files" ? `Files from ${command.payload.root ?? "trusted roots"}` : "File search",
          status: files.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: files.length ? `${files.length} real local files found.` : "No matching files found in trusted roots.",
          items: files.map((file) => ({ ...file })),
        });
      }
      case "open_file_summary": {
        if (!memory.latestFilePath) {
          throw new Error("No file is selected yet. Say \"Show files from Desktop\" or \"Search Documents for PDF files\" first.");
        }
        const file = await readLocalFile({ path: memory.latestFilePath });
        return result(session, command, memory, {
          title: file.file.name,
          status: file.supported ? "available" : "not_implemented",
          command: command.utterance,
          adapter: command.adapter,
          summary: file.supported ? `Read ${file.chunks.length} text chunks.` : file.error ?? "Unsupported file type.",
          detail: { ...file.file, error: file.error },
          body: file.contentPreview,
          error: file.error,
          suggestedNextAction: file.supported ? undefined : "Choose a .txt, .md, .json, .csv, or .html file.",
        });
      }
      default:
        throw new Error(`Command ${command.kind} is not implemented in the foundation runner.`);
    }
  } catch (error) {
    return {
      memory,
      patches: surfacePatches(session, "command_error", errorProps(command, error), command.utterance),
    };
  }
}

async function approvePendingAction(
  command: FoundationCommand,
  session: WorkspaceSession,
  memory: FoundationCommandMemory,
): Promise<FoundationCommandRunResult> {
  const pending = memory.pendingApproval;
  if (!pending) {
    return {
      memory,
      patches: surfacePatches(session, "command_error", {
        title: "No pending approval",
        status: "adapter_error",
        command: command.utterance,
        adapter: "approval",
        error: "There is no pending write action to approve.",
        permissionHint: "Start a create command first.",
      }, command.utterance),
    };
  }

  try {
    const response =
      pending.kind === "create_calendar_event"
        ? await createCalendarEvent(pending.request)
        : pending.kind === "create_reminder"
          ? await createReminder(pending.request)
          : await createNote(pending.request);

    return {
      memory: { ...memory, pendingApproval: undefined },
      patches: surfacePatches(session, pending.kind === "create_note" ? "note_detail" : pending.kind === "create_reminder" ? "reminder_list" : "calendar_day", {
        title: "Approved action completed",
        status: response.ok ? "available" : "adapter_error",
        command: pending.utterance,
        adapter: pending.kind,
        summary: response.message,
        detail: { ...response },
      }, command.utterance),
    };
  } catch (error) {
    return {
      memory,
      patches: surfacePatches(session, "command_error", errorProps({ ...command, adapter: pending.kind }, error), command.utterance),
    };
  }
}

function result(
  session: WorkspaceSession,
  command: FoundationCommand,
  memory: FoundationCommandMemory,
  props: FoundationSurfaceProps,
): FoundationCommandRunResult {
  return {
    memory,
    patches: surfacePatches(session, command.surfaceKind, props, command.utterance),
  };
}

function approvalProps(command: FoundationCommand, pendingApproval: PendingApproval): FoundationSurfaceProps {
  return {
    title: "Approval required",
    status: "needs_approval",
    command: command.utterance,
    adapter: command.adapter,
    summary: "Review this local write action. Say \"approve\" to run it.",
    approval: {
      actionId: pendingApproval.kind,
      label: pendingApproval.kind.replace(/_/g, " "),
      preview: { ...pendingApproval.request },
    },
    detail: { ...pendingApproval.request },
  };
}

function errorProps(command: Pick<FoundationCommand, "utterance" | "adapter">, error: unknown): FoundationSurfaceProps {
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: "Command failed",
    status: message.toLowerCase().includes("not authorized") || message.toLowerCase().includes("permission") ? "permission_error" : "adapter_error",
    command: command.utterance,
    adapter: command.adapter,
    error: message,
    permissionHint: "If this is a macOS app permission issue, open System Settings > Privacy & Security > Automation and allow Adaptive Surface to control the target app.",
    suggestedNextAction: "Run \"Show capability status\" to inspect the adapter.",
  };
}

function pendingFromCommand(command: FoundationCommand): PendingApproval {
  if (command.kind === "create_calendar_event") {
    return { kind: "create_calendar_event", request: command.payload as unknown as PendingApproval["request"], utterance: command.utterance } as PendingApproval;
  }
  if (command.kind === "create_reminder") {
    return { kind: "create_reminder", request: command.payload as unknown as PendingApproval["request"], utterance: command.utterance } as PendingApproval;
  }
  return { kind: "create_note", request: command.payload as unknown as PendingApproval["request"], utterance: command.utterance } as PendingApproval;
}

function surfacePatches(
  session: WorkspaceSession,
  surfaceKind: string,
  props: FoundationSurfaceProps,
  utterance: string,
): WorkspacePatch[] {
  const now = Date.now();
  const surface = createFoundationSurface(session, surfaceKind, props, now, utterance);
  return [
    { type: "APPEND_UTTERANCE", utterance: { id: crypto.randomUUID(), text: utterance, createdAt: now } },
    { type: "CREATE_SURFACE", surface },
    ...(surface.role === "primary" ? [{ type: "SET_PRIMARY_SURFACE" as const, surfaceId: surface.id }] : []),
    { type: "STORE_CONTEXT_RESULT", key: surfaceKind, value: props },
  ];
}

function createFoundationSurface(
  session: WorkspaceSession,
  surfaceKind: string,
  props: FoundationSurfaceProps,
  now: number,
  utterance: string,
): SurfaceInstance {
  const startOver = /\b(start over|clear|new workspace)\b/i.test(utterance);
  const hasPrimary = Boolean(session.primarySurfaceId);
  const role = !hasPrimary || startOver ? "primary" : "supporting";

  return {
    id: `foundation-${surfaceKind}`,
    kind: surfaceKind as SurfaceInstance["kind"],
    role,
    zone: role === "primary" ? "main" : "bottom_left",
    status: "active",
    createdAt: now,
    updatedAt: now,
    props: { ...props },
  };
}
