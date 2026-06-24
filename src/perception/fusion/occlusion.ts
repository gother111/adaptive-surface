import type { NormalizedRect } from "@/gaze/types";

export function rectsOverlap(a: NormalizedRect | null | undefined, b: NormalizedRect | null | undefined) {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function isOcclusionSuspected({
  eyeRegion,
  handBox,
  handPresentAt,
  gazeLostAt,
}: {
  eyeRegion?: NormalizedRect | null;
  handBox?: NormalizedRect | null;
  handPresentAt?: number | null;
  gazeLostAt?: number | null;
}) {
  if (rectsOverlap(eyeRegion, handBox)) return true;
  if (handPresentAt !== null && handPresentAt !== undefined && gazeLostAt !== null && gazeLostAt !== undefined) {
    return Math.abs(handPresentAt - gazeLostAt) <= 90;
  }
  return false;
}
