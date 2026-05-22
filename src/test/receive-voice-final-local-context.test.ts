import { describe, expect, it } from "vitest";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

describe("receiveVoiceFinal local context routing", () => {
  it("routes local-context phrases through foundation command path without legacy action", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("can you pull up my recent emails");

    const state = useSurfaceStore.getState();
    expect(state.lastRoutedAction).toBeNull();
    expect(state.workspaceSession.primarySurfaceId).toBe("foundation-email_list");
    expect(state.workspaceSession.surfaces.find((surface) => surface.id === "foundation-email_list")?.kind).toBe("email_list");
  });

  it("keeps calendar requests as supporting context during an active email draft", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("workspace-email-draft");

    useSurfaceStore.getState().receiveVoiceFinal("check my calendar but keep the email draft open");
    const state = useSurfaceStore.getState();

    expect(state.lastRoutedAction?.kind).toBe("add_supporting_surface");
    expect(state.workspaceSession.primarySurfaceId).toBe("workspace-email-draft");
    expect(state.workspaceSession.surfaces.some((surface) => surface.kind === "calendar" && surface.role === "supporting")).toBe(true);
  });

  it("can explicitly switch away from and back to an email draft", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    useSurfaceStore.getState().receiveVoiceFinal("switch to calendar instead");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("foundation-calendar_day");

    useSurfaceStore.getState().receiveVoiceFinal("go back to the email");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("workspace-email-draft");
  });
});
