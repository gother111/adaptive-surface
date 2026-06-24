import { Bug, Camera, Crosshair, EyeOff, Hand, MousePointer2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useGaze } from "@/gaze/react/useGaze";
import type { GazeProviderId } from "@/gaze/types";
import { cn } from "@/lib/utils";
import { usePerception } from "@/perception/react/usePerception";

const providers: Array<{ id: GazeProviderId; label: string; icon: typeof EyeOff }> = [
  { id: "off", label: "Off", icon: EyeOff },
  { id: "mouse-simulated", label: "Mouse", icon: MousePointer2 },
  { id: "webgazer", label: "Webcam", icon: Camera },
];

interface GazeSettingsPanelProps {
  className?: string;
}

export function GazeSettingsPanel({ className }: GazeSettingsPanelProps) {
  const {
    providerId,
    status,
    currentTarget,
    calibration,
    settings,
    lastError,
    setProvider,
    start,
    stop,
    calibrate,
    clearCalibration,
    updateSettings,
  } = useGaze();
  const {
    handGesturesEnabled,
    handStatus,
    handError,
    camera,
    lastGesture,
    armedTarget,
    startHandTracking,
    stopHandTracking,
  } = usePerception();
  const active = status === "active" || status === "starting" || status === "calibrating" || status === "paused";
  const canCalibrate = providerId === "webgazer" && status === "active";

  return (
    <section className={cn("rounded-lg border border-white/10 bg-white/[0.035] p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Gaze attention</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Local opt-in target focus. Eyes nominate; voice or keyboard acts.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-background/50 px-2 py-1 text-[11px] text-muted-foreground">
          {status}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {providers.map((provider) => {
          const Icon = provider.icon;
          const selected = providerId === provider.id;

          return (
            <Button
              key={provider.id}
              variant={selected ? "default" : "secondary"}
              size="sm"
              className={cn("justify-start", selected ? "" : "bg-secondary/70")}
              onClick={() => void setProvider(provider.id)}
            >
              <Icon className="size-4" />
              {provider.label}
            </Button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant={active ? "outline" : "secondary"}
          size="sm"
          onClick={() => {
            if (active) {
              void stop();
              void stopHandTracking();
              return;
            }
            void start(providerId).then(() => {
              if (handGesturesEnabled) void startHandTracking();
            });
          }}
        >
          <Crosshair className="size-4" />
          {active ? "Stop" : "Start"}
        </Button>
        <Button variant="secondary" size="sm" onClick={calibrate} disabled={!canCalibrate}>
          <RotateCcw className="size-4" />
          Calibrate
        </Button>
      </div>

      <div className="mt-3 space-y-3 rounded-md border border-white/10 bg-background/30 p-3">
        <ToggleRow
          icon={<Crosshair className="size-4 text-primary" />}
          label="Show focus ring"
          checked={settings.showFocusRing}
          onCheckedChange={(checked) => updateSettings({ showFocusRing: checked })}
        />
        <ToggleRow
          icon={<Bug className="size-4 text-primary" />}
          label="Show gaze debug"
          checked={settings.showDebugHud}
          onCheckedChange={(checked) => updateSettings({ showDebugHud: checked })}
        />
        <ToggleRow
          icon={<Hand className="size-4 text-primary" />}
          label="Hand gesture confirmation"
          checked={handGesturesEnabled}
          onCheckedChange={(checked) => {
            updateSettings({ handGesturesEnabled: checked });
          }}
        />
      </div>

      <div className="mt-3 text-xs leading-5 text-muted-foreground">
        <div>Target: {currentTarget?.metadata?.label ?? currentTarget?.id ?? "none"}</div>
        <div>Camera: {camera.status}{camera.activeConsumerIds.length ? ` (${camera.activeConsumerIds.join(" + ")})` : ""}</div>
        <div>Hand: {handGesturesEnabled ? handStatus : "off"}</div>
        <div>Gesture: {lastGesture ? `${lastGesture.kind} / ${lastGesture.phase}` : "none"}</div>
        {settings.showDebugHud ? <div>Armed: {armedTarget?.metadata?.label ?? armedTarget?.id ?? "none"}</div> : null}
        <div>Calibration: {calibration.status} / {calibration.quality}{calibration.medianErrorPx ? ` / median ${Math.round(calibration.medianErrorPx)}px` : ""}</div>
        {lastError ? <div className="mt-1 text-destructive">Error: {lastError}</div> : null}
        {handError ? <div className="mt-1 text-destructive">Hand error: {handError}</div> : null}
        {status === "unsupported" && providerId === "webgazer" ? (
          <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-amber-50/85">
            Webcam gaze is unavailable in this runtime. Check camera permission and WebView media support.
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => void clearCalibration()}>
          Clear calibration
        </Button>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        Gaze and hand input are local and opt-in. Video frames are not recorded or uploaded.
      </p>
    </section>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
