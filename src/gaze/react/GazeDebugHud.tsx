import { useGaze } from "@/gaze/react/useGaze";

export function GazeDebugHud() {
  const { settings, providerId, status, latestPoint, smoothedPoint, currentTarget, calibration, lastError } = useGaze();

  if (!settings.showDebugHud) {
    return null;
  }

  return (
    <aside className="pointer-events-none fixed left-4 bottom-5 z-50 w-[320px] rounded-lg border border-white/10 bg-popover/90 p-3 text-[11px] shadow-2xl backdrop-blur-xl">
      <div className="mb-2 font-semibold text-foreground">Gaze debug</div>
      <DebugLine label="provider" value={providerId} />
      <DebugLine label="status" value={status} />
      <DebugLine label="raw" value={formatPoint(latestPoint)} />
      <DebugLine label="smooth" value={formatPoint(smoothedPoint)} />
      <DebugLine label="confidence" value={smoothedPoint ? `${Math.round(smoothedPoint.confidence * 100)}%` : "n/a"} />
      <DebugLine label="fixating" value={smoothedPoint?.isFixating ? "yes" : "no"} />
      <DebugLine label="target" value={currentTarget ? `${currentTarget.id} (${currentTarget.type})` : "none"} />
      <DebugLine label="dwell" value={currentTarget ? `${Math.round(currentTarget.dwellMs)}ms` : "n/a"} />
      <DebugLine label="calibration" value={`${calibration.status} / ${calibration.quality}`} />
      {lastError ? <DebugLine label="error" value={lastError} /> : null}
    </aside>
  );
}

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-2 text-muted-foreground">
      <span className="text-foreground">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function formatPoint(point: { viewportX: number; viewportY: number } | null) {
  return point ? `${Math.round(point.viewportX)}, ${Math.round(point.viewportY)}` : "n/a";
}
