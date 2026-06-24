import { gazeDefaults, initialCalibration } from "@/gaze/config";
import { GazeTargetRegistry } from "@/gaze/GazeTargetRegistry";
import {
  clearResolverState,
  initialGazeTargetResolverState,
  resolveGazeTarget,
  type GazeTargetResolverState,
} from "@/gaze/GazeTargetResolver";
import { GazeSmoother } from "@/gaze/smoothing";
import { setCurrentGazeAttentionTarget } from "@/gaze/attention";
import { shouldAcceptGazeObservation } from "@/gaze/observations";
import { MouseGazeProvider } from "@/gaze/providers/MouseGazeProvider";
import { NullGazeProvider } from "@/gaze/providers/NullGazeProvider";
import { UnsupportedGazeProvider } from "@/gaze/providers/UnsupportedGazeProvider";
import { WebGazerProvider } from "@/gaze/providers/WebGazerProvider";
import type {
  GazeCalibrationOptions,
  GazeObservation,
  GazeCalibrationSample,
  GazeCalibrationState,
  GazeInputProvider,
  GazePoint,
  GazeProviderId,
  GazeProviderStatus,
  GazeSettings,
  GazeSnapshot,
} from "@/gaze/types";

const storageKey = "adaptive-surface:gaze-settings";

const defaultSettings: GazeSettings = {
  providerId: "off",
  showFocusRing: true,
  showDebugHud: false,
  handGesturesEnabled: false,
};

export class GazeManager {
  readonly registry = new GazeTargetRegistry();

  private providers: Record<GazeProviderId, GazeInputProvider>;
  private activeProvider: GazeInputProvider;
  private unsubscribeProviderPoint: (() => void) | null = null;
  private unsubscribeProviderStatus: (() => void) | null = null;
  private smoother = new GazeSmoother();
  private resolverState: GazeTargetResolverState = initialGazeTargetResolverState();
  private listeners = new Set<(snapshot: GazeSnapshot) => void>();
  private lastEmittedAt = 0;
  private latestAcceptedSequence = -1;
  private latestAcceptedCapturedAt = -1;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private snapshot: GazeSnapshot;

