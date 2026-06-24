import type { GazeObservation } from "@/gaze/types";

export interface GazeObservationCursor {
  latestSequence: number;
  latestCapturedAt: number;
}

export function shouldAcceptGazeObservation(
  observation: GazeObservation,
  cursor: GazeObservationCursor,
  options: { now: number; maxAgeMs: number },
) {
  const capturedAt = observation.capturedAt ?? observation.emittedAt;
  if (observation.sequence <= cursor.latestSequence || capturedAt < cursor.latestCapturedAt) {
    return { accept: false, reason: "out-of-order" as const };
  }
  if (options.now - capturedAt > options.maxAgeMs) {
    return { accept: false, reason: "stale" as const };
  }
  return { accept: true, reason: null };
}
