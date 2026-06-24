import { gestureDefaults, type GestureConfig } from "@/perception/hand/gesture-config";
import type { GestureEvent, HandObservation, NormalizedLandmark } from "@/perception/hand/types";

interface PinchState {
  state: "idle" | "candidate" | "active";
  candidateSince: number | null;
  startedAt: number | null;
  startCentroid: { x: number; y: number } | null;
  lastCentroid: { x: number; y: number } | null;
}

export class GestureRecognizer {
  private history: HandObservation[] = [];
  private pinch: PinchState = {
    state: "idle",
    candidateSince: null,
    startedAt: null,
    startCentroid: null,
    lastCentroid: null,
  };
  private openPalmSince: number | null = null;
  private cooldownUntil = 0;

  constructor(private config: GestureConfig = gestureDefaults) {}

  reset() {
    this.history = [];
    this.pinch = {
      state: "idle",
      candidateSince: null,
      startedAt: null,
      startCentroid: null,
      lastCentroid: null,
    };
    this.openPalmSince = null;
    this.cooldownUntil = 0;
  }

  ingest(observation: HandObservation): GestureEvent[] {
    const events: GestureEvent[] = [];
    this.history.push(observation);
    this.history = this.history.filter((item) => observation.capturedAt - item.capturedAt <= this.config.historyWindowMs);

    if (!observation.handPresent || !observation.landmarks?.length) {
      if (this.pinch.state === "active" && this.pinch.startedAt !== null) {
        events.push(this.cancelPinch(observation.capturedAt, "hand-lost"));
      }
      this.openPalmSince = null;
      this.resetPinchCandidate();
      return events;
    }

    const now = observation.capturedAt;
    const landmarks = observation.landmarks;
    const centroid = handCentroid(landmarks);
    const pinchRatio = normalizedPinchDistance(landmarks);
    const openPalm = isOpenPalm(landmarks, this.config);

    if (now >= this.cooldownUntil) {
      events.push(...this.resolvePinch(now, pinchRatio, centroid));
      const swipe = this.resolveSwipe(observation);
      if (swipe) events.push(swipe);
      const openPalmEvent = this.resolveOpenPalm(now, centroid, openPalm);
      if (openPalmEvent) events.push(openPalmEvent);
    }

    return events;
  }

  private resolvePinch(now: number, pinchRatio: number, centroid: { x: number; y: number }): GestureEvent[] {
    const events: GestureEvent[] = [];
    const pinching = pinchRatio <= this.config.pinchEntryRatio;

    if (this.pinch.state === "idle" && pinching) {
      this.pinch.state = "candidate";
      this.pinch.candidateSince = now;
      this.pinch.startCentroid = centroid;
      this.pinch.lastCentroid = centroid;
      return events;
    }

    if (this.pinch.state === "candidate") {
      if (!pinching) {
        this.resetPinchCandidate();
        return events;
      }

      if (now - (this.pinch.candidateSince ?? now) >= this.config.pinchStableMs) {
        this.pinch.state = "active";
        this.pinch.startedAt = this.pinch.candidateSince;
        this.pinch.lastCentroid = centroid;
        events.push({
          kind: "pinch",
          phase: "started",
          startedAt: this.pinch.startedAt ?? now,
          updatedAt: now,
          centroid,
          delta: { x: 0, y: 0 },
        });
      }
      return events;
    }

    if (this.pinch.state !== "active" || this.pinch.startedAt === null) {
      return events;
    }

    const startedAt = this.pinch.startedAt;
    if (now - startedAt > this.config.pinchMaxDurationMs) {
      events.push(this.cancelPinch(now, "max-duration"));
      return events;
    }

    if (pinchRatio >= this.config.pinchExitRatio) {
      const event = {
        kind: "pinch" as const,
        phase: "committed" as const,
        startedAt,
        updatedAt: now,
        committedAt: now,
        centroid,
        delta: delta(this.pinch.startCentroid, centroid),
      };
      this.cooldownUntil = now + this.config.cooldownMs;
      this.resetPinchCandidate();
      return [event];
    }

    const motion = delta(this.pinch.lastCentroid, centroid);
    this.pinch.lastCentroid = centroid;
    if (Math.hypot(motion.x, motion.y) >= this.config.pinchDragMinDelta) {
      events.push({
        kind: "pinch-drag",
        phase: "updated",
        startedAt,
        updatedAt: now,
        centroid,
        delta: delta(this.pinch.startCentroid, centroid),
      });
    }

    return events;
  }

