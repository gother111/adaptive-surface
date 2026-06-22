import { beforeEach, describe, expect, it, vi } from "vitest";
import { runFoundationCommand } from "@/local-context/work-command-runner";
import type { FoundationCommand } from "@/local-context/work-command-types";
import type { AppleCalendarEvent, AppleMailMessage, AppleMailMessageDetail, AppleNotePreview, AppleReminder } from "@/types/context";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { SurfaceInstance } from "@/workspace/types";

const contextMocks = vi.hoisted(() => ({
  loadMailMessages: vi.fn(async (): Promise<AppleMailMessage[]> => {
    throw new Error("provider=EnvelopeIndexProvider errorKind=unavailable didOpenExternalApp=false exactError=Mail metadata unavailable");
  }),
  readMailMessage: vi.fn(async (): Promise<AppleMailMessageDetail> => {
    throw new Error("not used");
  }),
  loadCalendarEvents: vi.fn(async (): Promise<AppleCalendarEvent[]> => []),
  loadNotes: vi.fn(async (): Promise<AppleNotePreview[]> => []),
  loadReminders: vi.fn(async (): Promise<AppleReminder[]> => []),
  searchContacts: vi.fn(async () => []),
  createCalendarEvent: vi.fn(async () => ({ ok: true, message: "Calendar event created." })),
  createNote: vi.fn(async () => ({ ok: true, message: "Note created." })),
  createReminder: vi.fn(async () => ({ ok: true, message: "Reminder created." })),
}));

vi.mock("@/lib/context-api", () => ({
  loadMailMessages: contextMocks.loadMailMessages,
  loadCapabilityDiagnostics: vi.fn(async () => []),
  loadCalendarEvents: contextMocks.loadCalendarEvents,
  loadNotes: contextMocks.loadNotes,
  loadReminders: contextMocks.loadReminders,
  searchContacts: contextMocks.searchContacts,
  searchLocalFiles: vi.fn(async () => []),
  readLocalFile: vi.fn(async () => {
    throw new Error("not used");
  }),
  readMailMessage: contextMocks.readMailMessage,
  readNote: vi.fn(async () => {
    throw new Error("not used");
  }),
  createCalendarEvent: contextMocks.createCalendarEvent,
  createNote: contextMocks.createNote,
  createReminder: contextMocks.createReminder,
}));

function surface(id: string, kind: SurfaceInstance["kind"], role: SurfaceInstance["role"]): SurfaceInstance {
  return {
    id,
    kind,
    role,
    zone: role === "primary" ? "main" : "leftRail",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    props: {},
  };
}

