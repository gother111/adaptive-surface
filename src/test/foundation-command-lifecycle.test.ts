import { describe, expect, it, vi } from "vitest";
import { runFoundationCommand } from "@/local-context/work-command-runner";
import type { FoundationCommand } from "@/local-context/work-command-types";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { SurfaceInstance } from "@/workspace/types";

vi.mock("@/lib/context-api", () => ({
  loadMailMessages: vi.fn(async () => {
    throw new Error("provider=EnvelopeIndexProvider errorKind=unavailable didOpenExternalApp=false exactError=Mail metadata unavailable");
  }),
  loadCapabilityDiagnostics: vi.fn(async () => []),
  loadCalendarEvents: vi.fn(async () => []),
  loadNotes: vi.fn(async () => []),
  loadReminders: vi.fn(async () => []),
  searchContacts: vi.fn(async () => []),
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
  it("updates the loading surface into an error with the same id and keeps it primary", async () => {
    const loading = surface("foundation-email_list", "email_list", "primary");
    loading.props = { title: "Loading local context", status: "loading" };
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
  });
});
