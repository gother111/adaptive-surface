import { useGaze } from "@/gaze/react/useGaze";
import { usePerception } from "@/perception/react/usePerception";

export function GazeDebugHud() {
  const { settings, providerId, status, latestPoint, smoothedPoint, currentTarget, calibration, lastError, latestObservation } = useGaze();
  const { camera, handStatus, lastGesture, lastIntent, armedTarget, telemetry } = usePerception();

  if (!settings.showDebugHud) {
    return null;
  }

  return (
    <aside className="pointer-events-none fixed left-4 bottom-5 z-50 w-[320px] rounded-lg border border-white/10 bg-popover/90 p-3 text-[11px] shadow-2xl backdrop-blur-xl">
      <div className="mb-2 font-semibold text-foreground">Gaze debug</div>
      <DebugLine label="provider" value={providerId} />
      <DebugLine label="status" value={status} />
      <DebugLine label="camera" value={`${camera.status} ${camera.activeConsumerIds.join("+") || "none"}`} />
      <DebugLine label="hand" value={handStatus} />
      <DebugLine label="latest" value={formatPoint(latestPoint)} />
      <DebugLine label="smooth" value={formatPoint(smoothedPoint)} />
      <DebugLine label="confidence" value={formatConfidence(smoothedPoint?.confidence ?? latestObservation?.confidence ?? null)} />
      <DebugLine label="tracking" value={latestObservation?.trackingState ?? "n/a"} />
      <DebugLine label="fixating" value={smoothedPoint?.isFixating ? "yes" : "no"} />
      <DebugLine label="target" value={currentTarget ? `${currentTarget.id} (${currentTarget.type})` : "none"} />
      <DebugLine label="dwell" value={currentTarget ? `${Math.round(currentTarget.dwellMs)}ms` : "n/a"} />
      <DebugLine label="armed" value={armedTarget?.id ?? "none"} />
      <DebugLine label="gesture" value={lastGesture ? `${lastGesture.kind}:${lastGesture.phase}` : "none"} />
      <DebugLine label="intent" value={lastIntent?.kind ?? "none"} />
      <DebugLine label="drops" value={String(telemetry.handFramesDroppedBusy)} />
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

function formatConfidence(confidence: number | null) {
  return confidence === null ? "n/a" : `${Math.round(confidence * 100)}%`;
}
