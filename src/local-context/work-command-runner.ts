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
import type { AppleCalendarEvent, AppleMailMessage, AppleNotePreview, AppleReminder } from "@/types/context";
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

  if (command.kind === "cancel_pending_action") {
    return {
      memory: { ...memory, pendingApproval: undefined },
      patches: surfacePatches(session, command.surfaceKind, {
        title: "Pending action canceled",
        status: "available",
        command: command.utterance,
        adapter: command.adapter,
        summary: memory.pendingApproval
          ? "The pending local write action was cleared. Nothing was created."
          : "No pending approval was active. Nothing was created.",
        detail: {
          clearedAction: memory.pendingApproval?.kind ?? null,
          writesToDisk: false,
          externalWrite: false,
        },
      }, command.utterance, command.layoutPreference),
    };
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
      case "show_daily_briefing": {
        const [messages, events, reminders] = await Promise.all([
          withTimeout(loadMailMessages({ limit: 5, unreadFirst: true }), "load_mail_messages"),
          withTimeout(loadCalendarEvents({ daysAhead: 1, limit: 10 }), "load_calendar_events"),
          withTimeout(loadReminders({ includeCompleted: false, limit: 10 }), "load_reminders"),
        ]);
        const body = dailyBriefingBody(messages, events, reminders);
        return result(session, command, {
          ...memory,
          latestEmailId: messages[0]?.id ?? memory.latestEmailId,
        }, {
          title: "Morning Briefing",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: `${messages.length} mail items, ${events.length} calendar events, and ${reminders.length} reminders checked.`,
          detail: {
            artifactType: "text/markdown",
            writesToDisk: false,
            mailCount: messages.length,
            calendarCount: events.length,
            reminderCount: reminders.length,
          },
          body,
        });
      }
      case "show_payment_items": {
        const [messages, reminders] = await Promise.all([
          withTimeout(loadMailMessages({ limit: 25, unreadFirst: true }), "load_mail_messages"),
          withTimeout(loadReminders({ includeCompleted: false, limit: 50 }), "load_reminders"),
        ]);
        const body = paymentAttentionBody(messages, reminders);
        return result(session, command, {
          ...memory,
          latestEmailId: messages[0]?.id ?? memory.latestEmailId,
        }, {
          title: "Payment Attention",
          status: "available",
          command: command.utterance,
          adapter: command.adapter,
          summary: "Recent mail and reminders were checked for payment, bill, invoice, receipt, and subscription signals.",
          detail: {
            artifactType: "text/markdown",
            writesToDisk: false,
            mailMatches: filterPaymentSignals(messages).length,
            reminderMatches: filterPaymentSignals(reminders).length,
          },
          body,
        });
      }
      case "prepare_next_meeting": {
        const events = await withTimeout(loadCalendarEvents({ daysAhead: 1, limit: 10 }), "load_calendar_events");
        const { notes, warning: notesWarning } = await loadOptionalMeetingNotes();
        const body = meetingPrepBody(events[0], notes[0], notesWarning);
        return result(session, command, {
          ...memory,
          latestNoteId: notes[0]?.id ?? memory.latestNoteId,
        }, {
          title: "Meeting Prep",
          status: events.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: events.length
            ? `Prepared a brief for ${String(events[0]?.title ?? "the next meeting")}${notesWarning ? " with Notes skipped." : "."}`
            : "No calendar event found for the next meeting window.",
          detail: {
            artifactType: "text/markdown",
            writesToDisk: false,
            eventId: events[0]?.id,
            noteId: notes[0]?.id,
            notesStatus: notesWarning ? "skipped" : "loaded",
            notesWarning,
          },
          body,
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
      case "create_email_triage_artifact": {
        const messages = await withTimeout(loadMailMessages({ limit: 25, unreadFirst: true }), "load_mail_messages");
        return result(session, command, { ...memory, latestEmailId: messages[0]?.id ?? memory.latestEmailId }, {
          title: emailTriageTitle(command.payload.mode),
          status: messages.length ? "available" : "empty",
          command: command.utterance,
          adapter: command.adapter,
          summary: messages.length
            ? `Created a read-only inbox triage artifact from ${messages.length} Apple Mail metadata rows.`
            : "Apple Mail returned no messages to triage.",
          detail: {
            artifactType: "text/markdown",
            source: "Apple Mail metadata",
            mailCount: messages.length,
            writesToDisk: false,
            externalWrite: false,
            writesToMailbox: false,
            fullBodiesRead: false,
            mode: command.payload.mode,
          },
          items: emailTriageItems(messages),
          body: emailTriageBody(command.utterance, messages, command.payload.mode),
          suggestedNextAction: messages.length
            ? "Review the in-app triage artifact. Ask for a specific latest-email summary if full-message evidence is needed."
            : "Run the command again after Mail metadata is available.",
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
      case "unsupported_email_action": {
        const prohibitedOutcomes = Array.isArray(command.payload.prohibitedOutcomes)
          ? command.payload.prohibitedOutcomes.filter((item): item is string => typeof item === "string")
          : [];
        return result(session, command, memory, {
          title: "Email action not available yet",
          status: "not_implemented",
          command: command.utterance,
          adapter: command.adapter,
          summary: "No email was sent, forwarded, deleted, archived, labeled, reported, scheduled, or changed.",
          detail: {
            intent: command.payload.intent,
            confidence: command.payload.confidence,
            proposedAction: command.payload.proposedAction,
            confirmationRequirement: command.payload.confirmationRequirement,
            reversibility: command.payload.reversibility,
            externalWrite: false,
            writesToMailbox: false,
          },
          items: prohibitedOutcomes.map((outcome) => ({
            label: outcome,
            status: "prohibited",
          })),
          body: unsupportedEmailActionBody(command.payload, prohibitedOutcomes),
          suggestedNextAction: "Use implemented read-only mail commands such as show recent emails, open the latest email fully, summarize the latest email, or create a text document from the latest email summary.",
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
          items: events.map(displayCalendarEvent),
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

function dailyBriefingBody(
  messages: AppleMailMessage[],
  events: AppleCalendarEvent[],
  reminders: AppleReminder[],
) {
  return [
    "# Morning Briefing",
    "",
    "Source: Apple Mail, Apple Calendar, Apple Reminders",
    "Artifact: in-app only",
    "writesToDisk: false",
    "",
    "## Mail",
    ...briefingLines(messages, (message) => `${String(message.subject ?? "Untitled email")} - ${String(message.sender ?? "Unknown sender")}`),
    "",
    "## Calendar",
    ...briefingLines(events, (event) => `${String(event.title ?? "Untitled event")} - ${String(event.startAt ?? "No start time")}`),
    "",
    "## Reminders",
    ...briefingLines(reminders, (reminder) => `${String(reminder.title ?? "Untitled reminder")} - ${String(reminder.dueAt ?? "No due date")}`),
  ].join("\n");
}

function briefingLines<T>(items: T[], format: (item: T) => string) {
  if (!items.length) return ["- Nothing found."];
  return items.slice(0, 5).map((item) => `- ${format(item)}`);
}

function paymentAttentionBody(messages: AppleMailMessage[], reminders: AppleReminder[]) {
  const mailMatches = filterPaymentSignals(messages);
  const reminderMatches = filterPaymentSignals(reminders);
  return [
    "# Payment Attention",
    "",
    "Source: Apple Mail, Apple Reminders",
    "Artifact: in-app only",
    "writesToDisk: false",
    "",
    "## Mail Matches",
    ...briefingLines(mailMatches, (message) => `${String(message.subject ?? "Untitled email")} - ${String(message.sender ?? "Unknown sender")}`),
    "",
    "## Reminder Matches",
    ...briefingLines(reminderMatches, (reminder) => `${String(reminder.title ?? "Untitled reminder")} - ${String(reminder.dueAt ?? "No due date")}`),
  ].join("\n");
}

function emailTriageTitle(mode: unknown) {
  switch (mode) {
    case "extract_records":
      return "Inbox triage records";
    case "organize_context":
      return "Inbox triage context";
    case "compare_options":
      return "Inbox triage options";
    case "plan_next_steps":
      return "Inbox triage plan";
    case "draft_artifact":
      return "Inbox triage draft";
    default:
      return "Inbox triage catch-up";
  }
}

function emailTriageItems(messages: AppleMailMessage[]) {
  return messages.slice(0, 8).map((message) => ({
    subject: message.subject || "Untitled email",
    sender: message.sender || "Unknown sender",
    mailbox: message.mailbox,
    receivedAt: message.receivedAt,
    isRead: message.isRead,
  }));
}

function emailTriageBody(utterance: string, messages: AppleMailMessage[], mode: unknown) {
  const unread = messages.filter((message) => !message.isRead);
  const recentLines = messages.slice(0, 8).map((message, index) => {
    const readState = message.isRead ? "read" : "unread";
    return `${index + 1}. ${String(message.subject || "Untitled email")} - ${String(message.sender || "Unknown sender")} (${readState}${message.receivedAt ? `, ${message.receivedAt}` : ""})`;
  });
  const modeLabel = emailTriageModeLabel(mode);

  return [
    `# ${emailTriageTitle(mode)}`,
    "",
    `Request: ${utterance}`,
    "Source: Apple Mail metadata",
    "Artifact: in-app only",
    "writesToDisk: false",
    "externalWrite: false",
    "writesToMailbox: false",
    "fullBodiesRead: false",
    "",
    "## Summary",
    messages.length
      ? `${messages.length} recent messages were loaded for ${modeLabel}. ${unread.length} are currently unread in the metadata sample.`
      : "No recent messages were available from Apple Mail metadata.",
    "",
    ...emailTriageModeSection(mode, messages),
    "",
    "## Sources Used",
    ...(recentLines.length ? recentLines : ["- No mail metadata rows were returned."]),
    "",
    "## Assumptions",
    "- This is a metadata-only triage pass; it uses sender, subject, mailbox, read state, timestamps, and previews when available.",
    "- Full message bodies, attachments, and thread history were not read.",
    "- No reply, send, archive, delete, label, unsubscribe, reminder, or mailbox mutation has run.",
    "",
    "## Gaps",
    "- Message-body evidence requires opening or summarizing a specific email.",
    "- Thread-level decisions require a thread-aware mail adapter before they can be proven.",
    "- Priority is inferred from metadata signals only, so ambiguous messages should be reviewed by the user.",
    "",
    "## Options",
    "- Review unread or newest messages first when speed matters.",
    "- Open and summarize one specific latest email when evidence quality matters.",
    "- Convert confirmed follow-ups into a draft or reminder only after a preview and explicit approval.",
    "",
    "## Next Steps",
    "- Pick the highest-risk or newest message from the source list.",
    "- Ask for a latest-email summary if the next decision depends on body text.",
    "- Keep external actions paused until the exact draft, reminder, or mailbox change is previewed.",
  ].join("\n");
}

function emailTriageModeSection(mode: unknown, messages: AppleMailMessage[]) {
  const oldest = messages.at(-1)?.receivedAt ?? "oldest sampled message";
  const newest = messages[0]?.receivedAt ?? "newest sampled message";

  switch (mode) {
    case "plan_next_steps":
      return [
        "## Operating Plan",
        "- Owner: user reviews and chooses the next message; Adaptive Surface only prepares previews until approval.",
        `- Date range: metadata sample spans ${oldest} to ${newest}.`,
        "- Dependencies: Apple Mail metadata is available; full bodies and attachments require a specific follow-up command.",
        "- Constraints: no reply, send, archive, delete, label, file, reminder, or external-app write is allowed from this artifact.",
        "- Checkpoint 1: confirm whether the newest unread message is the right starting point.",
        "- Checkpoint 2: request a full latest-email summary only when body evidence is needed.",
        "- Fallback path: if metadata is ambiguous, keep the item in review instead of committing to a conclusion.",
      ];
    case "draft_artifact":
      return [
        "## Draft Artifact",
        "- Draft status: preview only.",
        "- Working version: Inbox triage draft v1.",
        `- Input scope: ${messages.length} Apple Mail metadata rows, not full message bodies.`,
        "- Suggested sections: source list, inferred priorities, open decisions, missing evidence, proposed next action, approval boundary.",
        "- Approval boundary: the draft can be revised in-app, but no external write or mailbox change happens until a later explicit approval step.",
        "",
        "## First Version",
        "- Priority lane: start with unread or newest messages from the source list.",
        "- Records lane: capture decisions or commitments only after a body-level summary proves them.",
        "- Follow-up lane: turn a confirmed item into a draft, reminder, or task only after previewing the exact content.",
        "- Evidence lane: mark ambiguous metadata as needs-review instead of inventing owners, dates, or intent.",
      ];
    default:
      return [
        "## Review Frame",
        "- Separate observed metadata from proposed next actions.",
        "- Treat every proposed action as uncommitted until the user approves a specific preview.",
      ];
  }
}

function emailTriageModeLabel(mode: unknown) {
  switch (mode) {
    case "extract_records":
      return "extracting key decisions, records, and open requests";
    case "organize_context":
      return "organizing work and context";
    case "compare_options":
      return "comparing available triage options";
    case "plan_next_steps":
      return "planning next steps";
    case "draft_artifact":
      return "drafting a reviewable business artifact";
    default:
      return "catching up on inbox triage";
  }
}

function filterPaymentSignals<T extends object>(items: T[]) {
  return items.filter((item) => /\b(payment|bill|invoice|receipt|subscription|klarna|due|amount)\b/i.test(JSON.stringify(item)));
}

async function loadOptionalMeetingNotes() {
  try {
    return { notes: await withTimeout(loadNotes({ limit: 5 }), "load_notes"), warning: undefined };
  } catch (error) {
    return { notes: [] as AppleNotePreview[], warning: optionalSourceWarning("Notes", error) };
  }
}

function optionalSourceWarning(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const metadata = parseProviderError(message);
  const exact = message.match(/exactError=(.*)$/)?.[1] ?? message;
  return `${source} skipped${metadata.errorKind ? ` (${metadata.errorKind})` : ""}: ${exact}`;
}

function displayCalendarEvent(event: AppleCalendarEvent) {
  const notes = sanitizeCalendarNotes(event.notes);
  return {
    ...event,
    notes: notes || undefined,
  };
}

function sanitizeCalendarNotes(notes: unknown) {
  const raw = typeof notes === "string" ? notes.trim() : "";
  if (!raw) return "";

  return compactWhitespace(raw)
    .replace(/-::~.*?~::-/g, " ")
    .replace(/\bJoin with Google Meet:\s*https?:\/\/\S+/gi, " ")
    .replace(/\bOr dial:\s*\([^)]*\)\s*\+?[\d\s-]+/gi, " ")
    .replace(/\bPIN:\s*[\d#]+/gi, " ")
    .replace(/\bMore phone numbers:\s*https?:\/\/\S+/gi, " ")
    .replace(/\bLearn more about Meet at:\s*https?:\/\/\S+/gi, " ")
    .replace(/\bPlease do not edit this section\.?/gi, " ")
    .replace(/https?:\/\/(?:meet|tel|support)\.google\.com\/\S+/gi, " ")
    .replace(/[-:~]{6,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unsupportedEmailActionBody(payload: Record<string, unknown>, prohibitedOutcomes: string[]) {
  return [
    "# Email Action Guard",
    "",
    `intent: ${String(payload.intent ?? "email.unsupported")}`,
    `proposedAction: ${String(payload.proposedAction ?? "No executable action available.")}`,
    `confidence: ${String(payload.confidence ?? "medium")}`,
    `reversibility: ${String(payload.reversibility ?? "no external action ran")}`,
    `confirmationRequirement: ${String(payload.confirmationRequirement ?? "required before external action")}`,
    "externalWrite: false",
    "writesToMailbox: false",
    "",
    "## Prohibited Outcomes",
    ...(prohibitedOutcomes.length ? prohibitedOutcomes.map((outcome) => `- ${outcome}`) : ["- send_before_preview"]),
  ].join("\n");
}

function meetingPrepBody(event: AppleCalendarEvent | undefined, note: AppleNotePreview | undefined, notesWarning?: string) {
  const calendarNotes = sanitizeCalendarNotes(event?.notes);
  return [
    "# Meeting Prep",
    "",
    "Source: Apple Calendar, Apple Notes (optional)",
    "Artifact: in-app only",
    "writesToDisk: false",
    "",
    "## Next Meeting",
    event ? `- ${String(event.title ?? "Untitled event")} at ${String(event.startAt ?? "unknown time")}` : "- No upcoming meeting found.",
    event?.location ? `- Location: ${String(event.location)}` : "- Location: not provided.",
    calendarNotes ? `- Calendar notes: ${calendarNotes}` : "- Calendar notes: none.",
    "",
    "## Relevant Note",
    notesWarning ? `- ${notesWarning}` : note ? `- ${String(note.title ?? "Untitled note")}: ${String(note.preview ?? "")}` : "- No recent note found.",
    "",
    "## Suggested Focus",
    "- Confirm the meeting purpose.",
    "- Bring up unresolved blockers.",
    "- Capture follow-up tasks before leaving the meeting.",
  ].join("\n");
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
