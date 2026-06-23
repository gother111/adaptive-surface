import { describe, expect, it } from "vitest";
import {
  applyRuntimeEventsToWorkspace,
  createControlPlaneProjection,
  createMockControlPlaneCompletionEvents,
  createMockControlPlaneResponse,
  isMigratedControlPlaneUtterance,
} from "@/control-plane/runtime-event-reducer";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import { createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { RuntimeEventEnvelope } from "@/types/control-plane";

describe("control-plane runtime events", () => {
  it("projects artifact events into the existing document surface", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 10);
    const completionEvents = createMockControlPlaneCompletionEvents(response, "Catch me up on inbox triage.");
    const reduced = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      [...response.events, ...completionEvents],
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
    const completionEvents = createMockControlPlaneCompletionEvents(response, "Catch me up on inbox triage.");
    const first = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      [...response.events, ...completionEvents],
    );
    const second = applyRuntimeEventsToWorkspace(first.workspaceSession, first.projection, [
      response.events[0],
      { ...response.events[1], eventId: "stale-event" },
    ]);

    expect(second.patches).toHaveLength(0);
    expect(second.projection.lastSequence).toBe(first.projection.lastSequence);
  });

  it("stops at sequence gaps so catch-up can replay missing events", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 13);
    const events = [
      ...response.events,
      ...createMockControlPlaneCompletionEvents(response, "Catch me up on inbox triage."),
    ];
    const reduced = applyRuntimeEventsToWorkspace(
      createInitialWorkspaceSession(),
      createControlPlaneProjection(),
      [events[0], events[2]],
    );

    expect(reduced.projection.lastSequence).toBe(1);
    expect(reduced.projection.needsCatchUpFrom).toBe(1);
    expect(reduced.workspaceSession.surfaces).toHaveLength(0);

    const caughtUp = applyRuntimeEventsToWorkspace(
      reduced.workspaceSession,
      reduced.projection,
      events.slice(1),
    );

    expect(caughtUp.projection.needsCatchUpFrom).toBeNull();
    expect(caughtUp.projection.phase).toBe("succeeded");
    expect(caughtUp.workspaceSession.primarySurfaceId).toBe("control-plane-inbox-triage");
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

  it("keeps the browser mock submit response at accepted-only protocol shape", () => {
    const response = createMockControlPlaneResponse("Catch me up on inbox triage.", 14);
    expect(response.completed).toBe(false);
    expect(response.events.map((event) => event.payload.type)).toEqual([
      "objective_accepted",
      "plan_created",
    ]);
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
