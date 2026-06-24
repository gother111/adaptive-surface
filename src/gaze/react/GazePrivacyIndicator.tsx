import { Camera, Eye, EyeOff, MousePointer2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGaze } from "@/gaze/react/useGaze";
import { usePerception } from "@/perception/react/usePerception";

export function GazePrivacyIndicator() {
  const { providerId, status } = useGaze();
  const { camera } = usePerception();
  const Icon = providerId === "off" && camera.status === "idle" ? EyeOff : providerId === "mouse-simulated" ? MousePointer2 : camera.status === "error" || camera.status === "permission-denied" ? TriangleAlert : camera.status === "active" ? Camera : Eye;

  return (
    <div className="no-drag fixed left-4 top-4 z-40">
      <Badge
        variant={camera.status === "active" ? "default" : "secondary"}
        className="gap-1.5 rounded-full border border-white/10 bg-background/65 px-3 py-1.5 text-[11px] shadow-xl backdrop-blur-xl"
      >
        <Icon className="size-3.5" />
        {indicatorLabel(providerId, status, camera.status, camera.activeConsumerIds)}
      </Badge>
    </div>
  );
}

function indicatorLabel(providerId: string, status: string, cameraStatus: string, consumers: readonly string[]) {
  if (cameraStatus === "permission-denied") return "Camera denied";
  if (cameraStatus === "error") return "Camera error";
  if (cameraStatus === "starting") return "Camera starting";
  if (cameraStatus === "active") {
    const hasGaze = consumers.includes("webgazer");
    const hasHand = consumers.includes("hand-tracking");
    if (hasGaze && hasHand) return "Camera active: gaze + hand";
    if (hasGaze) return "Camera active: gaze";
    if (hasHand) return "Camera active: hand";
    return "Camera active";
  }
  if (providerId === "off") return "Camera off";
  if (providerId === "mouse-simulated") return status === "active" ? "Gaze simulated" : "Gaze idle";
  if (status === "calibrating") return "Gaze calibrating";
  if (status === "unsupported") return "Camera unsupported";
  if (status === "error") return "Gaze error";
  if (status === "poor-tracking") return "Poor tracking";
  return "Camera off";
}
