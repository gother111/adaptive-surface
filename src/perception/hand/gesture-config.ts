export const gestureDefaults = {
  historyWindowMs: 520,
  pinchEntryRatio: 0.34,
  pinchExitRatio: 0.48,
  pinchStableMs: 110,
  pinchMaxDurationMs: 1800,
  pinchDragMinDelta: 0.018,
  openPalmHoldMs: 260,
  openPalmFingerSpreadRatio: 1.25,
  swipeWindowMs: 360,
  swipeMinDistance: 0.24,
  swipeMinVelocity: 0.0007,
  swipeMaxVerticalDrift: 0.16,
  cooldownMs: 280,
};

export type GestureConfig = typeof gestureDefaults;
