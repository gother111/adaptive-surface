import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { evaluateCalibration } from "@/gaze/calibration";
import { gazeManager } from "@/gaze/GazeManager";
import { GazeCalibrationOverlay } from "@/gaze/react/GazeCalibrationOverlay";
import { GazeDebugHud } from "@/gaze/react/GazeDebugHud";
import { GazeFocusOverlay } from "@/gaze/react/GazeFocusOverlay";
import { GazePrivacyIndicator } from "@/gaze/react/GazePrivacyIndicator";
import { perceptionRuntime } from "@/perception/PerceptionRuntime";
import type {
  GazeProviderId,
  GazeSettings,
  GazeSnapshot,
} from "@/gaze/types";

export interface GazeContextValue extends GazeSnapshot {
  setProvider: (providerId: GazeProviderId) => Promise<void>;
  start: (providerId?: GazeProviderId) => Promise<void>;
  stop: () => Promise<void>;
  calibrate: () => void;
  clearCalibration: () => Promise<void>;
  updateSettings: (settings: Partial<GazeSettings>) => void;
}

export const GazeContext = createContext<GazeContextValue | null>(null);

export function GazeProviderRoot({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GazeSnapshot>(() => gazeManager.getSnapshot());
  const [calibrationOpen, setCalibrationOpen] = useState(false);

  useEffect(() => gazeManager.subscribe((nextSnapshot) => {
    setSnapshot(nextSnapshot);
    perceptionRuntime.setGazeSnapshot(nextSnapshot);
  }), []);

  useEffect(() => {
    const stop = () => {
      void gazeManager.stop();
      void perceptionRuntime.stopHandTracking();
    };
    const cancel = () => {
      gazeManager.cancelAttention("window-lifecycle");
      perceptionRuntime.cancel("timeout");
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancel();
    };

    window.addEventListener("beforeunload", stop);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", stop);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void gazeManager.stop();
      void perceptionRuntime.stopHandTracking();
    };
  }, []);

  const value = useMemo<GazeContextValue>(() => ({
    ...snapshot,
    setProvider: (providerId) => gazeManager.setProvider(providerId),
    start: (providerId) => gazeManager.start(providerId),
    stop: () => gazeManager.stop(),
    calibrate: () => setCalibrationOpen(true),
    clearCalibration: () => gazeManager.clearCalibration(),
    updateSettings: (settings) => {
      gazeManager.setSettings(settings);
      if (typeof settings.handGesturesEnabled === "boolean") {
        void perceptionRuntime.setHandGesturesEnabled(settings.handGesturesEnabled);
      }
    },
  }), [snapshot]);

  return (
    <GazeContext.Provider value={value}>
      {children}
      <GazeFocusOverlay />
      <GazePrivacyIndicator />
      <GazeDebugHud />
      <GazeCalibrationOverlay
        open={calibrationOpen}
        smoothedPoint={snapshot.smoothedPoint}
        onCancel={() => setCalibrationOpen(false)}
        onSample={(sample) => gazeManager.recordCalibrationSample(sample)}
        onComplete={(samples) => {
          const calibration = evaluateCalibration(samples, {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          });
          gazeManager.setCalibrationState(calibration);
          setCalibrationOpen(false);
        }}
      />
    </GazeContext.Provider>
  );
}
