export const gazeDefaults = {
  smoothingAlpha: 0.32,
  minConfidence: 0.35,
  fixationRadiusPx: 56,
  fixationMinMs: 120,
  targetHysteresisMs: 200,
  targetRectInflationPx: 12,
  noTargetTimeoutMs: 300,
  nearestTargetMaxDistancePx: 42,
  reactUpdateMinIntervalMs: 32,
};

export const initialCalibration = {
  status: "not-calibrated",
  sampleCount: 0,
  quality: "unknown",
} as const;
