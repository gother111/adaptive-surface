import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  type ArtifactEnvelope,
  type ControlPlaneSessionSnapshot,
  type RuntimeEventEnvelope,
  type SubmitObjectiveResponse,
  type TaskGraph,
} from "@/types/control-plane";
import type { FoundationSurfaceProps, SurfaceInstance, WorkspacePatch, WorkspaceSession } from "@/workspace/types";
import { applyWorkspacePatches } from "@/workspace/workspace-reducer";

const CONTROL_PLANE_SURFACE_ID = "control-plane-inbox-triage";

export interface ControlPlaneProjection {
  phase: "idle" | "routing" | "running" | "succeeded" | "failed" | "fallback";
  sessionId: string | null;
  objectiveId: string | null;
  graphId: string | null;
  planRevision: number;
  lastSequence: number;
  seenEventIds: string[];
  lastError: string | null;
  pendingApprovalCount: number;
}

export function createControlPlaneProjection(): ControlPlaneProjection {
  return {
    phase: "idle",
    sessionId: null,
    objectiveId: null,
    graphId: null,
    planRevision: 0,
    lastSequence: 0,
    seenEventIds: [],
    lastError: null,
    pendingApprovalCount: 0,
  };
}

export function isMigratedControlPlaneUtterance(utterance: string) {
  const text = utterance.toLowerCase().replace(/\s+/g, " ").trim();
  return text.includes("inbox triage") || (text.includes("triage") && /\b(inbox|email|mail)\b/.test(text));
}

export function applyRuntimeEventsToWorkspace(
  workspaceSession: WorkspaceSession,
  projection: ControlPlaneProjection,
  events: RuntimeEventEnvelope[],
): {
  workspaceSession: WorkspaceSession;
  projection: ControlPlaneProjection;
  patches: WorkspacePatch[];
} {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  let nextProjection = { ...projection, seenEventIds: [...projection.seenEventIds] };
  const patches: WorkspacePatch[] = [];

  for (const event of ordered) {
    if (event.protocolVersion !== CONTROL_PLANE_PROTOCOL_VERSION) {
      nextProjection = {
        ...nextProjection,
        phase: "failed",
        lastError: `Unsupported control-plane protocol ${event.protocolVersion}`,
      };
      continue;
    }

    if (nextProjection.seenEventIds.includes(event.eventId) || event.sequence <= nextProjection.lastSequence) {
      continue;
    }

    nextProjection.seenEventIds.push(event.eventId);
    if (nextProjection.seenEventIds.length > 160) {
      nextProjection.seenEventIds = nextProjection.seenEventIds.slice(-160);
    }
    nextProjection = {
      ...nextProjection,
      sessionId: event.sessionId,
      objectiveId: event.objectiveId,
      graphId: event.graphId ?? nextProjection.graphId,
      planRevision: event.planRevision,
      lastSequence: event.sequence,
    };

    switch (event.payload.type) {
      case "objective_accepted":
        nextProjection.phase = "running";
        patches.push({
          type: "APPEND_UTTERANCE",
          utterance: {
            id: event.eventId,
            text: event.payload.data.utterance,
            createdAt: event.occurredAtMs,
          },
        });
        break;
      case "plan_created":
        nextProjection.phase = "running";
        patches.push(upsertLoadingSurface(event.payload.data.summary, event.payload.data.graph, event.occurredAtMs));
        patches.push({ type: "SET_PRIMARY_SURFACE", surfaceId: CONTROL_PLANE_SURFACE_ID });
        break;
      case "work_unit_lifecycle":
        if (event.payload.data.state === "failed") {
          nextProjection.phase = "failed";
          nextProjection.lastError = event.payload.data.message;
          patches.push(updateFoundationSurface({
            title: "Inbox triage",
            status: "adapter_error",
            command: "Inbox triage",
            adapter: "control-plane",
            provider: "Rust ControlPlaneService",
            summary: event.payload.data.message,
            detail: {
              sessionId: event.sessionId,
              planRevision: event.planRevision,
              workUnitId: event.payload.data.workUnitId,
            },
          }));
        } else if (event.payload.data.state === "running" || event.payload.data.state === "ready") {
          nextProjection.phase = "running";
          patches.push(updateFoundationSurface({
            title: "Inbox triage",
            status: "loading",
            command: "Inbox triage",
            adapter: "control-plane",
            provider: "Rust ControlPlaneService",
            summary: event.payload.data.message,
            detail: {
              sessionId: event.sessionId,
              planRevision: event.planRevision,
              workUnitId: event.payload.data.workUnitId,
              progress: event.payload.data.progress,
            },
          }));
        }
        break;
      case "artifact_added":
        nextProjection.phase = "running";
        patches.push(upsertArtifactSurface(event.payload.data.artifact, event.occurredAtMs));
        patches.push({ type: "SET_PRIMARY_SURFACE", surfaceId: CONTROL_PLANE_SURFACE_ID });
        break;
      case "execution_completed":
        nextProjection.phase = event.payload.data.status === "succeeded"
          ? "succeeded"
          : event.payload.data.status === "legacy_fallback"
            ? "fallback"
            : "failed";
        if (event.payload.data.status !== "succeeded" && event.payload.data.status !== "legacy_fallback") {
          nextProjection.lastError = event.payload.data.summary;
        }
        break;
      case "approval_required":
        nextProjection.pendingApprovalCount += 1;
        break;
      case "approval_resolved":
        nextProjection.pendingApprovalCount = Math.max(0, nextProjection.pendingApprovalCount - 1);
        break;
      case "legacy_fallback_requested":
        nextProjection.phase = "fallback";
        break;
      case "conflict_detected":
        nextProjection.phase = "failed";
        nextProjection.lastError = event.payload.data.safeDiagnostic.message;
        break;
      case "snapshot_recovered":
        break;
    }
  }

  return {
    workspaceSession: applyWorkspacePatches(workspaceSession, patches),
    projection: nextProjection,
    patches,
  };
}

