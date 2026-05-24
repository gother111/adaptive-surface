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
      id: "mail-invoice",
      mailbox: "Inbox",
      subject: "Invoice approval needed",
      sender: "Alex <alex@example.com>",
      receivedAt: "2026-05-24T10:00:00Z",
      isRead: false,
      preview: "Please approve the May invoice before Friday.",
    },
    {
      id: "mail-security",
      mailbox: "Inbox",
      subject: "New login to Instagram",
      sender: "Instagram <security@mail.instagram.com>",
      receivedAt: "2026-05-24T09:30:00Z",
      isRead: false,
      preview: "We noticed a new login from Electron on Mac OS X.",
    },
  ]),
  readMailMessage: vi.fn(async (id: string) => ({
    id,
    mailbox: "Inbox",
    subject: id === "mail-security" ? "New login to Instagram" : "Invoice approval needed",
    sender: id === "mail-security" ? "Instagram <security@mail.instagram.com>" : "Alex <alex@example.com>",
    receivedAt: "2026-05-24T10:00:00Z",
    isRead: false,
    preview: "Please approve the May invoice before Friday.",
    body: "Hi Pavlo. Please approve the May invoice before Friday so finance can process payment. Let me know if anything looks wrong.",
  })),
  loadCalendarEvents: vi.fn(async () => [
    {
      id: "cal-1",
      title: "Järvaveckan prep",
      calendarName: "Work",
      startAt: "2026-05-24T13:00:00Z",
      endAt: "2026-05-24T14:00:00Z",
      location: "Zoom",
      notes: "Prepare talking points.",
    },
  ]),
  loadNotes: vi.fn(async () => [
    {
      id: "note-1",
      title: "Adaptive Surface testing",
      folder: "Work",
      modifiedAt: "2026-05-24T08:00:00Z",
      preview: "Validate voice commands through sequential workflows.",
    },
  ]),
  readNote: vi.fn(async () => ({
    id: "note-1",
    title: "Adaptive Surface testing",
    folder: "Work",
    modifiedAt: "2026-05-24T08:00:00Z",
    body: "Validate voice commands through sequential workflows. Track failures, relevance, and approval safety.",
  })),
  loadReminders: vi.fn(async () => [
    { id: "rem-1", title: "Follow up with Alex", listName: "Tasks", dueAt: "2026-05-25T09:00:00Z", completed: false },
  ]),
  searchContacts: vi.fn(async () => [
    { id: "contact-1", displayName: "Yurii", emails: ["yurii@example.com"], phones: [], organization: "Example" },
  ]),
  searchLocalFiles: vi.fn(async () => [
    {
      id: "file-1",
      name: "adaptive-surface-notes.md",
      path: "/Users/pavlosamoshko/Documents/adaptive-surface-notes.md",
      extension: "md",
      readableType: "markdown",
      size: 640,
      modifiedAtMs: 1_779_609_600_000,
    },
  ]),
  readLocalFile: vi.fn(async () => ({
    file: {
      id: "file-1",
      name: "adaptive-surface-notes.md",
      path: "/Users/pavlosamoshko/Documents/adaptive-surface-notes.md",
      extension: "md",
      readableType: "markdown",
      size: 640,
      modifiedAtMs: 1_779_609_600_000,
    },
    supported: true,
    chunks: ["Adaptive Surface should keep sequential voice context stable."],
    contentPreview: "Adaptive Surface should keep sequential voice context stable.",
  })),
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

interface QualityScenario {
  id: string;
  utterances: string[];
  expectedPrimary?: string;
  expectedSurfaces?: string[];
  expectedText?: string[];
}

