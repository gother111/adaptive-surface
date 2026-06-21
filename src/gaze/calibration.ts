import type { GazeCalibrationSample, GazeCalibrationState } from "@/gaze/types";

export function createCalibrationTargets(pointCount: 5 | 9 | 13 | 25 = 9) {
  if (pointCount === 5) {
    return [
      { x: 0.5, y: 0.5 },
      { x: 0.18, y: 0.18 },
      { x: 0.82, y: 0.18 },
      { x: 0.18, y: 0.82 },
      { x: 0.82, y: 0.82 },
    ];
  }

  const gridSize = pointCount === 25 ? 5 : pointCount === 13 ? 4 : 3;
  const targets: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      targets.push({
        x: 0.12 + (column / Math.max(gridSize - 1, 1)) * 0.76,
        y: 0.14 + (row / Math.max(gridSize - 1, 1)) * 0.72,
      });
    }
  }

  if (pointCount === 13) {
    targets.push(
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.14 },
      { x: 0.5, y: 0.86 },
      { x: 0.12, y: 0.5 },
      { x: 0.88, y: 0.5 },
    );
  }

  return targets.slice(0, pointCount);
}

export function evaluateCalibration(samples: GazeCalibrationSample[]): GazeCalibrationState {
  const measured = samples.filter((sample) => sample.measuredX !== undefined && sample.measuredY !== undefined);
  if (!measured.length) {
    return { status: "not-calibrated", sampleCount: samples.length, quality: "unknown" };
  }

  const averageError = measured.reduce((total, sample) => {
    return total + Math.hypot(sample.targetX - Number(sample.measuredX), sample.targetY - Number(sample.measuredY));
  }, 0) / measured.length;

  return {
    status: measured.length >= Math.min(samples.length, 5) ? "complete" : "in-progress",
    sampleCount: samples.length,
    validationErrorPx: averageError,
    quality: averageError <= 45 ? "good" : averageError <= 95 ? "fair" : "poor",
    completedAt: measured.length >= Math.min(samples.length, 5) ? Date.now() : undefined,
  };
}
