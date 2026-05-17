import { create } from "zustand";
import { classifyPartialTranscript } from "@/intent/intent-classifier";
import type { IntentDetection } from "@/intent/types";
import {
  defaultContextSources,
  defaultPersonalFileIndexPath,
  defaultTrustedFileRoots,
} from "@/lib/context-sources";
import { loadAppleContextBundle } from "@/lib/context-api";
import { initialSurfaces } from "@/lib/surface-fixtures";
import { runFoundationCommand } from "@/local-context/work-command-runner";
import { routeFoundationCommand } from "@/local-context/work-command-router";
import type { FoundationCommandMemory } from "@/local-context/work-command-types";
import { getActiveObjective } from "@/objectives/objective-memory";
import { applyObjectiveRouting, attachObjectsToObjectiveFrame, createObjectiveFrame } from "@/objectives/objective-reducer";
import { routeUtteranceToObjectiveFrame } from "@/objectives/objective-router";
import type { ObjectiveFrame, ObjectiveRoutingDecision } from "@/objectives/objective-types";
import { applySurfacePatch, applySurfacePatches } from "@/surface-engine/patch-reducer";
import type { SurfacePatch } from "@/surface-engine/patch-types";
import type { SurfaceSession, SurfaceSessionPatch } from "@/surface-engine/session-manager";
import type { IntegrationSettings, StreamStatus, SurfaceConfig } from "@/types/surface";
import type {
  AppleCalendarEvent,
  AppleContextBundle,
  AppleContextWarning,
  AppleMailMessage,
  AppleNotePreview,
  AppleReminder,
} from "@/types/context";
import { routeVoiceAction, routedActionToPatches } from "@/workspace/voice-router";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type {
  CalendarPanelProps,
  MailPanelProps,
  NotesPanelProps,
  RoutedVoiceAction,
  SurfaceInstance,
  WorkspacePatch,
  WorkspaceSession,
} from "@/workspace/types";
import { connectContextToObjective } from "@/work-pipeline/connect-context-to-objective";
import { ingestAppleContextBundle } from "@/work-pipeline/ingest-local-context";
import { mergeWorkObjectIndex, type WorkObjectIndex } from "@/work-objects/work-object-index";
import type { WorkObject } from "@/work-objects/work-object-types";

interface TranscriptEntry {
  id: string;
  text: string;
  at: number;
  status: "partial" | "committed";
}

interface AppleContextState {
  calendarEvents: AppleCalendarEvent[];
  mailMessages: AppleMailMessage[];
  notes: AppleNotePreview[];
  reminders: AppleReminder[];
  warnings: AppleContextWarning[];
  lastSyncedAt: number | null;
  loading: boolean;
  error: string | null;
}

