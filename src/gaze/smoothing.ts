import { gazeDefaults } from "@/gaze/config";
import type { GazePoint, SmoothedGazePoint } from "@/gaze/types";

export interface GazeSmoothingOptions {
  smoothingAlpha?: number;
  minConfidence?: number;
  fixationRadiusPx?: number;
  fixationMinMs?: number;
}

export class GazeSmoother {
  private previous: SmoothedGazePoint | null = null;
  private fixationAnchor: SmoothedGazePoint | null = null;

  constructor(private options: GazeSmoothingOptions = {}) {}

  smooth(point: GazePoint, viewport = readViewport()): SmoothedGazePoint | null {
    const minConfidence = this.options.minConfidence ?? gazeDefaults.minConfidence;
    if (!isUsablePoint(point) || point.confidence < minConfidence) {
      return null;
    }

    const alpha = this.options.smoothingAlpha ?? gazeDefaults.smoothingAlpha;
    const clampedX = clamp(point.viewportX, 0, viewport.width);
    const clampedY = clamp(point.viewportY, 0, viewport.height);
    const previous = this.previous;
    const viewportX = previous ? previous.viewportX + alpha * (clampedX - previous.viewportX) : clampedX;
    const viewportY = previous ? previous.viewportY + alpha * (clampedY - previous.viewportY) : clampedY;
    const elapsed = previous ? Math.max(point.timestamp - previous.timestamp, 1) : 0;
    const velocityPxPerMs = previous
      ? distance(previous.viewportX, previous.viewportY, viewportX, viewportY) / elapsed
      : 0;

    const fixation = this.resolveFixation(viewportX, viewportY, point.timestamp);
    const smoothed: SmoothedGazePoint = {
      ...point,
      viewportX,
      viewportY,
      normalizedX: viewport.width ? viewportX / viewport.width : 0,
      normalizedY: viewport.height ? viewportY / viewport.height : 0,
      velocityPxPerMs,
      isFixating: fixation.isFixating,
      fixationStartedAt: fixation.fixationStartedAt,
    };

    this.previous = smoothed;
    return smoothed;
  }

  reset() {
    this.previous = null;
    this.fixationAnchor = null;
  }

  private resolveFixation(viewportX: number, viewportY: number, timestamp: number) {
    const fixationRadiusPx = this.options.fixationRadiusPx ?? gazeDefaults.fixationRadiusPx;
    const fixationMinMs = this.options.fixationMinMs ?? gazeDefaults.fixationMinMs;

    if (!this.fixationAnchor) {
      this.fixationAnchor = anchorPoint(viewportX, viewportY, timestamp);
      return { isFixating: false, fixationStartedAt: undefined };
    }

    const anchorDistance = distance(this.fixationAnchor.viewportX, this.fixationAnchor.viewportY, viewportX, viewportY);
    if (anchorDistance > fixationRadiusPx) {
      this.fixationAnchor = anchorPoint(viewportX, viewportY, timestamp);
      return { isFixating: false, fixationStartedAt: undefined };
    }

    const fixationStartedAt = this.fixationAnchor.timestamp;
    return {
      isFixating: timestamp - fixationStartedAt >= fixationMinMs,
      fixationStartedAt,
    };
  }
}

function anchorPoint(viewportX: number, viewportY: number, timestamp: number): SmoothedGazePoint {
  return {
    viewportX,
    viewportY,
    normalizedX: 0,
    normalizedY: 0,
    confidence: 1,
    timestamp,
    source: "mouse-simulated",
    velocityPxPerMs: 0,
    isFixating: false,
  };
}

function isUsablePoint(point: GazePoint) {
  return Number.isFinite(point.viewportX) && Number.isFinite(point.viewportY) && Number.isFinite(point.confidence);
}

function readViewport() {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }

  return { width: Math.max(window.innerWidth, 1), height: Math.max(window.innerHeight, 1) };
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
