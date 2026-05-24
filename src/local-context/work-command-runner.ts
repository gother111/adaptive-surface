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
import { analyzeEmailMessage } from "@/local-context/email-analysis";
import { mergeCapabilityDiagnostics } from "@/local-context/capability-registry";
import type { FoundationCommand, FoundationCommandMemory, PendingApproval } from "@/local-context/work-command-types";
import { assignWorkspaceLayout, shouldCommandBecomePrimary } from "@/workspace/layout/workspace-layout-engine";
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
        patches: surfacePatches(session, command.surfaceKind, approvalProps(command, pendingApproval), command.utterance, command.layoutPreference),
    };
  }

  if (command.kind === "approve_pending_action") {
    return approvePendingAction(command, session, memory);
  }

  try {
    switch (command.kind) {
      case "show_capability_status": {
        const diagnostics = await withTimeout(loadCapabilityDiagnostics(), command.adapter);
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
      case "show_scaffolded_connector_status": {
        const connectorId = String(command.payload.connectorId ?? "unknown");
        const label = connectorLabel(connectorId);
        return result(session, command, memory, {
          title: `${label} connector`,
          status: "needs-configuration",
          command: command.utterance,
          adapter: command.adapter,
          provider: connectorId,
          summary: `${label} is not connected in this local app. It needs OAuth/client configuration before Adaptive Surface can load real data.`,
          detail: {
            connectorId,
            status: "needs-configuration",
            realDataLoaded: false,
          },
          items: [
            {
              label,
              status: "needs-configuration",
              provider: connectorId,
              doesNotWork: "No OAuth flow or token storage is configured in this repo.",
            },
          ],
          suggestedNextAction: "Use Apple/local sources for now, or add a verified OAuth connector before enabling this source.",
        });
      }
      case "show_recent_emails": {
        const messages = await withTimeout(loadMailMessages({ limit: 25, unreadFirst: true }), command.adapter);
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
        const message = await withTimeout(readMailMessage(memory.latestEmailId), command.adapter);
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
      case "summarize_latest_email": {
        if (!memory.latestEmailId) {
          throw new Error("No latest email is loaded yet. Say \"Show recent emails\" first.");
        }
        const message = await withTimeout(readMailMessage(memory.latestEmailId), "read_mail_message");
        const analysis = analyzeEmailMessage(message);
        return result(session, command, { ...memory, latestEmailAnalysis: analysis }, {
          title: "Latest email analysis",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: analysis.summary,
          detail: {
            subject: analysis.subject,
            sender: analysis.sender,
            receivedAt: analysis.receivedAt,
            mailbox: analysis.mailbox,
            requestedAction: analysis.requestedAction,
            relevanceJudgment: analysis.relevanceJudgment,
          },
          items: analysis.evidence.map((evidence, index) => ({
            title: `Evidence ${index + 1}`,
            preview: evidence,
          })),
          body: analysis.artifactBody,
        });
      }
      case "create_email_summary_artifact": {
        if (!memory.latestEmailAnalysis) {
          throw new Error("No latest email analysis is available yet. Say \"Summarize the latest email\" first.");
        }
        const analysis = memory.latestEmailAnalysis;
        return result(session, command, memory, {
          title: "Email analysis document",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: `Created an in-app text artifact from "${analysis.subject || "the latest email"}".`,
          detail: {
            sourceEmailId: analysis.sourceEmailId,
            sender: analysis.sender,
            subject: analysis.subject,
            artifactType: "text/markdown",
            writesToDisk: false,
          },
          body: analysis.artifactBody,
        });
      }
      case "show_today_calendar": {
        const events = await withTimeout(loadCalendarEvents({ daysAhead: 1, limit: 30 }), command.adapter);
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
        const reminders = await withTimeout(loadReminders({ includeCompleted: false, limit: 50 }), command.adapter);
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
        const notes = await withTimeout(loadNotes({ limit: 25 }), command.adapter);
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
        const note = await withTimeout(readNote(memory.latestNoteId), command.adapter);
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
        const contacts = await withTimeout(searchContacts({ query: String(command.payload.query ?? ""), limit: 25 }), command.adapter);
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
        const files = await withTimeout(searchLocalFiles(command.payload), command.adapter);
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
        const file = await withTimeout(readLocalFile({ path: memory.latestFilePath }), command.adapter);
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
      case "unsupported_local_context": {
        return result(session, command, memory, {
          title: "Local context command not understood",
          status: "not_implemented",
          command: command.utterance,
          adapter: command.adapter,
          errorKind: "unsupported",
          didOpenExternalApp: false,
          summary: "This sounded like a local-context request, so it stayed in the foundation path instead of opening a legacy surface.",
          detail: { ...command.payload },
          suggestedNextAction: "Try: show recent emails, show my calendar, show reminders, show notes, find contact Yurii, or show files from Desktop.",
        });
      }
      default:
        throw new Error(`Command ${command.kind} is not implemented in the foundation runner.`);
    }
  } catch (error) {
    return {
      memory,
      patches: surfacePatches(session, command.surfaceKind, errorProps(command, error), command.utterance, command.layoutPreference),
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
      }, command.utterance, command.layoutPreference),
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
      }, command.utterance, command.layoutPreference),
    };
  } catch (error) {
    return {
      memory,
      patches: surfacePatches(session, "command_error", errorProps({ ...command, adapter: pending.kind }, error), command.utterance, command.layoutPreference),
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
    patches: surfacePatches(session, command.surfaceKind, {
      didOpenExternalApp: false,
      ...props,
    }, command.utterance, command.layoutPreference),
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
  const metadata = parseProviderError(message);
  const guidance = providerFailureGuidance(command.adapter, metadata.provider, message);
  const errorKind = guidance.errorKind ?? metadata.errorKind;
  return {
    title: "Command failed",
    status: errorKind === "unsupported"
      ? "not_implemented"
      : errorKind === "permission" || message.toLowerCase().includes("not authorized") || message.toLowerCase().includes("permission")
        ? "permission_error"
        : "adapter_error",
    command: command.utterance,
    adapter: command.adapter,
    provider: metadata.provider,
    didOpenExternalApp: metadata.didOpenExternalApp,
    errorKind,
    error: message,
    summary: guidance.summary,
    suggestedNextAction: guidance.suggestedNextAction,
  };
}

function providerFailureGuidance(
  adapter: string,
  provider: string | undefined,
  message: string,
): Pick<FoundationSurfaceProps, "summary" | "suggestedNextAction" | "errorKind"> {
  const lower = message.toLowerCase();
  const target = `${adapter} ${provider ?? ""} ${message}`.toLowerCase();

  if (target.includes("calendar")) {
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        summary: "Calendar permission or data loading timed out.",
        suggestedNextAction: "Retry the Calendar command. If a macOS prompt is visible, answer it before the adapter timeout.",
        errorKind: "timeout",
      };
    }
    return {
      summary: "Calendar access is not available to the Adaptive Surface app process.",
      suggestedNextAction: "Allow Adaptive Surface in System Settings > Privacy & Security > Calendars, then run the Calendar command again.",
      errorKind: "permission",
    };
  }

  if (target.includes("reminder")) {
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        summary: "Reminders permission or data loading timed out.",
        suggestedNextAction: "Retry the Reminders command. If a macOS prompt is visible, answer it before the adapter timeout.",
        errorKind: "timeout",
      };
    }
    return {
      summary: "Reminders access is not available to the Adaptive Surface app process.",
      suggestedNextAction: "Allow Adaptive Surface in System Settings > Privacy & Security > Reminders, then run the Reminders command again.",
      errorKind: "permission",
    };
  }

  if (target.includes("contact")) {
    if (lower.includes("timeout") || lower.includes("timed out")) {
      return {
        summary: "Contacts permission or data loading timed out.",
        suggestedNextAction: "Retry the contact search. If a macOS prompt is visible, answer it before the adapter timeout.",
        errorKind: "timeout",
      };
    }
    return {
      summary: "Contacts access is not available to the Adaptive Surface app process.",
      suggestedNextAction: "Allow Adaptive Surface in System Settings > Privacy & Security > Contacts, then run the contact search again.",
      errorKind: "permission",
    };
  }

  if (target.includes("mail") || target.includes("envelopeindex")) {
    if (lower.includes("operation not permitted") || lower.includes("os error 1") || lower.includes("full_disk_access_missing")) {
      return {
        summary: "Mail metadata is blocked by macOS Full Disk Access.",
        suggestedNextAction: "Add Adaptive Surface to System Settings > Privacy & Security > Full Disk Access. In dev, also add the terminal or dev runner used by npm run tauri:dev.",
        errorKind: "permission",
      };
    }
    if (lower.includes("not running")) {
      return {
        summary: "Mail fallback is available only when Mail is already running.",
        suggestedNextAction: "Open Mail yourself if you want the AppleScript fallback, or grant Full Disk Access so Adaptive Surface can read the local Envelope Index without opening Mail.",
        errorKind: "unavailable",
      };
    }
    if (lower.includes("automation")) {
      return {
        summary: "Mail AppleScript fallback needs Automation permission.",
        suggestedNextAction: "Allow Adaptive Surface to control Mail in System Settings > Privacy & Security > Automation, or use Full Disk Access for the Envelope Index path.",
        errorKind: "permission",
      };
    }
    return {
      summary: "Mail metadata is unavailable from the local Envelope Index and the non-opening fallback did not succeed.",
      suggestedNextAction: "Run \"Show capability status\" to inspect the Mail adapter details.",
    };
  }

  if (target.includes("notes")) {
    if (lower.includes("fallback_requires_notes_running")) {
      return {
        summary: "Local Notes database decoding is not implemented, and the fallback requires Notes to already be running.",
        suggestedNextAction: "Open Notes yourself before retrying if you want the AppleScript fallback. Adaptive Surface will not open Notes automatically.",
        errorKind: "unavailable",
      };
    }
    if (lower.includes("fallback_requires_automation")) {
      return {
        summary: "Local Notes database decoding is not implemented, and the fallback needs Automation permission.",
        suggestedNextAction: "Allow Adaptive Surface to control Notes in System Settings > Privacy & Security > Automation, then retry while Notes is running.",
        errorKind: "permission",
      };
    }
    if (lower.includes("fallback_timeout")) {
      return {
        summary: "Notes fallback timed out.",
        suggestedNextAction: "Retry after confirming Notes is responsive, or wait for local Notes database decoding to be implemented.",
        errorKind: "timeout",
      };
    }
    return {
      summary: "Local Notes database decoding is not implemented in this app yet.",
      suggestedNextAction: "Use the Notes AppleScript fallback only when Notes is already running and Automation is allowed.",
      errorKind: "unsupported",
    };
  }

  return {
    summary: "The local adapter failed before returning data.",
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
  layoutPreference?: FoundationCommand["layoutPreference"],
): WorkspacePatch[] {
  const now = Date.now();
  const surface = createFoundationSurface(session, surfaceKind, props, now, utterance, layoutPreference);
  const shouldBecomePrimary = surface.role === "primary";
  return [
    {
      type: "UPSERT_SURFACE",
      surface,
    },
    ...(shouldBecomePrimary ? [{ type: "SET_PRIMARY_SURFACE" as const, surfaceId: surface.id }] : []),
    { type: "STORE_CONTEXT_RESULT", key: surfaceKind, value: props },
  ];
}

