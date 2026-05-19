import { beforeEach, describe, expect, it, vi } from "vitest";
import { runFoundationCommand } from "@/local-context/work-command-runner";
import type { FoundationCommand } from "@/local-context/work-command-types";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { SurfaceInstance } from "@/workspace/types";

const contextMocks = vi.hoisted(() => ({
  loadMailMessages: vi.fn(async () => {
    throw new Error("provider=EnvelopeIndexProvider errorKind=unavailable didOpenExternalApp=false exactError=Mail metadata unavailable");
  }),
  loadCalendarEvents: vi.fn(async () => []),
  loadNotes: vi.fn(async () => []),
  loadReminders: vi.fn(async () => []),
  searchContacts: vi.fn(async () => []),
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
  readMailMessage: vi.fn(async () => {
    throw new Error("not used");
  }),
  readNote: vi.fn(async () => {
    throw new Error("not used");
  }),
  createCalendarEvent: vi.fn(),
  createNote: vi.fn(),
  createReminder: vi.fn(),
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
    contextMocks.loadCalendarEvents.mockReset();
    contextMocks.loadCalendarEvents.mockResolvedValue([]);
    contextMocks.loadNotes.mockReset();
    contextMocks.loadNotes.mockResolvedValue([]);
    contextMocks.loadReminders.mockReset();
    contextMocks.loadReminders.mockResolvedValue([]);
    contextMocks.searchContacts.mockReset();
    contextMocks.searchContacts.mockResolvedValue([]);
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
});
