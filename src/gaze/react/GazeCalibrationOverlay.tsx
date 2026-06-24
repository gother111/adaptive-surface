import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDefaultCalibrationPlan } from "@/gaze/calibration";
import type { GazeCalibrationSample, SmoothedGazePoint } from "@/gaze/types";

interface GazeCalibrationOverlayProps {
  open: boolean;
  smoothedPoint: SmoothedGazePoint | null;
  onCancel: () => void;
  onSample?: (sample: GazeCalibrationSample) => void;
  onComplete: (samples: GazeCalibrationSample[]) => void;
}

export function GazeCalibrationOverlay({
  open,
  smoothedPoint,
  onCancel,
  onSample,
  onComplete,
}: GazeCalibrationOverlayProps) {
  const plan = useMemo(() => createDefaultCalibrationPlan(), []);
  const targets = plan.all;
  const [index, setIndex] = useState(0);
  const [samples, setSamples] = useState<GazeCalibrationSample[]>([]);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setSamples([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === " ") {
        event.preventDefault();
        recordSample();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, smoothedPoint, samples]);

  if (!open) {
    return null;
  }

  const target = targets[index];
  const progress = `${index + 1} / ${targets.length}`;
  const phaseLabel = target.phase === "validation" ? "Validation" : "Training";

  function recordSample() {
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    const sample = {
      targetX: target.x * width,
      targetY: target.y * height,
      measuredX: smoothedPoint?.viewportX,
      measuredY: smoothedPoint?.viewportY,
      timestamp: performance.now(),
      phase: target.phase,
      accepted: Boolean(smoothedPoint),
    };
    if (target.phase === "training") {
      onSample?.(sample);
    }

    const nextSamples = [
      ...samples,
      sample,
    ];

    if (index >= targets.length - 1) {
      onComplete(nextSamples);
      return;
    }

    setSamples(nextSamples);
    setIndex(index + 1);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-background/92 text-foreground backdrop-blur-md" onClick={recordSample}>
      <div className="no-drag absolute left-6 top-6 max-w-sm rounded-lg border border-white/10 bg-popover/90 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Gaze calibration</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Look at the dot, then click or press Space. Training points update WebGazer; validation points only score accuracy.
            </p>
            <div className="mt-3 text-xs text-primary">{phaseLabel} {progress}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); onCancel(); }} aria-label="Cancel calibration">
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Calibration target"
        className="no-drag absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40 bg-primary shadow-[0_0_38px_var(--surface-glow)]"
        style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
        onClick={(event) => {
          event.stopPropagation();
          recordSample();
        }}
      />
    </div>
  );
}