function createFoundationSurface(
  session: WorkspaceSession,
  surfaceKind: string,
  props: FoundationSurfaceProps,
  now: number,
  utterance: string,
  layoutPreference?: FoundationCommand["layoutPreference"],
): SurfaceInstance {
  const startOver = /\b(start over|clear|new workspace)\b/i.test(utterance);
  const layout = commandLayout(surfaceKind, layoutPreference, startOver);

  return {
    id: `foundation-${surfaceKind}`,
    kind: surfaceKind as SurfaceInstance["kind"],
    role: layout.role,
    zone: layout.zone,
    status: "active",
    createdAt: now,
    updatedAt: now,
    props: { ...props },
  };
}

function commandLayout(surfaceKind: string, layoutPreference: FoundationCommand["layoutPreference"] | undefined, startOver: boolean) {
  if (layoutPreference === "supporting") return assignWorkspaceLayout({ kind: surfaceKind as SurfaceInstance["kind"] }, { makePrimary: false });
  if (layoutPreference === "temporary") return { role: "temporary" as const, zone: "bottomDock" as const };
  return assignWorkspaceLayout({ kind: surfaceKind as SurfaceInstance["kind"] }, {
    makePrimary: startOver || shouldCommandBecomePrimary(surfaceKind as SurfaceInstance["kind"]),
  });
}

function connectorLabel(connectorId: string) {
  if (connectorId === "gmail") return "Gmail";
  if (connectorId === "google.calendar") return "Google Calendar";
  if (connectorId === "google.drive") return "Google Drive";
  return "Connector";
}

async function withTimeout<T>(promise: Promise<T>, adapter: string, timeoutMs = 12_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`provider=${adapter} errorKind=timeout didOpenExternalApp=false exactError=Adapter timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseProviderError(message: string) {
  return {
    provider: message.match(/provider=([^ ]+)/)?.[1],
    didOpenExternalApp: message.match(/didOpenExternalApp=(true|false)/)?.[1] === "true",
    errorKind: normalizeErrorKind(message.match(/errorKind=([A-Za-z]+)/)?.[1]),
  };
}

function normalizeErrorKind(value?: string): FoundationSurfaceProps["errorKind"] | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "permission" || lower === "unavailable" || lower === "adapter" || lower === "timeout" || lower === "unsupported") {
    return lower;
  }
  return undefined;
}
