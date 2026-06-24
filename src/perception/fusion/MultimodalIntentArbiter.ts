import { fusionDefaults, type FusionConfig } from "@/perception/fusion/config";
import type { FrozenGazeTarget, MultimodalIntent } from "@/perception/fusion/types";
import type { GazeCalibrationState, GazeObservation, ResolvedGazeTarget } from "@/gaze/types";
import type { GestureEvent, HandObservation } from "@/perception/hand/types";
import { isOcclusionSuspected } from "@/perception/fusion/occlusion";

interface ArbiterGazeContext {
  target: ResolvedGazeTarget | null;
  observation: GazeObservation | null;
  calibration: GazeCalibrationState;
  targetStillRegistered?: (targetId: string) => boolean;
}

export class MultimodalIntentArbiter {
  private armedTarget: FrozenGazeTarget | null = null;
  private armedGestureStartedAt: number | null = null;
  private lastIntentAt = Number.NEGATIVE_INFINITY;
  private latestGaze: ArbiterGazeContext | null = null;
  private latestHand: HandObservation | null = null;

  constructor(private config: FusionConfig = fusionDefaults) {}

  ingestGaze(context: ArbiterGazeContext) {
    this.latestGaze = context;
    if (this.armedTarget && context.targetStillRegistered && !context.targetStillRegistered(this.armedTarget.id)) {
      return this.cancel("target-invalid", context.observation?.emittedAt ?? readNow());
    }

    if (this.armedTarget && context.observation?.trackingState === "lost") {
      const at = context.observation.emittedAt;
      const suspected = isOcclusionSuspected({
        eyeRegion: context.observation.eyeRegion,
        handBox: this.latestHand?.boundingBox,
        handPresentAt: this.latestHand?.capturedAt,
        gazeLostAt: context.observation.capturedAt ?? context.observation.emittedAt,
      });
      if (!suspected || at - this.armedTarget.observedAt > this.config.briefOcclusionHoldMs) {
        return this.cancel("tracking-loss", at);
      }
    }

    return null;
  }

  ingestHand(observation: HandObservation) {
    this.latestHand = observation;
  }

  ingestGesture(gesture: GestureEvent): MultimodalIntent | null {
    if (gesture.updatedAt < this.lastIntentAt + this.config.intentCooldownMs && gesture.phase === "committed") {
      return null;
    }

    if (gesture.kind === "open-palm" && gesture.phase === "committed") {
      return this.cancel("open-palm", gesture.committedAt ?? gesture.updatedAt);
    }

    if ((gesture.kind === "swipe-left" || gesture.kind === "swipe-right") && gesture.phase === "committed") {
      const intent: MultimodalIntent = {
        kind: "navigate",
        direction: gesture.kind === "swipe-left" ? "left" : "right",
        source: "gesture",
        at: gesture.committedAt ?? gesture.updatedAt,
      };
      this.lastIntentAt = intent.at;
      return intent;
    }

    if (gesture.kind === "pinch" && gesture.phase === "started") {
      const target = this.currentEligibleTarget(gesture.updatedAt);
      if (!target) return null;
      this.armedTarget = target;
      this.armedGestureStartedAt = gesture.startedAt;
      return {
        kind: "drag-target",
        target,
        phase: "started",
        delta: { x: 0, y: 0 },
        at: gesture.updatedAt,
      };
    }

    if (gesture.kind === "pinch-drag" && gesture.phase === "updated") {
      if (!this.armedTarget) return null;
      return {
        kind: "drag-target",
        target: this.armedTarget,
        phase: "updated",
        delta: gesture.delta,
        at: gesture.updatedAt,
      };
    }

    if (gesture.kind === "pinch" && gesture.phase === "cancelled") {
      return this.cancel("timeout", gesture.cancelledAt ?? gesture.updatedAt);
    }

    if (gesture.kind === "pinch" && gesture.phase === "committed") {
      const target = this.armedTarget;
      const gestureStartedAt = this.armedGestureStartedAt ?? gesture.startedAt;
      this.armedTarget = null;
      this.armedGestureStartedAt = null;
      if (!target) return null;

      const committedAt = gesture.committedAt ?? gesture.updatedAt;
      if (committedAt - gestureStartedAt > this.config.gestureConfirmationWindowMs) {
        return this.cancel("timeout", committedAt);
      }
      if (Math.abs(committedAt - target.observedAt) > this.config.maxInputSkewMs + this.config.gestureConfirmationWindowMs) {
        return this.cancel("timeout", committedAt);
      }

      const intent: MultimodalIntent = {
        kind: "confirm-target",
        target,
        source: "gaze+pinch",
        gestureStartedAt,
        committedAt,
      };
      this.lastIntentAt = committedAt;
      return intent;
    }

    return null;
  }

  cancel(source: Extract<MultimodalIntent, { kind: "cancel" }>["source"], at = readNow()): MultimodalIntent {
    this.armedTarget = null;
    this.armedGestureStartedAt = null;
    this.lastIntentAt = at;
    return { kind: "cancel", source, at };
  }

  getArmedTarget() {
    return this.armedTarget;
  }

  private currentEligibleTarget(now: number): FrozenGazeTarget | null {
    const context = this.latestGaze;
    if (!context?.target || !context.observation) return null;
    const { target, observation, calibration } = context;
    const observedAt = observation.capturedAt ?? observation.emittedAt;

    if (now - observedAt > this.config.maxObservationAgeMs) return null;
    if (target.dwellMs < this.config.targetStableMinMs) return null;
    if (target.source === "webgazer" && (calibration.status !== "complete" || calibration.quality === "poor")) return null;
    if (target.confidence !== null && target.confidence < 0.35) return null;
    if (observation.trackingState !== "usable") return null;
    if (observation.facePresent === false) return null;
    if (context.targetStillRegistered && !context.targetStillRegistered(target.id)) return null;

    return freezeTarget(target);
  }
}

export function freezeTarget(target: ResolvedGazeTarget): FrozenGazeTarget {
  return {
    id: target.id,
    type: target.type,
    metadata: target.metadata,
    rect: {
      x: target.rect.x,
      y: target.rect.y,
      width: target.rect.width,
      height: target.rect.height,
    },
    activeSince: target.activeSince,
    observedAt: target.lastObservedAt,
  };
}

function readNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
