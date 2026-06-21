import type { AttentionContext, ResolvedGazeTarget } from "@/gaze/types";

let currentGazeTarget: ResolvedGazeTarget | null = null;
const listeners = new Set<(attention: AttentionContext) => void>();

export function setCurrentGazeAttentionTarget(target: ResolvedGazeTarget | null) {
  currentGazeTarget = target;
  const attention = getCurrentAttention();
  listeners.forEach((listener) => listener(attention));
}

export function getCurrentAttention(): AttentionContext {
  return {
    target: currentGazeTarget,
    source: currentGazeTarget ? "gaze" : "none",
    confidence: currentGazeTarget?.confidence ?? 0,
  };
}

export function getCurrentAttentionTarget() {
  return currentGazeTarget;
}

export function subscribeToAttentionTarget(listener: (attention: AttentionContext) => void) {
  listeners.add(listener);
  listener(getCurrentAttention());
  return () => {
    listeners.delete(listener);
  };
}