interface SurfaceState {
  activeSurfaceId: string;
  commandOpen: boolean;
  listening: boolean;
  listeningRequested: boolean;
  voiceSupported: boolean;
  voiceProvider: "web-speech" | "native-macos-planned" | "unavailable";
  voiceError: string | null;
  partialTranscript: string;
  committedTranscript: string;
  activeIntent: IntentDetection | null;
  debugHudOpen: boolean;
  activeSession: SurfaceSession | null;
  emittedPatches: SurfaceSessionPatch[];
  workspaceSession: WorkspaceSession;
  workspacePatches: WorkspacePatch[];
  lastRoutedAction: RoutedVoiceAction | null;
  workObjects: WorkObjectIndex;
  activeObjectiveId: string | null;
  objectives: ObjectiveFrame[];
  objectiveHistory: string[];
  lastObjectiveRoutingDecision: ObjectiveRoutingDecision | null;
  relevantContextObjectIds: string[];
  lastCapabilityAction: string | null;
  lastApprovalRequired: boolean;
  lastGoldenEvalStatus: string | null;
  foundationCommandMemory: FoundationCommandMemory;
  draftSurface: SurfaceConfig | null;
  firstPartialLatencyMs: number | null;
  transcript: TranscriptEntry[];
  surfaces: SurfaceConfig[];
  settings: IntegrationSettings;
  appleContext: AppleContextState;
  setActiveSurface: (surfaceId: string) => void;
  setCommandOpen: (open: boolean) => void;
  setDebugHudOpen: (open: boolean) => void;
  toggleDebugHud: () => void;
  setListening: (listening: boolean) => void;
  setListeningRequested: (listening: boolean) => void;
  toggleListeningRequested: () => void;
  setVoiceRuntime: (runtime: Partial<Pick<SurfaceState, "voiceSupported" | "voiceProvider" | "voiceError">>) => void;
  receiveVoicePartial: (text: string, firstPartialLatencyMs?: number | null) => void;
  receiveVoiceFinal: (text: string) => void;
  clearVoiceDraft: () => void;
  appendTranscript: (text: string) => void;
  applyBlueprintPatch: (surfaceId: string, patch: SurfacePatch) => void;
  applyBlueprintPatches: (surfaceId: string, patches: SurfacePatch[]) => void;
  applyPatchToActiveDraft: (patch: SurfacePatch) => void;
  setFocusedNode: (surfaceId: string, nodeId: string) => void;
  setSelectedNode: (surfaceId: string, nodeId: string) => void;
  updateStreamStatus: (surfaceId: string, status: StreamStatus) => void;
  updateSettings: (settings: Partial<IntegrationSettings>) => void;
  setAppleContextBundle: (bundle: AppleContextBundle) => void;
  refreshAppleContext: () => Promise<void>;
  clearAppleContextError: () => void;
  ingestWorkObjects: (objects: WorkObject[]) => void;
  createObjectiveFromVoice: (text: string) => ObjectiveFrame;
  updateObjectiveFromVoice: (text: string) => void;
  routeUtteranceToObjective: (text: string) => ObjectiveRoutingDecision;
  attachObjectsToObjective: (objectIds: string[], objectiveId: string) => void;
  completeObjective: (objectiveId: string) => void;
  pauseObjective: (objectiveId: string) => void;
  switchToObjective: (objectiveId: string) => void;
  executeFoundationCommand: (text: string) => Promise<void>;
}

