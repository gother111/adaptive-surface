export const gazeDefaults = {
  smoothingAlpha: 0.32,
  minConfidence: 0.35,
  maxObservationAgeMs: 220,
  fixationRadiusPx: 56,
  fixationMinMs: 120,
  targetHysteresisMs: 200,
  targetRectInflationPx: 12,
  noTargetTimeoutMs: 300,
  nearestTargetMaxDistancePx: 42,
  reactUpdateMinIntervalMs: 32,
  watchdogIntervalMs: 90,
};

export const initialCalibration = {
  status: "not-calibrated",
  phase: "idle",
  sampleCount: 0,
  quality: "unknown",
} as const;

export const calibrationDefaults = {
  settleMs: 300,
  samplesPerTarget: 7,
  minimumAcceptedSamplesPerTarget: 5,
  pointTimeoutMs: 1200,
  defaultTrainingPointCount: 9,
  defaultValidationPointCount: 5,
  qualityThresholdsByViewportDiagonal: {
    good: 0.035,
    fair: 0.075,
  },
};
