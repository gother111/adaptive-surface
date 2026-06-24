import { calibrationDefaults } from "@/gaze/config";
import type { GazeCalibrationSample, GazeCalibrationState } from "@/gaze/types";

export interface CalibrationTarget {
  id: string;
  x: number;
  y: number;
  phase?: "training" | "validation";
}

export interface CalibrationProfile {
  cameraKey: string | null;
  captureWidth: number | null;
  captureHeight: number | null;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  providerVersion: string;
}

export function createCalibrationTargets(pointCount: 5 | 9 | 13 | 25 = 9): CalibrationTarget[] {
  if (pointCount === 5) {
    return withIds([
      { x: 0.5, y: 0.5 },
      { x: 0.18, y: 0.18 },
      { x: 0.82, y: 0.18 },
      { x: 0.18, y: 0.82 },
      { x: 0.82, y: 0.82 },
    ]);
  }

  if (pointCount === 13) {
    return withIds([
      { x: 0.5, y: 0.5 },
      { x: 0.18, y: 0.18 },
      { x: 0.5, y: 0.18 },
      { x: 0.82, y: 0.18 },
      { x: 0.18, y: 0.5 },
      { x: 0.82, y: 0.5 },
      { x: 0.18, y: 0.82 },
      { x: 0.5, y: 0.82 },
      { x: 0.82, y: 0.82 },
      { x: 0.32, y: 0.32 },
      { x: 0.68, y: 0.32 },
      { x: 0.32, y: 0.68 },
      { x: 0.68, y: 0.68 },
    ]);
  }

  const gridSize = pointCount === 25 ? 5 : 3;
  const targets: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      targets.push({
        x: 0.12 + (column / Math.max(gridSize - 1, 1)) * 0.76,
        y: 0.14 + (row / Math.max(gridSize - 1, 1)) * 0.72,
      });
    }
  }

  return withIds(targets);
}

export function createDefaultCalibrationPlan() {
  const training = createCalibrationTargets(9).map((target) => ({ ...target, phase: "training" as const }));
  const validation = createCalibrationTargets(5)
    .filter((target) => !training.some((trainTarget) => samePosition(trainTarget, target)))
    .concat([
      { id: "validation-mid-top", x: 0.5, y: 0.28 },
      { id: "validation-mid-bottom", x: 0.5, y: 0.72 },
      { id: "validation-mid-left", x: 0.32, y: 0.5 },
      { id: "validation-mid-right", x: 0.68, y: 0.5 },
      { id: "validation-center-offset", x: 0.5, y: 0.42 },
    ])
    .slice(0, calibrationDefaults.defaultValidationPointCount)
    .map((target, index) => ({ ...target, id: `validation-${index + 1}`, phase: "validation" as const }));

  return { training, validation, all: [...training, ...validation] };
}

export function evaluateCalibration(
  samples: GazeCalibrationSample[],
  options: {
    viewportWidth?: number;
    viewportHeight?: number;
    minimumValidationTargets?: number;
    completedAt?: number;
    profile?: CalibrationProfile;
  } = {},
): GazeCalibrationState {
  const validationSamples = samples.filter((sample) => sample.phase !== "training");
  const acceptedValidation = validationSamples.filter(isMeasuredSample);
  const rejectedSampleCount = samples.filter((sample) => sample.accepted === false || !isMeasuredSample(sample)).length;
  const minimumValidationTargets = options.minimumValidationTargets ?? calibrationDefaults.defaultValidationPointCount;

  if (acceptedValidation.length < minimumValidationTargets) {
    return {
      status: acceptedValidation.length ? "in-progress" : "not-calibrated",
      phase: acceptedValidation.length ? "validation" : "idle",
      sampleCount: samples.length,
      validationProgress: { completed: acceptedValidation.length, total: minimumValidationTargets },
      validValidationPointCount: acceptedValidation.length,
      rejectedSampleCount,
      quality: acceptedValidation.length ? "unknown" : "unknown",
      profileKey: options.profile ? createCalibrationProfileKey(options.profile) : undefined,
    };
  }

  const errors = acceptedValidation.map((sample) => {
    return Math.hypot(sample.targetX - Number(sample.measuredX), sample.targetY - Number(sample.measuredY));
  }).sort((a, b) => a - b);
  const medianErrorPx = percentile(errors, 0.5);
  const p90ErrorPx = percentile(errors, 0.9);
  const viewportDiagonal = Math.hypot(options.viewportWidth ?? 1440, options.viewportHeight ?? 900);
  const normalizedError = viewportDiagonal > 0 ? medianErrorPx / viewportDiagonal : 1;

  return {
    status: "complete",
    phase: "complete",
    sampleCount: samples.length,
    validationProgress: { completed: acceptedValidation.length, total: minimumValidationTargets },
    validationErrorPx: medianErrorPx,
    medianErrorPx,
    p90ErrorPx,
    normalizedError,
    validValidationPointCount: acceptedValidation.length,
    rejectedSampleCount,
    quality: qualityFromNormalizedError(normalizedError),
    completedAt: options.completedAt ?? Date.now(),
    profileKey: options.profile ? createCalibrationProfileKey(options.profile) : undefined,
  };
}

export function summarizeTargetSamples(samples: GazeCalibrationSample[]) {
  const accepted = samples.filter(isMeasuredSample);
  if (!accepted.length) return null;
  return {
    targetX: median(accepted.map((sample) => sample.targetX)),
    targetY: median(accepted.map((sample) => sample.targetY)),
    measuredX: median(accepted.map((sample) => Number(sample.measuredX))),
    measuredY: median(accepted.map((sample) => Number(sample.measuredY))),
    timestamp: Math.max(...accepted.map((sample) => sample.timestamp)),
    phase: accepted[0]?.phase,
    accepted: true,
  } satisfies GazeCalibrationSample;
}

export function createCalibrationProfileKey(profile: CalibrationProfile) {
  return [
    profile.cameraKey ?? "unknown-camera",
    profile.captureWidth ?? "w",
    profile.captureHeight ?? "h",
    profile.viewportWidth,
    profile.viewportHeight,
    profile.devicePixelRatio,
    profile.providerVersion,
  ].join(":");
}

export function calibrationProfileMatches(
  storedKey: string | undefined,
  currentProfile: CalibrationProfile,
) {
  if (!storedKey) return { valid: false, reason: "missing-profile" };
  const currentKey = createCalibrationProfileKey(currentProfile);
  return storedKey === currentKey
    ? { valid: true, reason: null }
    : { valid: false, reason: "camera-or-viewport-changed" };
}

function withIds(points: Array<{ x: number; y: number }>): CalibrationTarget[] {
  return points.map((point, index) => ({ id: `target-${index + 1}`, ...point }));
}

function samePosition(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function isMeasuredSample(sample: GazeCalibrationSample) {
  return Number.isFinite(sample.measuredX) && Number.isFinite(sample.measuredY) && sample.accepted !== false;
}

function qualityFromNormalizedError(error: number): GazeCalibrationState["quality"] {
  const thresholds = calibrationDefaults.qualityThresholdsByViewportDiagonal;
  if (error <= thresholds.good) return "good";
  if (error <= thresholds.fair) return "fair";
  return "poor";
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
  return values[index] ?? 0;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}
