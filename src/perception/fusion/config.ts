export const fusionDefaults = {
  targetStableMinMs: 180,
  maxInputSkewMs: 120,
  gestureConfirmationWindowMs: 450,
  briefOcclusionHoldMs: 125,
  intentCooldownMs: 500,
  maxObservationAgeMs: 200,
};

export type FusionConfig = typeof fusionDefaults;