  constructor() {
    this.providers = {
      off: new NullGazeProvider(),
      "mouse-simulated": new MouseGazeProvider(),
      webgazer: new WebGazerProvider(),
      "webeyetrack-placeholder": new UnsupportedGazeProvider("webeyetrack-placeholder", "WebEyeTrack placeholder"),
    };

    const settings = readStoredSettings();
    this.activeProvider = this.providers[settings.providerId] ?? this.providers.off;
    this.snapshot = {
      providerId: this.activeProvider.id,
      status: this.activeProvider.getStatus(),
      latestObservation: null,
      latestPoint: null,
      smoothedPoint: null,
      currentTarget: null,
      calibration: initialCalibration,
      settings,
      lastError: null,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: GazeSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async setProvider(providerId: GazeProviderId) {
    if (providerId === this.snapshot.providerId) {
      return;
    }

    await this.stop();
    this.smoother.reset();
    clearResolverState(this.resolverState);
    this.resetObservationClocks();
    const nextProvider = this.providers[providerId] ?? this.providers.off;
    this.activeProvider = nextProvider;
    this.setSettings({ providerId });
    this.setSnapshot({
      providerId,
      status: nextProvider.getStatus(),
      latestObservation: null,
      latestPoint: null,
      smoothedPoint: null,
      currentTarget: null,
      lastError: null,
    });
    setCurrentGazeAttentionTarget(null);
  }

  async start(providerId = this.snapshot.providerId) {
    await this.setProvider(providerId);
    this.unsubscribeActiveProvider();
    this.resetObservationClocks();

    const provider = this.activeProvider;
    this.unsubscribeProviderPoint = provider.subscribe((observation) => this.receiveObservation(observation));
    this.unsubscribeProviderStatus = provider.onStatusChange?.((status) => {
      this.setSnapshot({ status });
    }) ?? null;

    try {
      await provider.start({ debug: this.snapshot.settings.showDebugHud });
      this.setSnapshot({ status: provider.getStatus(), lastError: null });
      this.startWatchdog();
    } catch (error) {
      await this.handleProviderError(error);
    }
  }

  async stop() {
    this.unsubscribeActiveProvider();
    try {
      await this.activeProvider.stop();
    } finally {
      this.stopWatchdog();
      this.smoother.reset();
      clearResolverState(this.resolverState);
      this.resetObservationClocks();
      this.setSnapshot({
        status: this.activeProvider.getStatus(),
        latestObservation: null,
        latestPoint: null,
        smoothedPoint: null,
        currentTarget: null,
      });
      setCurrentGazeAttentionTarget(null);
    }
  }

  async calibrate(options?: GazeCalibrationOptions) {
    if (!this.activeProvider.calibrate) {
      return this.snapshot.calibration;
    }

    this.setSnapshot({
      status: "calibrating",
      calibration: { status: "in-progress", phase: "training", sampleCount: 0, quality: "unknown" },
    });
    this.cancelAttention("calibration-start");

    try {
      const calibration = await this.activeProvider.calibrate(options);
      this.setSnapshot({ calibration, status: this.activeProvider.getStatus() });
      return calibration;
    } catch (error) {
      const calibration: GazeCalibrationState = { status: "failed", sampleCount: 0, quality: "unknown" };
      this.setSnapshot({ calibration, status: "error", lastError: errorMessage(error) });
      return calibration;
    }
  }

  async clearCalibration() {
    await this.activeProvider.clearCalibration?.();
    this.setSnapshot({ calibration: initialCalibration });
  }

  setCalibrationState(calibration: GazeCalibrationState) {
    this.setSnapshot({ calibration, status: this.activeProvider.getStatus() });
  }

  recordCalibrationSample(sample: GazeCalibrationSample) {
    void this.activeProvider.recordCalibrationSample?.(sample);
  }

  cancelAttention(_reason = "cancelled") {
    this.smoother.reset();
    clearResolverState(this.resolverState);
    setCurrentGazeAttentionTarget(null);
    this.setSnapshot({
      latestPoint: null,
      smoothedPoint: null,
      currentTarget: null,
    });
  }

  setSettings(settings: Partial<GazeSettings>) {
    const nextSettings = { ...this.snapshot.settings, ...settings };
    this.setSnapshot({ settings: nextSettings });
    writeStoredSettings(nextSettings);
  }

  private receiveObservation(observation: GazeObservation) {
    if (!this.acceptObservation(observation)) {
      return;
    }

    const point = observationToPoint(observation);
    if (!point) {
      this.smoother.reset();
      const currentTarget = resolveGazeTarget(null, this.registry.list(), this.resolverState, {
        now: observation.emittedAt,
      });
      setCurrentGazeAttentionTarget(currentTarget);
      this.setSnapshot({
        latestObservation: observation,
        latestPoint: null,
        smoothedPoint: null,
        currentTarget,
      }, true);
      return;
    }

    const smoothedPoint = this.smoother.smooth(point);
    if (!smoothedPoint) {
      const currentTarget = resolveGazeTarget(null, this.registry.list(), this.resolverState, {
        now: point.timestamp,
      });
      setCurrentGazeAttentionTarget(currentTarget);
      this.setSnapshot({
        latestObservation: observation,
        latestPoint: point,
        smoothedPoint: null,
        currentTarget,
      }, true);
      return;
    }

    const currentTarget = resolveGazeTarget(
      smoothedPoint,
      this.registry.list(),
      this.resolverState,
    );

    setCurrentGazeAttentionTarget(currentTarget);
    this.setSnapshot({ latestObservation: observation, latestPoint: point, smoothedPoint, currentTarget }, true);
  }

  private async handleProviderError(error: unknown) {
    const status: GazeProviderStatus = /permission|denied|notallowed/i.test(errorMessage(error))
      ? "permission-denied"
      : "error";
    this.cancelAttention("provider-error");
    this.setSnapshot({ status, lastError: errorMessage(error), currentTarget: null });
  }

  private unsubscribeActiveProvider() {
    this.unsubscribeProviderPoint?.();
    this.unsubscribeProviderStatus?.();
    this.unsubscribeProviderPoint = null;
    this.unsubscribeProviderStatus = null;
  }

  private acceptObservation(observation: GazeObservation) {
    const capturedAt = observation.capturedAt ?? observation.emittedAt;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const decision = shouldAcceptGazeObservation(observation, {
      latestSequence: this.latestAcceptedSequence,
      latestCapturedAt: this.latestAcceptedCapturedAt,
    }, {
      now,
      maxAgeMs: gazeDefaults.maxObservationAgeMs,
    });
    if (!decision.accept) {
      if (decision.reason === "stale") {
        this.cancelAttention("stale-observation");
      }
      return false;
    }

    this.latestAcceptedSequence = observation.sequence;
    this.latestAcceptedCapturedAt = capturedAt;
    return true;
  }

  private startWatchdog() {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      const latestAt = this.snapshot.latestObservation?.capturedAt ?? this.snapshot.latestObservation?.emittedAt ?? null;
      if (latestAt === null) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - latestAt > gazeDefaults.noTargetTimeoutMs + gazeDefaults.maxObservationAgeMs) {
        this.cancelAttention("watchdog");
      }
    }, gazeDefaults.watchdogIntervalMs);
  }

  private stopWatchdog() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private resetObservationClocks() {
    this.latestAcceptedSequence = -1;
    this.latestAcceptedCapturedAt = -1;
  }

  private setSnapshot(patch: Partial<GazeSnapshot>, throttle = false) {
    this.snapshot = { ...this.snapshot, ...patch };
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (throttle && now - this.lastEmittedAt < gazeDefaults.reactUpdateMinIntervalMs) {
      return;
    }

    this.lastEmittedAt = now;
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export const gazeManager = new GazeManager();

function readStoredSettings(): GazeSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<GazeSettings>;
    return {
      providerId: isProviderId(parsed.providerId) ? parsed.providerId : defaultSettings.providerId,
      showFocusRing: typeof parsed.showFocusRing === "boolean" ? parsed.showFocusRing : defaultSettings.showFocusRing,
      showDebugHud: typeof parsed.showDebugHud === "boolean" ? parsed.showDebugHud : defaultSettings.showDebugHud,
      handGesturesEnabled: typeof parsed.handGesturesEnabled === "boolean" ? parsed.handGesturesEnabled : defaultSettings.handGesturesEnabled,
    };
  } catch {
    return defaultSettings;
  }
}

function writeStoredSettings(settings: GazeSettings) {
  if (typeof window === "undefined") return;

  try {
    // Storage boundary: only opt-in gaze preferences are persisted, never raw video, frames, or gaze streams.
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // localStorage can fail in privacy modes; gaze still works for the current session.
  }
}

function isProviderId(value: unknown): value is GazeProviderId {
  return value === "off"
    || value === "mouse-simulated"
    || value === "webgazer"
    || value === "webeyetrack-placeholder";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function observationToPoint(observation: GazeObservation): GazePoint | null {
  if (!observation.point) return null;
  const timestamp = observation.capturedAt ?? observation.emittedAt;
  return {
    ...observation.point,
    confidence: observation.confidence,
    timestamp,
    capturedAt: observation.capturedAt,
    sequence: observation.sequence,
    trackingState: observation.trackingState,
    facePresent: observation.facePresent,
    eyesOpen: observation.eyesOpen,
    eyeRegion: observation.eyeRegion,
    source: observation.source,
    debug: observation.debug,
  };
}