export function projectionFromSnapshot(snapshot: ControlPlaneSessionSnapshot): ControlPlaneProjection {
  return {
    phase: snapshot.activeGraphId ? "running" : "idle",
    sessionId: snapshot.sessionId,
    objectiveId: snapshot.objectiveId ?? null,
    graphId: snapshot.activeGraphId ?? null,
    planRevision: snapshot.planRevision,
    lastSequence: Math.max(0, ...snapshot.recentEvents.map((event) => event.sequence)),
    seenEventIds: snapshot.recentEvents.map((event) => event.eventId).slice(-160),
    lastError: null,
    pendingApprovalCount: snapshot.pendingApprovals.length,
  };
}

export function createMockControlPlaneResponse(utterance: string, now = Date.now()): SubmitObjectiveResponse {
  const sessionId = `mock-session-${now}`;
  const objectiveId = `mock-objective-${now}`;
  const graphId = `mock-graph-${now}`;
  const artifact: ArtifactEnvelope = {
    artifactId: `mock-artifact-${now}`,
    artifactType: "text/markdown",
    title: "Inbox triage catch-up",
    summary: "Created a browser-only mock inbox triage artifact.",
    body: "# Inbox triage catch-up\n\nBrowser mock only. No local Mail metadata was read.",
    items: [],
    status: "derived_interpretation",
    sourceCapabilityId: "artifact.create",
    sourceReferences: [],
    metadata: {
      source: "browser mock",
      writesToDisk: "false",
      writesToMailbox: "false",
      fullBodiesRead: "false",
      mode: "catch_up",
      command: utterance,
    },
    createdAtMs: now,
  };
  const graph: TaskGraph = {
    graphId,
    sessionId,
    objectiveId,
    planRevision: 1,
    createdAtMs: now,
    workUnits: [],
  };
  const events: RuntimeEventEnvelope[] = [
    event(1, sessionId, objectiveId, graphId, now, {
      type: "objective_accepted",
      data: { utterance, objective: "Run read-only inbox triage", routedBy: "browser-mock" },
    }),
    event(2, sessionId, objectiveId, graphId, now, {
      type: "plan_created",
      data: { graph, summary: "Created browser-only mock control-plane graph." },
    }),
    event(3, sessionId, objectiveId, graphId, now, {
      type: "artifact_added",
      data: { artifact },
    }),
    event(4, sessionId, objectiveId, graphId, now, {
      type: "execution_completed",
      data: { status: "succeeded", summary: "Browser mock completed." },
    }),
  ];
  const snapshot: ControlPlaneSessionSnapshot = {
    protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
    sessionId,
    objectiveId,
    activeGraphId: graphId,
    planRevision: 1,
    nextSequence: 5,
    taskGraphs: [graph],
    artifacts: [artifact],
    pendingApprovals: [],
    recentEvents: events,
  };
  return {
    route: "handled",
    sessionId,
    objectiveId,
    graphId,
    planRevision: 1,
    events,
    snapshot,
    pendingApprovals: [],
  };
}

