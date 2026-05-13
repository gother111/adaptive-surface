import { create } from "zustand";
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
  transcript: TranscriptEntry[];
  surfaces: SurfaceConfig[];
  settings: IntegrationSettings;
  setActiveSurface: (surfaceId: string) => void;
  setCommandOpen: (open: boolean) => void;
  setListening: (listening: boolean) => void;
  appendTranscript: (text: string) => void;
  updateStreamStatus: (surfaceId: string, status: StreamStatus) => void;
  updateSettings: (settings: Partial<IntegrationSettings>) => void;
}

export const useSurfaceStore = create<SurfaceState>((set) => ({
  activeSurfaceId: "brief",
  commandOpen: false,
  listening: false,
  transcript: [],
  surfaces: initialSurfaces,
  settings: {
    appleScriptEnabled: false,
    accessibilityEnabled: false,
    localBackendUrl: "http://127.0.0.1:8000",
    selectedModel: "local-router/default",
    voiceMode: "continuous",
  },
  setActiveSurface: (surfaceId) => set({ activeSurfaceId: surfaceId, commandOpen: false }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setListening: (listening) => set({ listening }),
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
