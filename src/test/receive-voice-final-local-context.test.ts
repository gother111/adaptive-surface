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

  it("does not update an old email draft for local-context follow-up phrases", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("workspace-email-draft");

    useSurfaceStore.getState().receiveVoiceFinal("show me my calendar");
    const state = useSurfaceStore.getState();

    expect(state.lastRoutedAction?.kind).not.toBe("continue_current_surface");
    expect(state.workspaceSession.primarySurfaceId).toBe("foundation-calendar_day");
  });
});