describe("foundation command lifecycle", () => {
  beforeEach(() => {
    contextMocks.loadMailMessages.mockReset();
    contextMocks.loadMailMessages.mockRejectedValue(new Error("provider=EnvelopeIndexProvider errorKind=unavailable didOpenExternalApp=false exactError=Mail metadata unavailable"));
    contextMocks.readMailMessage.mockReset();
    contextMocks.readMailMessage.mockRejectedValue(new Error("not used"));
    contextMocks.loadCalendarEvents.mockReset();
    contextMocks.loadCalendarEvents.mockResolvedValue([]);
    contextMocks.loadNotes.mockReset();
    contextMocks.loadNotes.mockResolvedValue([]);
    contextMocks.loadReminders.mockReset();
    contextMocks.loadReminders.mockResolvedValue([]);
    contextMocks.searchContacts.mockReset();
    contextMocks.searchContacts.mockResolvedValue([]);
    contextMocks.createCalendarEvent.mockReset();
    contextMocks.createCalendarEvent.mockResolvedValue({ ok: true, message: "Calendar event created." });
    contextMocks.createNote.mockReset();
    contextMocks.createNote.mockResolvedValue({ ok: true, message: "Note created." });
    contextMocks.createReminder.mockReset();
    contextMocks.createReminder.mockResolvedValue({ ok: true, message: "Reminder created." });
  });

  it("updates the loading surface into an error with the same id and keeps it primary", async () => {
    const loading = surface("foundation-email_list", "email_list", "primary");
    loading.props = { title: "Loading local context", status: "loading", summary: "Calling the local adapter now." };
    const session = applyWorkspacePatches(createInitialWorkspaceSession(), [
      { type: "UPSERT_SURFACE", surface: loading },
      { type: "SET_PRIMARY_SURFACE", surfaceId: loading.id },
    ]);
    const command: FoundationCommand = {
      kind: "show_recent_emails",
      utterance: "can you pull up my recent emails",
      surfaceKind: "email_list",
      adapter: "load_mail_messages",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, session, {});
    const next = applyWorkspacePatches(session, result.patches);

    expect(next.surfaces.filter((item) => item.id === "foundation-email_list")).toHaveLength(1);
    expect(next.surfaces.some((item) => item.id === "foundation-command_error")).toBe(false);
    expect(next.primarySurfaceId).toBe("foundation-email_list");
    expect(next.surfaces.find((item) => item.id === "foundation-email_list")?.props.status).toBe("adapter_error");
    expect(next.surfaces.find((item) => item.id === "foundation-email_list")?.props.summary).not.toBe("Calling the local adapter now.");
  });

  it("maps Calendar permission failures to Calendar-specific guidance", async () => {
    contextMocks.loadCalendarEvents.mockRejectedValue(new Error("provider=EventKitCalendarProvider errorKind=Permission didOpenExternalApp=false exactError=permission: Calendar access is not authorized for Adaptive Surface. statusRaw=2 status=denied"));
    const command: FoundationCommand = {
      kind: "show_today_calendar",
      utterance: "show me my calendar",
      surfaceKind: "calendar_day",
      adapter: "load_calendar_events",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const props = next.surfaces[0]?.props;

    expect(props.status).toBe("permission_error");
    expect(props.summary).toContain("Calendar access");
    expect(props.suggestedNextAction).toContain("Calendars");
    expect(props.suggestedNextAction).not.toContain("Contacts");
  });

  it("maps Mail operation-not-permitted failures to Full Disk Access guidance", async () => {
    contextMocks.loadMailMessages.mockRejectedValue(new Error("provider=EnvelopeIndexProvider errorKind=Unavailable didOpenExternalApp=false exactError=full_disk_access_missing: Operation not permitted (os error 1)"));
    const command: FoundationCommand = {
      kind: "show_recent_emails",
      utterance: "show me my recent emails",
      surfaceKind: "email_list",
      adapter: "load_mail_messages",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const props = next.surfaces[0]?.props;

    expect(props.status).toBe("permission_error");
    expect(props.summary).toContain("Full Disk Access");
    expect(props.suggestedNextAction).toContain("Full Disk Access");
  });

  it("maps Notes unsupported local DB failures to Notes-specific guidance", async () => {
    contextMocks.loadNotes.mockRejectedValue(new Error("provider=NotesProviderChain errorKind=Unsupported didOpenExternalApp=false exactError=unsupported_local_db: Local Notes database decoding is not implemented"));
    const command: FoundationCommand = {
      kind: "show_recent_notes",
      utterance: "show recent notes",
      surfaceKind: "notes_list",
      adapter: "load_notes",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const props = next.surfaces[0]?.props;

    expect(props.status).toBe("not_implemented");
    expect(props.summary).toContain("Notes");
    expect(props.suggestedNextAction).toContain("Notes");
    expect(props.suggestedNextAction).not.toContain("Calendar");
    expect(props.suggestedNextAction).not.toContain("Contacts");
  });

  it("prepares a meeting brief even when optional Notes are unavailable", async () => {
    contextMocks.loadCalendarEvents.mockResolvedValue([
      {
        id: "cal-1",
        title: "Investor follow-up",
        calendarName: "Work",
        startAt: "2026-06-22T10:00:00Z",
        endAt: "2026-06-22T11:00:00Z",
        location: "Office",
        notes: "Discuss open approvals.",
      },
    ]);
    contextMocks.loadNotes.mockRejectedValue(new Error("provider=NotesProviderChain errorKind=Unavailable didOpenExternalApp=false exactError=fallback_requires_notes_running: Notes is not running."));
    const command: FoundationCommand = {
      kind: "prepare_next_meeting",
      utterance: "prep my next meeting",
      surfaceKind: "document",
      adapter: "meeting_prep",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const props = next.surfaces[0]?.props;

    expect(props.status).toBe("available");
    expect(props.summary).toContain("with Notes skipped");
    expect(String(props.body)).toContain("Investor follow-up");
    expect(String(props.body)).toContain("Notes skipped");
    expect(props.detail).toMatchObject({ notesStatus: "skipped" });
  });

  it("sanitizes calendar conferencing boilerplate before display", async () => {
    contextMocks.loadCalendarEvents.mockResolvedValue([
      {
        id: "cal-1",
        title: "Planning call",
        calendarName: "Work",
        startAt: "2026-06-22T10:00:00Z",
        endAt: "2026-06-22T11:00:00Z",
        location: null,
        notes: "Prep agenda -::~:~::~:~::- Join with Google Meet: https://meet.google.com/abc-defg-hij Or dial: (US) +1 555-000-0000 PIN: 123456# More phone numbers: https://tel.meet/abc Learn more about Meet at: https://support.google.com/a/users/answer/9282720 Please do not edit this section. -::~:~::~:~::-",
      },
    ]);
    const command: FoundationCommand = {
      kind: "show_today_calendar",
      utterance: "show today's calendar",
      surfaceKind: "calendar_day",
      adapter: "load_calendar_events",
      requiresApproval: false,
      payload: {},
    };

    const result = await runFoundationCommand(command, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const notes = String((next.surfaces[0]?.props.items as Array<Record<string, unknown>>)[0]?.notes ?? "");

    expect(notes).toContain("Prep agenda");
    expect(notes).not.toContain("Join with Google Meet");
    expect(notes).not.toContain("Or dial");
    expect(notes).not.toContain("Please do not edit");
    expect(notes).not.toContain("support.google.com");
  });

  it("summarizes the loaded latest email with grounded evidence", async () => {
    contextMocks.loadMailMessages.mockResolvedValue([
      {
        id: "mail-1",
        mailbox: "Inbox",
        subject: "Invoice approval needed",
        sender: "Alex <alex@example.com>",
        receivedAt: "2026-05-24T10:00:00Z",
        isRead: false,
        preview: "Please approve the May invoice before Friday.",
      },
    ]);
    contextMocks.readMailMessage.mockResolvedValue({
      id: "mail-1",
      mailbox: "Inbox",
      subject: "Invoice approval needed",
      sender: "Alex <alex@example.com>",
      receivedAt: "2026-05-24T10:00:00Z",
      isRead: false,
      preview: "Please approve the May invoice before Friday.",
      body: "Hi Pavlo. Please approve the May invoice before Friday so finance can process payment. Let me know if anything looks wrong.",
    });
    const session = createInitialWorkspaceSession();
    const listResult = await runFoundationCommand({
      kind: "show_recent_emails",
      utterance: "show recent emails",
      surfaceKind: "email_list",
      adapter: "load_mail_messages",
      requiresApproval: false,
      payload: {},
    }, session, {});

    const summaryResult = await runFoundationCommand({
      kind: "summarize_latest_email",
      utterance: "summarize the latest email",
      surfaceKind: "email_detail",
      adapter: "analyze_mail_message",
      requiresApproval: false,
      payload: {},
    }, applyWorkspacePatches(session, listResult.patches), listResult.memory);
    const next = applyWorkspacePatches(session, summaryResult.patches);
    const props = next.surfaces[0]?.props;

    expect(summaryResult.memory.latestEmailAnalysis?.sourceEmailId).toBe("mail-1");
    expect(props.title).toBe("Latest email analysis");
    expect(props.summary).toContain("Invoice approval needed");
    expect(String(props.body)).toContain("## Requested Action");
    expect(String(props.body)).toContain("Review a payment, invoice, receipt, billing, or subscription item.");
    expect(String(props.body)).toContain("Please approve the May invoice");
  });

  it("does not invent an email analysis when no latest email is loaded", async () => {
    const result = await runFoundationCommand({
      kind: "summarize_latest_email",
      utterance: "summarize the latest email",
      surfaceKind: "email_detail",
      adapter: "analyze_mail_message",
      requiresApproval: false,
      payload: {},
    }, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const props = next.surfaces[0]?.props;

    expect(contextMocks.readMailMessage).not.toHaveBeenCalled();
    expect(props.status).toBe("adapter_error");
    expect(props.error).toContain("Show recent emails");
  });

  it("creates an in-app document artifact from the latest email analysis without writing externally", async () => {
    const session = createInitialWorkspaceSession();
    const result = await runFoundationCommand({
      kind: "create_email_summary_artifact",
      utterance: "create a document from the latest email summary",
      surfaceKind: "document",
      adapter: "create_email_summary_artifact",
      requiresApproval: false,
      payload: {},
    }, session, {
      latestEmailAnalysis: {
        sourceEmailId: "mail-1",
        subject: "Invoice approval needed",
        sender: "Alex",
        receivedAt: "2026-05-24T10:00:00Z",
        mailbox: "Inbox",
        summary: "Alex asked for invoice approval.",
        requestedAction: "Review a payment, invoice, receipt, billing, or subscription item.",
        relevanceJudgment: "Likely relevant.",
        evidence: ["Please approve the May invoice before Friday."],
        artifactBody: "# Email Analysis\n\n## Summary\nAlex asked for invoice approval.",
      },
    });
    const next = applyWorkspacePatches(session, result.patches);
    const surface = next.surfaces[0];

    expect(surface?.kind).toBe("document");
    expect(surface?.role).toBe("primary");
    expect(surface?.props.summary).toContain("Created an in-app text artifact");
    expect(surface?.props.detail).toMatchObject({ writesToDisk: false, artifactType: "text/markdown" });
    expect(String(surface?.props.body)).toContain("# Email Analysis");
  });

  it("queues local writes for approval before creating anything", async () => {
    const result = await runFoundationCommand({
      kind: "create_reminder",
      utterance: "create a reminder to follow up tomorrow",
      surfaceKind: "approval",
      adapter: "create_reminder",
      requiresApproval: true,
      payload: { title: "follow up", dueAt: "tomorrow at 10:00 AM" },
    }, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const surface = next.surfaces[0];

    expect(contextMocks.createReminder).not.toHaveBeenCalled();
    expect(result.memory.pendingApproval?.kind).toBe("create_reminder");
    expect(surface?.kind).toBe("approval");
    expect(surface?.props.status).toBe("needs_approval");
    expect(surface?.props.approval).toMatchObject({ actionId: "create_reminder" });
  });

  it("approves exactly the pending local write and then clears it", async () => {
    const pending = await runFoundationCommand({
      kind: "create_reminder",
      utterance: "create a reminder to follow up tomorrow",
      surfaceKind: "approval",
      adapter: "create_reminder",
      requiresApproval: true,
      payload: { title: "follow up", dueAt: "tomorrow at 10:00 AM" },
    }, createInitialWorkspaceSession(), {});

    const approved = await runFoundationCommand({
      kind: "approve_pending_action",
      utterance: "approve",
      surfaceKind: "approval",
      adapter: "approval",
      requiresApproval: false,
      payload: {},
    }, createInitialWorkspaceSession(), pending.memory);
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), approved.patches);
    const surface = next.surfaces[0];

    expect(contextMocks.createReminder).toHaveBeenCalledTimes(1);
    expect(contextMocks.createReminder).toHaveBeenCalledWith({ title: "follow up", dueAt: "tomorrow at 10:00 AM" });
    expect(approved.memory.pendingApproval).toBeUndefined();
    expect(surface?.kind).toBe("reminder_list");
    expect(surface?.props.title).toBe("Approved action completed");
    expect(surface?.props.summary).toBe("Reminder created.");
  });

  it("does not approve anything when there is no pending local write", async () => {
    const result = await runFoundationCommand({
      kind: "approve_pending_action",
      utterance: "approve",
      surfaceKind: "approval",
      adapter: "approval",
      requiresApproval: false,
      payload: {},
    }, createInitialWorkspaceSession(), {});
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), result.patches);
    const surface = next.surfaces[0];

    expect(contextMocks.createReminder).not.toHaveBeenCalled();
    expect(surface?.kind).toBe("command_error");
    expect(surface?.props.title).toBe("No pending approval");
    expect(surface?.props.error).toContain("no pending write action");
  });
});