const scenarios: QualityScenario[] = [
  scenario("email-analysis-artifact", ["show recent emails", "open the latest email fully", "summarize the latest email", "show capability status", "create a text document from the latest email summary"]),
  scenario("email-detail-analysis", ["show recent emails", "open the latest email fully", "summarize the latest email", "create a text document from the latest email summary", "show recent emails"]),
  scenario("draft-with-calendar", ["write an email to Yurii", "mention the invoice approval", "check my calendar", "make it warmer", "go back to the email"], "email_draft", ["email_draft", "calendar_day"]),
  scenario("draft-with-notes", ["write an email to Alex", "mention the testing note", "show recent notes", "open the latest note", "go back to the email"], "email_draft", ["email_draft", "notes_list", "note_detail"]),
  scenario("calendar-prep", ["show today's calendar", "show recent notes", "open the latest note", "show reminders", "show capability status"], "reminder_list", ["calendar_day", "notes_list", "note_detail", "reminder_list", "capability_status"]),
  scenario("files-summary", ["show files from Desktop", "search my Documents for markdown files", "open the latest readable file", "summarize this file", "add a table"], "file_detail", ["files", "file_detail", "table"]),
  scenario("approval-reminder-safety", ["create a reminder to follow up tomorrow", "do not approve", "show reminders", "show capability status", "approve nothing"], "reminder_list", ["approval", "reminder_list", "capability_status"]),
  scenario("connector-honesty", ["show Gmail inbox", "show Google Drive files", "show recent emails", "summarize the latest email", "create a text document from the latest email summary"], "document", ["capability_status", "email_list", "email_detail", "document"]),
  scenario("contacts-to-email", ["find Yurii in contacts", "write an email to Yurii", "mention tomorrow's prep", "show today's calendar", "go back to the email"], "email_draft", ["contacts", "email_draft", "calendar_day"]),
  scenario("multi-context-catchup", ["catch me up on everything important", "show recent emails", "show today's calendar", "show reminders", "show recent notes"], "notes_list", ["email_list", "calendar_day", "reminder_list", "notes_list"]),
  scenario("switching-surfaces", ["write an email to Alex", "show recent emails", "go back to the email", "show today's calendar", "go back to the email"], "email_draft", ["email_draft", "email_list", "calendar_day"]),
  scenario("analysis-after-switch", ["show recent emails", "show today's calendar", "summarize the latest email", "create a text document from the latest email summary", "show reminders"], "reminder_list", ["email_list", "calendar_day", "email_detail", "document", "reminder_list"]),
  scenario("notes-and-mail-compare", ["show recent notes", "open the latest note", "show recent emails", "summarize the latest email", "add a table"], "email_detail", ["notes_list", "note_detail", "email_list", "email_detail", "table"]),
  scenario("file-and-note-context", ["search my Documents for markdown files", "open the latest readable file", "show recent notes", "open the latest note", "add a table"], "note_detail", ["files", "file_detail", "notes_list", "note_detail", "table"]),
  scenario("calendar-email-draft-safety", ["show today's calendar", "write an email to Alex", "include the first meeting", "send it", "do not approve"], "email_draft", ["calendar_day", "email_draft"]),
  scenario("reminders-email-draft", ["show reminders", "write an email to Alex", "mention the reminder", "make it shorter", "show reminders"], "reminder_list", ["reminder_list", "email_draft"]),
  scenario("capability-then-work", ["show capability status", "show recent emails", "summarize the latest email", "show files from Desktop", "open the latest readable file"], "file_detail", ["capability_status", "email_list", "email_detail", "files", "file_detail"]),
  scenario("artifact-persists-through-context", ["show recent emails", "summarize the latest email", "create a text document from the latest email summary", "show today's calendar", "show recent emails"], "email_list", ["document", "calendar_day", "email_list"]),
  scenario("unsupported-then-recover", ["do something with folders", "show files from Desktop", "open the latest readable file", "show recent emails", "summarize the latest email"], "email_detail", ["unsupported_context", "files", "file_detail", "email_list", "email_detail"]),
  scenario("long-recovery-session", ["show recent emails", "summarize the latest email", "show today's calendar", "show recent notes", "create a text document from the latest email summary"], "document", ["email_list", "email_detail", "calendar_day", "notes_list", "document"]),
];

describe("voice workflow quality audit", () => {
  it("validates 20 workflows with at least 5 sequential prompts each", async () => {
    expect(scenarios).toHaveLength(20);

    const results = [];
    for (const scenario of scenarios) {
      expect(scenario.utterances.length).toBeGreaterThanOrEqual(5);
      const result = await runScenario(scenario);
      results.push(result);

      expect(result.commandCount, scenario.id).toBe(scenario.utterances.length);
      expect(result.errorSurfaces, scenario.id).toEqual([]);
      expect(result.primaryKind, scenario.id).toBe(scenario.expectedPrimary);
      for (const kind of scenario.expectedSurfaces ?? []) {
        expect(result.surfaceKinds, scenario.id).toContain(kind);
      }
      for (const text of scenario.expectedText ?? []) {
        expect(result.renderedText, scenario.id).toContain(text);
      }
    }

    expect(results.filter((result) => result.hasDocumentArtifact)).toHaveLength(6);
    expect(results.filter((result) => result.hasEmailAnalysis)).toHaveLength(9);
  });
});

function scenario(
  id: string,
  utterances: string[],
  expectedPrimary = inferExpectedPrimary(id),
  expectedSurfaces = inferExpectedSurfaces(id),
  expectedText = inferExpectedText(id),
): QualityScenario {
  return { id, utterances, expectedPrimary, expectedSurfaces, expectedText };
}

async function runScenario(scenario: QualityScenario) {
  let session: WorkspaceSession = createInitialWorkspaceSession();
  let memory: FoundationCommandMemory = {};
  let commandCount = 0;

  for (const utterance of scenario.utterances) {
    commandCount += 1;
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
  const renderedText = JSON.stringify(session.surfaces.map((surface) => surface.props));
  return {
    id: scenario.id,
    commandCount,
    primaryKind: primary?.kind,
    surfaceKinds: session.surfaces.map((surface) => surface.kind),
    errorSurfaces: session.surfaces.filter((surface) => ["adapter_error", "permission_error"].includes(String(surface.props.status))).map((surface) => surface.kind),
    hasDocumentArtifact: session.surfaces.some((surface) => surface.kind === "document" && String(surface.props.body ?? "").includes("# Email Analysis")),
    hasEmailAnalysis: session.surfaces.some((surface) => surface.kind === "email_detail" && String(surface.props.body ?? "").includes("## Relevance Judgment")),
    renderedText,
  };
}

function inferExpectedPrimary(id: string) {
  if (id.includes("artifact") || id.includes("connector") || id.includes("long-recovery")) return "document";
  if (id.includes("draft") || id.includes("contacts") || id.includes("switching")) return "email_draft";
  if (id.includes("files") || id.includes("capability-then-work")) return "file_detail";
  if (id.includes("calendar-prep")) return "capability_status";
  if (id.includes("multi-context")) return "notes_list";
  if (id.includes("notes-and-mail") || id.includes("unsupported")) return "email_detail";
  if (id.includes("file-and-note")) return "note_detail";
  if (id.includes("reminders-email")) return "reminder_list";
  return "email_list";
}

function inferExpectedSurfaces(id: string) {
  if (id.includes("artifact") || id.includes("long-recovery")) return ["email_list", "email_detail", "document"];
  return undefined;
}

function inferExpectedText(id: string) {
  if (id.includes("artifact") || id.includes("connector") || id.includes("long-recovery")) {
    return ["writesToDisk", "false", "Review a payment, invoice, receipt, billing, or subscription item."];
  }
  return [];
}
