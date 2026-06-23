import { describe, expect, it } from "vitest";
import {
  applyRuntimeEventsToWorkspace,
  createControlPlaneProjection,
  createMockControlPlaneResponse,
  isMigratedControlPlaneUtterance,
} from "@/control-plane/runtime-event-reducer";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import { createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { RuntimeEventEnvelope } from "@/types/control-plane";

describe("control-plane runtime events", () => {
  it("projects artifact events into the existing document surface", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 10);
    const reduced = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      response.events,
    );

    expect(reduced.projection.phase).toBe("succeeded");
    expect(reduced.workspaceSession.primarySurfaceId).toBe("control-plane-inbox-triage");
    expect(reduced.workspaceSession.surfaces[0]?.kind).toBe("document");
    expect(reduced.workspaceSession.surfaces[0]?.props.detail).toMatchObject({
      writesToDisk: "false",
      writesToMailbox: "false",
      fullBodiesRead: "false",
    });
  });

  it("rejects duplicate and stale events", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 11);
    const first = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      response.events,
    );
    const second = applyRuntimeEventsToWorkspace(first.workspaceSession, first.projection, [
      response.events[0],
      { ...response.events[1], eventId: "stale-event" },
    ]);

    expect(second.patches).toHaveLength(0);
    expect(second.projection.lastSequence).toBe(first.projection.lastSequence);
  });

  it("marks unsupported protocol events as failed without patching the workspace", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 12);
    const badEvent: RuntimeEventEnvelope = {
      ...response.events[0],
      protocolVersion: "future-protocol",
      eventId: "future-event",
      sequence: 99,
    };
    const reduced = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      [badEvent],
    );

    expect(reduced.projection.phase).toBe("failed");
    expect(reduced.workspaceSession.surfaces).toHaveLength(0);
  });

  it("uses the browser mock for migrated inbox triage utterances", async () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("Plan the next steps for inbox triage.");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = useSurfaceStore.getState();
    expect(isMigratedControlPlaneUtterance("Plan the next steps for inbox triage.")).toBe(true);
    expect(state.controlPlane.phase).toBe("succeeded");
    expect(state.workspaceSession.primarySurfaceId).toBe("control-plane-inbox-triage");
  });
});
