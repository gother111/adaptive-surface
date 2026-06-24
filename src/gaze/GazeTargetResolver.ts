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
  now?: number;
}

export interface GazeTargetResolverState {
  activeTarget: ResolvedGazeTarget | null;
  activeSince: number | null;
  candidateTargetId: string | null;
  candidateSince: number | null;
  lastObservedAt: number | null;
  lostAt: number | null;
}

export const initialGazeTargetResolverState = (): GazeTargetResolverState => ({
  activeTarget: null,
  activeSince: null,
  candidateTargetId: null,
  candidateSince: null,
  lastObservedAt: null,
  lostAt: null,
});

export function resolveGazeTarget(
  point: SmoothedGazePoint | null,
  targets: GazeTargetDescriptor[],
  state: GazeTargetResolverState = initialGazeTargetResolverState(),
  options: GazeTargetResolverOptions = {},
): ResolvedGazeTarget | null {
  const now = point?.timestamp ?? options.now ?? readNow();
  let activeTarget = state.activeTarget;

  if (!point || !isUsableForTargeting(point, options)) {
    return handleLoss(now, state, options);
  }

  if (activeTarget && !targetStillAvailable(activeTarget, targets)) {
    clearResolverState(state);
    activeTarget = null;
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
    return handleLoss(point.timestamp, state, options);
  }

  state.lostAt = null;

  if (activeTarget && activeTarget.id === candidate.target.id) {
    state.candidateTargetId = null;
    state.candidateSince = null;
    state.lastObservedAt = point.timestamp;
    const activeSince = state.activeSince ?? activeTarget.activeSince ?? point.timestamp;
    const next = toResolvedTarget(candidate, point, activeSince, state.lastObservedAt);
    state.activeTarget = next;
    return next;
  }

  if (activeTarget && activeTarget.id !== candidate.target.id) {
    const hysteresisMs = options.targetHysteresisMs ?? gazeDefaults.targetHysteresisMs;
    if (state.candidateTargetId !== candidate.target.id) {
      state.candidateTargetId = candidate.target.id;
      state.candidateSince = point.timestamp;
    }

    if (point.timestamp - (state.candidateSince ?? point.timestamp) < hysteresisMs) {
      const held = targetStillAvailable(activeTarget, targets)
        ? { ...activeTarget, resolvedAt: point.timestamp }
        : null;
      if (held) {
        state.activeTarget = held;
      }
      return held;
    }
  }

  state.candidateTargetId = null;
  state.candidateSince = null;
  state.activeSince = point.timestamp;
  state.lastObservedAt = point.timestamp;
  const next = toResolvedTarget(candidate, point, point.timestamp, point.timestamp);
  state.activeTarget = next;
  return next;
}

function toResolvedTarget(
  candidate: TargetCandidate,
  point: SmoothedGazePoint,
  activeSince: number,
  lastObservedAt: number,
): ResolvedGazeTarget {
  return {
    id: candidate.target.id,
    type: candidate.target.type,
    confidence: point.confidence,
    dwellMs: Math.max(0, point.timestamp - activeSince),
    rect: candidate.rect,
    metadata: candidate.target.metadata,
    resolvedAt: point.timestamp,
    activeSince,
    lastObservedAt,
    source: point.source,
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

function handleLoss(
  now: number,
  state: GazeTargetResolverState,
  options: GazeTargetResolverOptions,
): ResolvedGazeTarget | null {
  const activeTarget = state.activeTarget;
  if (!activeTarget) return null;

  if (state.lostAt === null) {
    state.lostAt = now;
  }

  const noTargetTimeoutMs = options.noTargetTimeoutMs ?? gazeDefaults.noTargetTimeoutMs;
  if (now - state.lostAt > noTargetTimeoutMs) {
    clearResolverState(state);
    return null;
  }

  const held = { ...activeTarget, resolvedAt: now };
  state.activeTarget = held;
  return held;
}

function isUsableForTargeting(point: SmoothedGazePoint, options: GazeTargetResolverOptions) {
  const minConfidence = options.minConfidence ?? gazeDefaults.minConfidence;
  return point.trackingState === "usable" && (point.confidence === null || point.confidence >= minConfidence);
}

function targetStillAvailable(target: ResolvedGazeTarget, targets: GazeTargetDescriptor[]) {
  return targets.some((descriptor) => descriptor.id === target.id && !descriptor.disabled && Boolean(descriptor.getRect()));
}

export function clearResolverState(state: GazeTargetResolverState) {
  state.activeTarget = null;
  state.activeSince = null;
  state.candidateTargetId = null;
  state.candidateSince = null;
  state.lastObservedAt = null;
  state.lostAt = null;
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

function readNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
