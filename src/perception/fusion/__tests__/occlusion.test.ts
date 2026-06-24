import { describe, expect, it } from "vitest";
import { isOcclusionSuspected, rectsOverlap } from "@/perception/fusion/occlusion";

describe("occlusion geometry", () => {
  it("detects overlap in canonical normalized coordinates", () => {
    expect(rectsOverlap(
      { x: 0.3, y: 0.2, width: 0.2, height: 0.2 },
      { x: 0.4, y: 0.25, width: 0.2, height: 0.2 },
    )).toBe(true);
  });

  it("does not fabricate overlap without geometry", () => {
    expect(isOcclusionSuspected({ eyeRegion: null, handBox: null })).toBe(false);
    expect(rectsOverlap(
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    )).toBe(false);
  });
});