export const useSurfaceStore = create<SurfaceState>((set, get) => ({
  activeSurfaceId: "blank",
  commandOpen: false,
  listening: false,
  listeningRequested: false,
  voiceSupported: false,
  voiceProvider: "unavailable",
  voiceError: null,
  partialTranscript: "",
  committedTranscript: "",
  activeIntent: null,
  debugHudOpen: false,
  activeSession: null,
  emittedPatches: [],
  workspaceSession: createInitialWorkspaceSession(),
  workspacePatches: [],
  lastRoutedAction: null,
  workObjects: {},
  activeObjectiveId: null,
  objectives: [],
  objectiveHistory: [],
  lastObjectiveRoutingDecision: null,
  relevantContextObjectIds: [],
  lastCapabilityAction: null,
  lastApprovalRequired: false,
  lastGoldenEvalStatus: null,
  foundationCommandMemory: {},
  draftSurface: null,
  firstPartialLatencyMs: null,
  transcript: [],
  surfaces: initialSurfaces,
  appleContext: {
    calendarEvents: [],
    mailMessages: [],
    notes: [],
    reminders: [],
    warnings: [],
    lastSyncedAt: null,
    loading: false,
    error: null,
  },
  settings: {
    appleScriptEnabled: false,
    accessibilityEnabled: false,
    localBackendUrl: "http://127.0.0.1:8000",
    selectedModel: "local-router/default",
    voiceMode: "continuous",
    trustedFileRoots: defaultTrustedFileRoots,
    personalFileIndexPath: defaultPersonalFileIndexPath,
    contextSources: defaultContextSources,
  },
  setActiveSurface: (surfaceId) => set({ activeSurfaceId: surfaceId, commandOpen: false }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setDebugHudOpen: (debugHudOpen) =>
    set((state) => ({
      debugHudOpen,
      workspaceSession: applyWorkspacePatches(state.workspaceSession, [
        { type: "SET_DEBUG_VISIBLE", visible: debugHudOpen },
      ]),
    })),
  toggleDebugHud: () =>
    set((state) => {
      const debugHudOpen = !state.debugHudOpen;
      return {
        debugHudOpen,
        workspaceSession: applyWorkspacePatches(state.workspaceSession, [
          { type: "SET_DEBUG_VISIBLE", visible: debugHudOpen },
        ]),
      };
    }),
  setListening: (listening) => set({ listening }),
  setListeningRequested: (listeningRequested) => set({ listeningRequested }),
  toggleListeningRequested: () =>
    set((state) => ({
      listeningRequested: !state.listeningRequested,
      commandOpen: false,
    })),
  setVoiceRuntime: (runtime) => set(runtime),
  receiveVoicePartial: (text, firstPartialLatencyMs = null) =>
    set((state) => {
      const activeIntent = classifyPartialTranscript(text);

      return {
        partialTranscript: text,
        activeIntent,
        firstPartialLatencyMs: state.firstPartialLatencyMs ?? firstPartialLatencyMs,
        transcript: upsertPartialTranscript(state.transcript, text),
      };
    }),
  receiveVoiceFinal: (text) => {
    const foundationCommand = routeFoundationCommand(text);
    if (foundationCommand) {
      void get().executeFoundationCommand(text);
      return;
    }

    let shouldRefreshAppleContext = false;
    set((state) => {
      const activeObjective = getActiveObjective(state.objectives, state.activeObjectiveId);
      const objectiveDecision = routeUtteranceToObjectiveFrame(text, activeObjective, state.objectives);
      const objectiveUpdate = applyObjectiveRouting(
        state.objectives,
        state.activeObjectiveId,
        objectiveDecision,
        text,
      );
      const routedAction = routeVoiceAction(state.workspaceSession, text);
      shouldRefreshAppleContext = routeRequestsAppleContext(routedAction) || objectiveRequestsAppleContext(objectiveDecision);
      const workspacePatches = routedActionToPatches(state.workspaceSession, routedAction, text);
      const workspaceSession = applyWorkspacePatches(state.workspaceSession, workspacePatches);
      const nextObjectives = syncObjectiveSurfaceIds(objectiveUpdate.objectives, objectiveUpdate.activeObjectiveId, workspaceSession);
      const relevantContextObjectIds = scoreRelevantContextIds(
        nextObjectives,
        objectiveUpdate.activeObjectiveId,
        state.workObjects,
      );
      const nextState: SurfaceState = {
        ...state,
        partialTranscript: "",
        committedTranscript: `${state.committedTranscript} ${text}`.trim(),
        transcript: commitTranscript(state.transcript, text),
        activeIntent: null,
        workspaceSession,
        workspacePatches: [...workspacePatches, ...state.workspacePatches].slice(0, 36),
        lastRoutedAction: routedAction,
        objectives: nextObjectives,
        activeObjectiveId: objectiveUpdate.activeObjectiveId,
        objectiveHistory: objectiveUpdate.objectiveHistory,
        lastObjectiveRoutingDecision: objectiveDecision,
        relevantContextObjectIds,
        lastApprovalRequired: objectiveDecision.route === "request_approval",
        lastCapabilityAction: plannedCapabilityLabel(nextObjectives, objectiveUpdate.activeObjectiveId),
        debugHudOpen: workspaceSession.debugVisible,
      };

      return nextState;
    });

    if (shouldRefreshAppleContext) {
      void get().refreshAppleContext();
    }
  },
  clearVoiceDraft: () =>
    set((state) => ({
      partialTranscript: "",
      committedTranscript: "",
      activeIntent: null,
      activeSession: null,
      emittedPatches: [],
      draftSurface: null,
      firstPartialLatencyMs: null,
      workspaceSession: createInitialWorkspaceSession(),
      workspacePatches: [],
      lastRoutedAction: null,
      activeObjectiveId: null,
      objectives: [],
      objectiveHistory: [],
      lastObjectiveRoutingDecision: null,
      relevantContextObjectIds: [],
      lastCapabilityAction: null,
      lastApprovalRequired: false,
      foundationCommandMemory: {},
      debugHudOpen: false,
      activeSurfaceId: state.activeSurfaceId,
    })),
  appendTranscript: (text) =>
    set((state) => ({
      transcript: [{ id: crypto.randomUUID(), text, at: Date.now(), status: "committed" as const }, ...state.transcript].slice(0, 12),
    })),
  applyBlueprintPatch: (surfaceId, patch) =>
    set((state) => patchSurfaceState(state, surfaceId, patch)),
  applyBlueprintPatches: (surfaceId, patches) =>
    set((state) => patchSurfaceStateWithPatches(state, surfaceId, patches)),
  applyPatchToActiveDraft: (patch) =>
    set((state) => {
      const surfaceId = state.draftSurface?.id ?? state.activeSurfaceId;
      return patchSurfaceState(state, surfaceId, patch);
    }),
  setFocusedNode: (surfaceId, nodeId) =>
    set((state) => patchSurfaceState(state, surfaceId, { op: "focus_node", targetNodeId: nodeId })),
  setSelectedNode: (surfaceId, nodeId) =>
    set((state) => patchSurfaceState(state, surfaceId, { op: "select_node", targetNodeId: nodeId })),
  updateStreamStatus: (surfaceId, status) =>
    set((state) => ({
      surfaces: state.surfaces.map((surface) =>
        surface.id === surfaceId ? { ...surface, streamStatus: status } : surface,
      ),
    })),
  updateSettings: (settings) =>
    set((state) => ({
      settings: { ...state.settings, ...settings },
    })),
  setAppleContextBundle: (bundle) =>
    set((state) => applyAppleContextBundle(state, bundle)),
  refreshAppleContext: async () => {
    set((state) => ({
      appleContext: { ...state.appleContext, loading: true, error: null },
      workspaceSession: updateAppleWorkspaceSurfaces(state.workspaceSession, state.appleContext, true),
    }));

    try {
      const bundle = await loadAppleContextBundle();
      get().setAppleContextBundle(bundle);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Apple app context.";
      set((state) => ({
        appleContext: { ...state.appleContext, loading: false, error: message },
      }));
    }
  },
  clearAppleContextError: () =>
    set((state) => ({
      appleContext: { ...state.appleContext, error: null },
    })),
  ingestWorkObjects: (objects) =>
    set((state) => {
      const workObjects = mergeWorkObjectIndex(state.workObjects, objects);
      const objectives = attachRelevantObjectsToActiveObjective(
        state.objectives,
        state.activeObjectiveId,
        workObjects,
      );

      return {
        workObjects,
        objectives,
        relevantContextObjectIds: scoreRelevantContextIds(objectives, state.activeObjectiveId, workObjects),
      };
    }),
  createObjectiveFromVoice: (text) => {
    const decision = routeUtteranceToObjectiveFrame(text, null, get().objectives);
    const objective = createObjectiveFrame(text, { ...decision, route: "create_new_objective" });
    set((state) => ({
      objectives: [...state.objectives, objective],
      activeObjectiveId: objective.id,
      objectiveHistory: [objective.id, ...state.objectiveHistory].slice(0, 12),
      lastObjectiveRoutingDecision: decision,
    }));
    return objective;
  },
  updateObjectiveFromVoice: (text) => {
    const decision = get().routeUtteranceToObjective(text);
    set((state) => {
      const update = applyObjectiveRouting(state.objectives, state.activeObjectiveId, decision, text);
      return {
        objectives: update.objectives,
        activeObjectiveId: update.activeObjectiveId,
        objectiveHistory: update.objectiveHistory,
        lastObjectiveRoutingDecision: decision,
      };
    });
  },
  routeUtteranceToObjective: (text) => {
    const state = get();
    const decision = routeUtteranceToObjectiveFrame(
      text,
      getActiveObjective(state.objectives, state.activeObjectiveId),
      state.objectives,
    );
    set({ lastObjectiveRoutingDecision: decision });
    return decision;
  },
  attachObjectsToObjective: (objectIds, objectiveId) =>
    set((state) => ({
      objectives: state.objectives.map((objective) =>
        objective.id === objectiveId ? attachObjectsToObjectiveFrame(objective, objectIds) : objective,
      ),
      relevantContextObjectIds: Array.from(new Set([...state.relevantContextObjectIds, ...objectIds])),
    })),
  completeObjective: (objectiveId) =>
    set((state) => ({
      objectives: state.objectives.map((objective) =>
        objective.id === objectiveId ? { ...objective, status: "completed", updatedAt: Date.now() } : objective,
      ),
      activeObjectiveId: state.activeObjectiveId === objectiveId ? null : state.activeObjectiveId,
    })),
  pauseObjective: (objectiveId) =>
    set((state) => ({
      objectives: state.objectives.map((objective) =>
        objective.id === objectiveId ? { ...objective, status: "paused", updatedAt: Date.now() } : objective,
      ),
      activeObjectiveId: state.activeObjectiveId === objectiveId ? null : state.activeObjectiveId,
    })),
  switchToObjective: (objectiveId) =>
    set((state) => ({
      objectives: state.objectives.map((objective) =>
        objective.id === objectiveId
          ? { ...objective, status: "active", updatedAt: Date.now() }
          : objective.id === state.activeObjectiveId
            ? { ...objective, status: "paused", updatedAt: Date.now() }
            : objective,
      ),
      activeObjectiveId: objectiveId,
      objectiveHistory: [objectiveId, ...state.objectiveHistory.filter((id) => id !== objectiveId)].slice(0, 12),
    })),
  executeFoundationCommand: async (text) => {
    const command = routeFoundationCommand(text);
    if (!command) {
      return;
    }

    set((state) => {
      const loadingPatches = createFoundationLoadingPatches(state.workspaceSession, command.surfaceKind, text, command.adapter);
      return {
        partialTranscript: "",
        committedTranscript: `${state.committedTranscript} ${text}`.trim(),
        transcript: commitTranscript(state.transcript, text),
        activeIntent: null,
        workspaceSession: applyWorkspacePatches(state.workspaceSession, loadingPatches),
        workspacePatches: [...loadingPatches, ...state.workspacePatches].slice(0, 36),
        lastCapabilityAction: command.adapter,
        lastApprovalRequired: command.requiresApproval,
      };
    });

    const current = get();
    const result = await runFoundationCommand(command, current.workspaceSession, current.foundationCommandMemory);
    set((state) => ({
      foundationCommandMemory: result.memory,
      workspaceSession: applyWorkspacePatches(state.workspaceSession, result.patches),
      workspacePatches: [...result.patches, ...state.workspacePatches].slice(0, 36),
    }));
  },
}));

function patchSurfaceState(state: SurfaceState, surfaceId: string, patch: SurfacePatch): SurfaceState {
  const draftSurface =
    state.draftSurface?.id === surfaceId && state.draftSurface.blueprint
      ? {
          ...state.draftSurface,
          blueprint: applySurfacePatch(state.draftSurface.blueprint, patch),
        }
      : state.draftSurface;

  const surfaces = state.surfaces.map((surface) =>
    surface.id === surfaceId && surface.blueprint
      ? {
          ...surface,
          blueprint: applySurfacePatch(surface.blueprint, patch),
        }
      : surface,
  );

  return { ...state, draftSurface, surfaces };
}

function patchSurfaceStateWithPatches(state: SurfaceState, surfaceId: string, patches: SurfacePatch[]): SurfaceState {
  const draftSurface =
    state.draftSurface?.id === surfaceId && state.draftSurface.blueprint
      ? {
          ...state.draftSurface,
          blueprint: applySurfacePatches(state.draftSurface.blueprint, patches),
        }
      : state.draftSurface;

  const surfaces = state.surfaces.map((surface) =>
    surface.id === surfaceId && surface.blueprint
      ? {
          ...surface,
          blueprint: applySurfacePatches(surface.blueprint, patches),
        }
      : surface,
  );

  return { ...state, draftSurface, surfaces };
}

function upsertPartialTranscript(transcript: TranscriptEntry[], text: string) {
  const withoutPartial = transcript.filter((entry) => entry.status !== "partial");
  return [{ id: "partial-transcript", text, at: Date.now(), status: "partial" as const }, ...withoutPartial].slice(0, 16);
}

function commitTranscript(transcript: TranscriptEntry[], text: string) {
  const withoutPartial = transcript.filter((entry) => entry.status !== "partial");
  return [{ id: crypto.randomUUID(), text, at: Date.now(), status: "committed" as const }, ...withoutPartial].slice(0, 16);
}

function createFoundationLoadingPatches(
  session: WorkspaceSession,
  surfaceKind: string,
  utteranceText: string,
  adapter: string,
): WorkspacePatch[] {
  const now = Date.now();
  const hasPrimary = Boolean(session.primarySurfaceId);
  const surface: SurfaceInstance = {
    id: `foundation-${surfaceKind}`,
    kind: surfaceKind as SurfaceInstance["kind"],
    role: hasPrimary ? "supporting" : "primary",
    zone: hasPrimary ? "bottom_left" : "main",
    status: "active",
    createdAt: now,
    updatedAt: now,
    props: {
      title: "Loading local context",
      status: "loading",
      command: utteranceText,
      adapter,
      summary: "Calling the local adapter now.",
    },
  };

  return [
    { type: "APPEND_UTTERANCE", utterance: { id: crypto.randomUUID(), text: utteranceText, createdAt: now } },
    { type: "CREATE_SURFACE", surface },
    ...(surface.role === "primary" ? [{ type: "SET_PRIMARY_SURFACE" as const, surfaceId: surface.id }] : []),
  ];
}

function routeRequestsAppleContext(action: RoutedVoiceAction) {
  if (action.kind === "add_supporting_surface") {
    return action.surfaceKind === "calendar" || action.surfaceKind === "mail" || action.surfaceKind === "notes";
  }

  if (action.kind === "add_multiple_supporting_surfaces") {
    return action.surfaceKinds.some((kind) => kind === "calendar" || kind === "mail" || kind === "notes");
  }

  return false;
}

function objectiveRequestsAppleContext(decision: ObjectiveRoutingDecision) {
  return decision.requestedContext.some((context) => context.source === "calendar" || context.source === "mail" || context.source === "notes");
}

function applyAppleContextBundle(state: SurfaceState, bundle: AppleContextBundle): SurfaceState {
  const appleContext: AppleContextState = {
    calendarEvents: bundle.calendarEvents,
    mailMessages: bundle.mailMessages,
    notes: bundle.notes,
    reminders: bundle.reminders,
    warnings: bundle.warnings,
    lastSyncedAt: bundle.loadedAt,
    loading: false,
    error: null,
  };

  const objects = ingestAppleContextBundle(bundle);
  const workObjects = mergeWorkObjectIndex(state.workObjects, objects);
  const objectives = attachRelevantObjectsToActiveObjective(state.objectives, state.activeObjectiveId, workObjects);

  return {
    ...state,
    appleContext,
    workObjects,
    objectives,
    relevantContextObjectIds: scoreRelevantContextIds(objectives, state.activeObjectiveId, workObjects),
    workspaceSession: updateAppleWorkspaceSurfaces(state.workspaceSession, appleContext, false),
  };
}

function syncObjectiveSurfaceIds(
  objectives: ObjectiveFrame[],
  activeObjectiveId: string | null,
  session: WorkspaceSession,
) {
  if (!activeObjectiveId) {
    return objectives;
  }

  return objectives.map((objective) =>
    objective.id === activeObjectiveId && session.primarySurfaceId
      ? { ...objective, primarySurfaceId: session.primarySurfaceId }
      : objective,
  );
}

function attachRelevantObjectsToActiveObjective(
  objectives: ObjectiveFrame[],
  activeObjectiveId: string | null,
  workObjects: WorkObjectIndex,
) {
  const activeObjective = getActiveObjective(objectives, activeObjectiveId);
  if (!activeObjective) {
    return objectives;
  }

  const result = connectContextToObjective(activeObjective, Object.values(workObjects));
  return objectives.map((objective) => (objective.id === activeObjective.id ? result.objective : objective));
}

function scoreRelevantContextIds(
  objectives: ObjectiveFrame[],
  activeObjectiveId: string | null,
  workObjects: WorkObjectIndex,
) {
  const activeObjective = getActiveObjective(objectives, activeObjectiveId);
  if (!activeObjective) {
    return [];
  }

  return connectContextToObjective(activeObjective, Object.values(workObjects)).relevantObjects
    .map((item) => item.object.id)
    .slice(0, 12);
}

function plannedCapabilityLabel(objectives: ObjectiveFrame[], activeObjectiveId: string | null) {
  const activeObjective = getActiveObjective(objectives, activeObjectiveId);
  return activeObjective?.plannedActions[0]?.capabilityId ?? null;
}

function updateAppleWorkspaceSurfaces(
  session: WorkspaceSession,
  context: AppleContextState,
  loading: boolean,
) {
  const patches: WorkspacePatch[] = [];

  if (session.surfaces.some((surface) => surface.kind === "calendar")) {
    patches.push({
      type: "UPDATE_SURFACE",
      surfaceId: "workspace-calendar",
      props: calendarPropsFromContext(context, loading) as unknown as Record<string, unknown>,
    });
  }

  if (session.surfaces.some((surface) => surface.kind === "mail")) {
    patches.push({
      type: "UPDATE_SURFACE",
      surfaceId: "workspace-mail",
      props: mailPropsFromContext(context, loading) as unknown as Record<string, unknown>,
    });
  }

  if (session.surfaces.some((surface) => surface.kind === "notes")) {
    patches.push({
      type: "UPDATE_SURFACE",
      surfaceId: "workspace-notes",
      props: notesPropsFromContext(context, loading) as unknown as Record<string, unknown>,
    });
  }

  return patches.length ? applyWorkspacePatches(session, patches) : session;
}

function calendarPropsFromContext(context: AppleContextState, loading: boolean): CalendarPanelProps {
  const warnings = context.warnings
    .filter((warning) => warning.source === "calendar")
    .map((warning) => warning.message);

  return {
    title: "Calendar",
    status: statusFor(context.calendarEvents.length, warnings.length, loading),
    warnings,
    items: context.calendarEvents.map((event) => ({
      id: event.id,
      label: event.title,
      detail: [event.startAt, event.endAt ? `ends ${event.endAt}` : null]
        .filter(Boolean)
        .join(" | "),
      calendarName: event.calendarName,
      location: event.location,
    })),
  };
}

function mailPropsFromContext(context: AppleContextState, loading: boolean): MailPanelProps {
  const warnings = context.warnings
    .filter((warning) => warning.source === "mail")
    .map((warning) => warning.message);

  return {
    title: "Inbox",
    status: statusFor(context.mailMessages.length, warnings.length, loading),
    warnings,
    messages: context.mailMessages.map((message) => ({ ...message })),
  };
}

function notesPropsFromContext(context: AppleContextState, loading: boolean): NotesPanelProps {
  const warnings = context.warnings
    .filter((warning) => warning.source === "notes")
    .map((warning) => warning.message);

  return {
    title: "Recent notes",
    status: statusFor(context.notes.length, warnings.length, loading),
    warnings,
    notes: context.notes.map((note) => ({
      id: note.id,
      title: note.title,
      folder: note.folder,
      modifiedAt: note.modifiedAt ?? note.createdAt,
      excerpt: note.preview ?? "",
    })),
  };
}

function statusFor(itemCount: number, warningCount: number, loading: boolean) {
  if (loading) return "loading";
  if (warningCount > 0) return "warning";
  return itemCount > 0 ? "available" : "empty";
}
