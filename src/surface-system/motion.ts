export type MotionIntent =
  | "control-feedback"
  | "content-update"
  | "local-insert"
  | "local-expand"
  | "rail-open"
  | "rail-close"
  | "module-relayout"
  | "shared-object-move"
  | "stage-morph"
  | "commit-enter"
  | "commit-exit"
  | "error-localize"
  | "resume-restore";

export interface MotionPlan {
  intent: MotionIntent;
  durationMs: number;
  easing: string;
  properties: Array<"opacity" | "transform" | "background-color" | "border-color" | "box-shadow" | "height" | "width">;
  reduced: boolean;
}

export const motionDurations: Record<MotionIntent, number> = {
  "control-feedback": 110,
  "content-update": 160,
  "local-insert": 180,
  "local-expand": 200,
  "rail-open": 220,
  "rail-close": 180,
  "module-relayout": 240,
  "shared-object-move": 280,
  "stage-morph": 360,
  "commit-enter": 240,
  "commit-exit": 180,
  "error-localize": 160,
  "resume-restore": 280,
};

export const standardEasing = "cubic-bezier(0.2, 0, 0, 1)";
export const emphasizedEasing = "cubic-bezier(0.16, 1, 0.3, 1)";

const structuralIntents: MotionIntent[] = [
  "rail-open",
  "rail-close",
  "module-relayout",
  "shared-object-move",
  "stage-morph",
  "commit-enter",
  "commit-exit",
  "resume-restore",
];

export function isStructuralMotion(intent: MotionIntent) {
  return structuralIntents.includes(intent);
}

export function createMotionPlan(
  intent: MotionIntent,
  options: { reducedMotion?: boolean; distancePx?: number } = {},
): MotionPlan {
  if (options.reducedMotion) {
    return {
      intent,
      durationMs: Math.min(120, motionDurations[intent]),
      easing: standardEasing,
      properties: ["opacity", "border-color", "background-color"],
      reduced: true,
    };
  }

  const distanceAdjustment = options.distancePx && options.distancePx > 600 ? 80 : 0;
  return {
    intent,
    durationMs: motionDurations[intent] + distanceAdjustment,
    easing: isStructuralMotion(intent) ? emphasizedEasing : standardEasing,
    properties: isStructuralMotion(intent)
      ? ["opacity", "transform", "box-shadow"]
      : ["opacity", "background-color", "border-color"],
    reduced: false,
  };
}