  private resolveOpenPalm(now: number, centroid: { x: number; y: number }, openPalm: boolean): GestureEvent | null {
    if (!openPalm) {
      this.openPalmSince = null;
      return null;
    }

    this.openPalmSince ??= now;
    if (now - this.openPalmSince < this.config.openPalmHoldMs) {
      return null;
    }

    this.cooldownUntil = now + this.config.cooldownMs;
    this.openPalmSince = null;
    if (this.pinch.state === "active") {
      this.resetPinchCandidate();
    }
    return {
      kind: "open-palm",
      phase: "committed",
      startedAt: now - this.config.openPalmHoldMs,
      updatedAt: now,
      committedAt: now,
      centroid,
      delta: { x: 0, y: 0 },
    };
  }

  private resolveSwipe(observation: HandObservation): GestureEvent | null {
    if (this.pinch.state !== "idle" || !observation.landmarks?.length) return null;
    const now = observation.capturedAt;
    const current = handCentroid(observation.landmarks);
    const start = this.history.find((item) => now - item.capturedAt <= this.config.swipeWindowMs && item.landmarks?.length);
    if (!start?.landmarks) return null;

    const startCentroid = handCentroid(start.landmarks);
    const dt = Math.max(now - start.capturedAt, 1);
    const dx = current.x - startCentroid.x;
    const dy = current.y - startCentroid.y;
    const velocity = Math.abs(dx) / dt;

    if (
      Math.abs(dx) < this.config.swipeMinDistance
      || velocity < this.config.swipeMinVelocity
      || Math.abs(dy) > this.config.swipeMaxVerticalDrift
    ) {
      return null;
    }

    this.cooldownUntil = now + this.config.cooldownMs;
    return {
      kind: dx < 0 ? "swipe-left" : "swipe-right",
      phase: "committed",
      startedAt: start.capturedAt,
      updatedAt: now,
      committedAt: now,
      centroid: current,
      delta: { x: dx, y: dy },
    };
  }

  private cancelPinch(now: number, reason: string): GestureEvent {
    const event: GestureEvent = {
      kind: "pinch",
      phase: "cancelled",
      startedAt: this.pinch.startedAt ?? now,
      updatedAt: now,
      cancelledAt: now,
      centroid: this.pinch.lastCentroid,
      delta: delta(this.pinch.startCentroid, this.pinch.lastCentroid),
      reason,
    };
    this.cooldownUntil = now + this.config.cooldownMs;
    this.resetPinchCandidate();
    return event;
  }

  private resetPinchCandidate() {
    this.pinch = {
      state: "idle",
      candidateSince: null,
      startedAt: null,
      startCentroid: null,
      lastCentroid: null,
    };
  }
}

function normalizedPinchDistance(landmarks: readonly NormalizedLandmark[]) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  if (!thumb || !index) return Number.POSITIVE_INFINITY;
  return distance(thumb, index) / Math.max(palmScale(landmarks), 0.001);
}

function isOpenPalm(landmarks: readonly NormalizedLandmark[], config: GestureConfig) {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  if (!wrist || !indexMcp || !pinkyMcp || !indexTip || !middleTip || !ringTip || !pinkyTip) return false;

  const scale = Math.max(distance(indexMcp, pinkyMcp), 0.001);
  const tipsFar = [indexTip, middleTip, ringTip, pinkyTip].every((tip) => distance(wrist, tip) / scale > config.openPalmFingerSpreadRatio);
  const spread = distance(indexTip, pinkyTip) / scale > 1.4;
  return tipsFar && spread;
}

function handCentroid(landmarks: readonly NormalizedLandmark[]) {
  const points = landmarks.length ? landmarks : [{ x: 0, y: 0 }];
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function palmScale(landmarks: readonly NormalizedLandmark[]) {
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  if (indexMcp && pinkyMcp) return distance(indexMcp, pinkyMcp);
  if (wrist && middleMcp) return distance(wrist, middleMcp);
  return 0.1;
}

function delta(start: { x: number; y: number } | null, end: { x: number; y: number } | null) {
  if (!start || !end) return { x: 0, y: 0 };
  return { x: end.x - start.x, y: end.y - start.y };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
