import { create } from "zustand";
import { classifyPartialTranscript } from "@/intent/intent-classifier";
import type { IntentDetection } from "@/intent/types";
import {
  defaultContextSources,
  defaultPersonalFileIndexPath,
  defaultTrustedFileRoots,
} from "@/lib/context-sources";
import { initialSurfaces } from "@/lib/surface-fixtures";
import { applySurfacePatch, applySurfacePatches } from "@/surface-engine/patch-reducer";
import type { SurfacePatch } from "@/surface-engine/patch-types";
import type { SurfaceSession, SurfaceSessionPatch } from "@/surface-engine/session-manager";
import type { IntegrationSettings, StreamStatus, SurfaceConfig } from "@/types/surface";
import { routeVoiceAction, routedActionToPatches } from "@/workspace/voice-router";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { RoutedVoiceAction, WorkspacePatch, WorkspaceSession } from "@/workspace/types";

interface TranscriptEntry {
  id: string;
  text: string;
  at: number;
  status: "partial" | "committed";
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
  draftSurface: SurfaceConfig | null;
  firstPartialLatencyMs: number | null;
  transcript: TranscriptEntry[];
  surfaces: SurfaceConfig[];
  settings: IntegrationSettings;
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
}

export const useSurfaceStore = create<SurfaceState>((set) => ({
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
  draftSurface: null,
  firstPartialLatencyMs: null,
  transcript: [],
  surfaces: initialSurfaces,
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
  receiveVoiceFinal: (text) =>
    set((state) => {
      const routedAction = routeVoiceAction(state.workspaceSession, text);
      const workspacePatches = routedActionToPatches(state.workspaceSession, routedAction, text);
      const workspaceSession = applyWorkspacePatches(state.workspaceSession, workspacePatches);
      const nextState: SurfaceState = {
        ...state,
        partialTranscript: "",
        committedTranscript: `${state.committedTranscript} ${text}`.trim(),
        transcript: commitTranscript(state.transcript, text),
        activeIntent: null,
        workspaceSession,
        workspacePatches: [...workspacePatches, ...state.workspacePatches].slice(0, 36),
        lastRoutedAction: routedAction,
        debugHudOpen: workspaceSession.debugVisible,
      };

      return nextState;
    }),
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