function event(
  sequence: number,
  sessionId: string,
  objectiveId: string,
  graphId: string,
  now: number,
  payload: RuntimeEventEnvelope["payload"],
): RuntimeEventEnvelope {
  return {
    protocolVersion: CONTROL_PLANE_PROTOCOL_VERSION,
    eventId: `mock-event-${now}-${sequence}`,
    sequence,
    sessionId,
    objectiveId,
    planRevision: 1,
    graphId,
    workUnitId: null,
    runId: `mock-run-${now}`,
    occurredAtMs: now,
    payload,
  };
}

function upsertLoadingSurface(summary: string, graph: TaskGraph, now: number): WorkspacePatch {
  return {
    type: "UPSERT_SURFACE",
    surface: {
      id: CONTROL_PLANE_SURFACE_ID,
      kind: "document",
      role: "primary",
      zone: "main",
      status: "active",
      createdAt: now,
      updatedAt: now,
      props: {
        title: "Inbox triage",
        status: "loading",
        command: graph.workUnits[0]?.input.utterance ?? "Inbox triage",
        adapter: "control-plane",
        provider: "Rust ControlPlaneService",
        summary,
        detail: {
          sessionId: graph.sessionId,
          graphId: graph.graphId,
          planRevision: graph.planRevision,
        },
      } satisfies FoundationSurfaceProps,
    },
  };
}

function upsertArtifactSurface(artifact: ArtifactEnvelope, now: number): WorkspacePatch {
  return {
    type: "UPSERT_SURFACE",
    surface: {
      id: CONTROL_PLANE_SURFACE_ID,
      kind: "document",
      role: "primary",
      zone: "main",
      status: "active",
      createdAt: artifact.createdAtMs || now,
      updatedAt: now,
      props: {
        title: artifact.title,
        status: artifact.items.length ? "available" : "empty",
        command: artifact.metadata.command ?? "Inbox triage",
        adapter: "control-plane",
        provider: "Rust ControlPlaneService",
        summary: artifact.summary,
        items: artifact.items,
        detail: {
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          sourceCapabilityId: artifact.sourceCapabilityId,
          source: artifact.metadata.source,
          mailCount: artifact.metadata.mailCount,
          unreadCount: artifact.metadata.unreadCount,
          writesToDisk: artifact.metadata.writesToDisk,
          externalWrite: artifact.metadata.externalWrite,
          writesToMailbox: artifact.metadata.writesToMailbox,
          fullBodiesRead: artifact.metadata.fullBodiesRead,
          mode: artifact.metadata.mode,
        },
        body: artifact.body ?? undefined,
      } satisfies FoundationSurfaceProps,
    },
  };
}

function updateFoundationSurface(props: FoundationSurfaceProps): WorkspacePatch {
  return {
    type: "UPDATE_SURFACE",
    surfaceId: CONTROL_PLANE_SURFACE_ID,
    props: { ...props },
  };
}
