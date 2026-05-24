import { describe, expect, it, vi } from "vitest";
import { runFoundationCommand } from "@/local-context/work-command-runner";
import { routeFoundationCommand } from "@/local-context/work-command-router";
import { routedActionToPatches, routeVoiceAction } from "@/workspace/voice-router";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { FoundationCommandMemory } from "@/local-context/work-command-types";
import type { WorkspaceSession } from "@/workspace/types";

const contextMocks = vi.hoisted(() => ({
  loadMailMessages: vi.fn(async () => [
    {
      id: "mail-bill",
      mailbox: "Inbox",
      subject: "Klarna payment information for groceries",
      sender: "Klarna <noreply@example.com>",
      receivedAt: "2026-05-24T07:30:00Z",
      isRead: false,
      preview: "Your payment information is available. Amount due tomorrow.",
    },
    {
      id: "mail-security",
      mailbox: "Inbox",
      subject: "New login to Instagram",
      sender: "Instagram <security@example.com>",
      receivedAt: "2026-05-24T07:00:00Z",
      isRead: false,
      preview: "A new device logged into your account.",
    },
  ]),
  readMailMessage: vi.fn(async () => ({
    id: "mail-bill",
    mailbox: "Inbox",
    subject: "Klarna payment information for groceries",
    sender: "Klarna <noreply@example.com>",
    receivedAt: "2026-05-24T07:30:00Z",
    isRead: false,
    preview: "Your payment information is available. Amount due tomorrow.",
    body: "Your payment information for groceries is available. Amount due tomorrow. Review the invoice before payment.",
  })),
  loadCalendarEvents: vi.fn(async () => [
    {
      id: "cal-standup",
      title: "Product standup",
      calendarName: "Work",
      startAt: "2026-05-24T09:00:00Z",
      endAt: "2026-05-24T09:30:00Z",
      location: "Zoom",
      notes: "Review blockers and demo status.",
    },
  ]),
  loadReminders: vi.fn(async () => [
    { id: "rem-invoice", title: "Review invoice", listName: "Tasks", dueAt: "2026-05-24T12:00:00Z", completed: false },
    { id: "rem-call", title: "Call dentist", listName: "Personal", dueAt: "2026-05-25T09:00:00Z", completed: false },
  ]),
  loadNotes: vi.fn(async () => [
    {
      id: "note-standup",
      title: "Standup notes",
      folder: "Work",
      modifiedAt: "2026-05-24T06:30:00Z",
      preview: "Mention demo validation and Mail timeout fix.",
    },
  ]),
  readNote: vi.fn(async () => ({
    id: "note-standup",
    title: "Standup notes",
    folder: "Work",
    modifiedAt: "2026-05-24T06:30:00Z",
    body: "Mention demo validation, Mail timeout fix, and remaining LLM quality gap.",
  })),
  searchContacts: vi.fn(async () => []),
  searchLocalFiles: vi.fn(async () => []),
  readLocalFile: vi.fn(async () => {
    throw new Error("No file selected");
  }),
}));

vi.mock("@/lib/context-api", () => ({
  loadMailMessages: contextMocks.loadMailMessages,
  readMailMessage: contextMocks.readMailMessage,
  loadCalendarEvents: contextMocks.loadCalendarEvents,
  loadNotes: contextMocks.loadNotes,
  readNote: contextMocks.readNote,
  loadReminders: contextMocks.loadReminders,
  searchContacts: contextMocks.searchContacts,
  searchLocalFiles: contextMocks.searchLocalFiles,
  readLocalFile: contextMocks.readLocalFile,
  loadCapabilityDiagnostics: vi.fn(async () => []),
  createCalendarEvent: vi.fn(async () => ({ ok: true, message: "created" })),
  createNote: vi.fn(async () => ({ ok: true, message: "created" })),
  createReminder: vi.fn(async () => ({ ok: true, message: "created" })),
}));

describe("daily voice workflow improvement cycles", () => {
  it("cycle 1 creates a source-labeled morning briefing from mail, calendar, and reminders", async () => {
    const result = await runDailyWorkflow([
      "give me a morning briefing",
      "show recent emails",
      "show today's calendar",
      "show reminders",
      "go back to the briefing",
    ]);

    expect(result.primaryKind).toBe("document");
    expect(result.renderedText).toContain("Morning Briefing");
    expect(result.renderedText).toContain("Mail");
    expect(result.renderedText).toContain("Calendar");
    expect(result.renderedText).toContain("Reminders");
    expect(result.renderedText).toContain("writesToDisk");
    expect(result.renderedText).toContain("false");
  });

  it("cycle 2 triages bills and payment items from mail and reminders", async () => {
    const result = await runDailyWorkflow([
      "what bills or payments need attention",
      "show recent emails",
      "show reminders",
      "go back to the payment list",
      "summarize the latest email",
    ]);

    expect(result.surfaceKinds).toContain("document");
    expect(result.renderedText).toContain("Payment Attention");
    expect(result.renderedText).toContain("Klarna payment information");
    expect(result.renderedText).toContain("Review invoice");
    expect(result.renderedText).toContain("writesToDisk");
    expect(result.renderedText).toContain("false");
  });

  it("cycle 3 prepares a next-meeting brief from calendar and notes", async () => {
    const result = await runDailyWorkflow([
      "prep me for my next meeting",
      "show recent notes",
      "open the latest note",
      "go back to the meeting prep",
      "make a table from it",
    ]);

    expect(result.primaryKind).toBe("document");
    expect(result.renderedText).toContain("Meeting Prep");
    expect(result.renderedText).toContain("Product standup");
    expect(result.renderedText).toContain("Standup notes");
    expect(result.renderedText).toContain("writesToDisk");
    expect(result.renderedText).toContain("false");
  });

  it("cycle 4 treats natural due-today language as reminder review", async () => {
    const result = await runDailyWorkflow([
      "what's due today",
      "what do I need to do today",
      "show recent emails",
      "go back to reminders",
      "show capability status",
    ]);

    expect(result.surfaceKinds).toContain("reminder_list");
    expect(result.renderedText).toContain("Review invoice");
    expect(result.renderedText).toContain("Call dentist");
    expect(result.renderedText).not.toContain("Local context command not understood");
  });

  it("cycle 5 cancels a pending write before a later approve command", async () => {
    const result = await runDailyWorkflow([
      "create a reminder to call the dentist tomorrow morning",
      "cancel that",
      "approve",
      "show reminders",
      "what's due today",
    ]);

    expect(result.renderedText).toContain("Pending action canceled");
    expect(result.renderedText).toContain("No pending approval");
    expect(result.renderedText).not.toContain("Approved action completed");
    expect(result.renderedText).toContain("Review invoice");
  });
});

async function runDailyWorkflow(utterances: string[]) {
  let session: WorkspaceSession = createInitialWorkspaceSession();
  let memory: FoundationCommandMemory = {};

  for (const utterance of utterances) {
    const foundation = routeFoundationCommand(utterance);
    if (foundation) {
      const result = await runFoundationCommand(foundation, session, memory);
      memory = result.memory;
      session = applyWorkspacePatches(session, result.patches);
      continue;
    }

    const action = routeVoiceAction(session, utterance);
    session = applyWorkspacePatches(session, routedActionToPatches(session, action, utterance));
  }

  const primary = session.surfaces.find((surface) => surface.id === session.primarySurfaceId);
  return {
    primaryKind: primary?.kind,
    surfaceKinds: session.surfaces.map((surface) => surface.kind),
    renderedText: JSON.stringify(session.surfaces.map((surface) => surface.props)),
  };
}
