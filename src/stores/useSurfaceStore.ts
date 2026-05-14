import { create } from "zustand";
import { classifyPartialTranscript } from "@/intent/intent-classifier";
import type { IntentDetection } from "@/intent/types";
import { buildSurfaceDraft } from "@/intent/surface-draft";
import {
  defaultContextSources,
  defaultPersonalFileIndexPath,
  defaultTrustedFileRoots,
} from "@/lib/context-sources";
import { initialSurfaces } from "@/lib/surface-fixtures";
import type { IntegrationSettings, StreamStatus, SurfaceConfig } from "@/types/surface";

interface TranscriptEntry {
  id: string;
  text: string;
  at: number;
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
  draftSurface: SurfaceConfig | null;
  firstPartialLatencyMs: number | null;
  transcript: TranscriptEntry[];
  surfaces: SurfaceConfig[];
  settings: IntegrationSettings;
  setActiveSurface: (surfaceId: string) => void;
  setCommandOpen: (open: boolean) => void;
  setListening: (listening: boolean) => void;
  setListeningRequested: (listening: boolean) => void;
  toggleListeningRequested: () => void;
  setVoiceRuntime: (runtime: Partial<Pick<SurfaceState, "voiceSupported" | "voiceProvider" | "voiceError">>) => void;
  receiveVoicePartial: (text: string, firstPartialLatencyMs?: number | null) => void;
  receiveVoiceFinal: (text: string) => void;
  clearVoiceDraft: () => void;
  appendTranscript: (text: string) => void;
  updateStreamStatus: (surfaceId: string, status: StreamStatus) => void;
  updateSettings: (settings: Partial<IntegrationSettings>) => void;
}

export const useSurfaceStore = create<SurfaceState>((set) => ({
  activeSurfaceId: "brief",
  commandOpen: false,
  listening: false,
  listeningRequested: false,
  voiceSupported: false,
  voiceProvider: "unavailable",
  voiceError: null,
  partialTranscript: "",
  committedTranscript: "",
  activeIntent: null,
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
      const draftSurface = activeIntent ? buildSurfaceDraft(activeIntent, text) : state.draftSurface;

      return {
        partialTranscript: text,
        activeIntent,
        draftSurface,
        activeSurfaceId: draftSurface?.id ?? state.activeSurfaceId,
        firstPartialLatencyMs: state.firstPartialLatencyMs ?? firstPartialLatencyMs,
      };
    }),
  receiveVoiceFinal: (text) =>
    set((state) => ({
      partialTranscript: "",
      committedTranscript: `${state.committedTranscript} ${text}`.trim(),
      transcript: [{ id: crypto.randomUUID(), text, at: Date.now() }, ...state.transcript].slice(0, 12),
    })),
  clearVoiceDraft: () =>
    set({
      partialTranscript: "",
      committedTranscript: "",
      activeIntent: null,
      draftSurface: null,
      firstPartialLatencyMs: null,
    }),
  appendTranscript: (text) =>
    set((state) => ({
      transcript: [{ id: crypto.randomUUID(), text, at: Date.now() }, ...state.transcript].slice(0, 12),
    })),
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
