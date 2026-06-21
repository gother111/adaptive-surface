import { useGaze } from "@/gaze/react/useGaze";

export function GazeFocusOverlay() {
  const { currentTarget, settings, smoothedPoint, status } = useGaze();

  const canShow = status === "active" || status === "calibrating" || status === "poor-tracking";
  if (!settings.showFocusRing || !canShow) {
    return null;
  }

  if (currentTarget) {
    const rect = currentTarget.rect;

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-30 rounded-lg border border-primary/55 bg-primary/5 shadow-[0_0_32px_var(--surface-glow)] transition-[left,top,width,height,opacity] duration-150 motion-reduce:transition-none"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
    );
  }

  if (!smoothedPoint) {
    return null;
  }

  const size = smoothedPoint.source === "webgazer" ? 112 : 64;
  const opacity = smoothedPoint.isFixating ? 0.85 : 0.62;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-30 rounded-full border border-primary/45 bg-primary/10 shadow-[0_0_38px_var(--surface-glow)] transition-[left,top,width,height,opacity] duration-100 motion-reduce:transition-none"
      style={{
        left: smoothedPoint.viewportX - size / 2,
        top: smoothedPoint.viewportY - size / 2,
        width: size,
        height: size,
        opacity,
      }}
    />
  );
}
