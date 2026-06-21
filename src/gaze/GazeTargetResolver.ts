import { gazeDefaults } from "@/gaze/config";
import type {
  GazeTargetDescriptor,
  ResolvedGazeTarget,
  SmoothedGazePoint,
} from "@/gaze/types";

export interface GazeTargetResolverOptions {
  minConfidence?: number;
  targetHysteresisMs?: number;
  targetRectInflationPx?: number;
  nearestTargetMaxDistancePx?: number;
  noTargetTimeoutMs?: number;
}

export interface GazeTargetResolverState {
  previousTarget: ResolvedGazeTarget | null;
}

export function resolveGazeTarget(
  point: SmoothedGazePoint | null,
  targets: GazeTargetDescriptor[],
  state: GazeTargetResolverState = { previousTarget: null },
  options: GazeTargetResolverOptions = {},
): ResolvedGazeTarget | null {
  const previousTarget = state.previousTarget;
  if (!point || point.confidence < (options.minConfidence ?? gazeDefaults.minConfidence)) {
    return holdPreviousTarget(point, previousTarget, options);
  }

  const candidates = targets
    .map((target) => toCandidate(target, point, options.targetRectInflationPx ?? gazeDefaults.targetRectInflationPx))
    .filter((candidate): candidate is TargetCandidate => candidate !== null);

  const containing = candidates.filter((candidate) => candidate.containsPoint);
  const nearestMax = options.nearestTargetMaxDistancePx ?? gazeDefaults.nearestTargetMaxDistancePx;
  const nearest = candidates
    .filter((candidate) => candidate.distanceToPoint <= nearestMax)
    .sort(sortCandidate)[0];

  const candidate = (containing.length ? containing.sort(sortCandidate)[0] : nearest) ?? null;
  if (!candidate) {
    return holdPreviousTarget(point, previousTarget, options);
  }

  if (previousTarget && previousTarget.id !== candidate.target.id) {
    const hysteresisMs = options.targetHysteresisMs ?? gazeDefaults.targetHysteresisMs;
    if (point.timestamp - previousTarget.resolvedAt < hysteresisMs) {
      return { ...previousTarget, resolvedAt: point.timestamp };
    }
  }

  const dwellStartedAt = previousTarget?.id === candidate.target.id
    ? previousTarget.resolvedAt - previousTarget.dwellMs
    : point.timestamp;

  return {
    id: candidate.target.id,
    type: candidate.target.type,
    confidence: point.confidence,
    dwellMs: Math.max(0, point.timestamp - dwellStartedAt),
    rect: candidate.rect,
    metadata: candidate.target.metadata,
    resolvedAt: point.timestamp,
  };
}

interface TargetCandidate {
  target: GazeTargetDescriptor;
  rect: DOMRect;
  containsPoint: boolean;
  distanceToPoint: number;
}

function toCandidate(target: GazeTargetDescriptor, point: SmoothedGazePoint, inflateBy: number): TargetCandidate | null {
  if (target.disabled) return null;

  const rect = target.getRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;

  const inflated = inflateRect(rect, inflateBy);
  const containsPoint = point.viewportX >= inflated.left
    && point.viewportX <= inflated.right
    && point.viewportY >= inflated.top
    && point.viewportY <= inflated.bottom;

  return {
    target,
    rect,
    containsPoint,
    distanceToPoint: containsPoint ? 0 : distanceToRect(point.viewportX, point.viewportY, inflated),
  };
}

function sortCandidate(a: TargetCandidate, b: TargetCandidate) {
  return (b.target.priority ?? 0) - (a.target.priority ?? 0)
    || a.distanceToPoint - b.distanceToPoint
    || a.rect.width * a.rect.height - b.rect.width * b.rect.height;
}

function holdPreviousTarget(
  point: SmoothedGazePoint | null,
  previousTarget: ResolvedGazeTarget | null,
  options: GazeTargetResolverOptions,
) {
  if (!point || !previousTarget) return null;
  const noTargetTimeoutMs = options.noTargetTimeoutMs ?? gazeDefaults.noTargetTimeoutMs;
  if (point.timestamp - previousTarget.resolvedAt > noTargetTimeoutMs) return null;
  return { ...previousTarget, resolvedAt: point.timestamp };
}

function inflateRect(rect: DOMRect, amount: number): DOMRect {
  return {
    ...rect,
    x: rect.x - amount,
    y: rect.y - amount,
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
    toJSON: rect.toJSON?.bind(rect) ?? (() => ({})),
  } as DOMRect;
}

function distanceToRect(x: number, y: number, rect: DOMRect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}
