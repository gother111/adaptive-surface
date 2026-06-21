import { Camera, Eye, EyeOff, MousePointer2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGaze } from "@/gaze/react/useGaze";

export function GazePrivacyIndicator() {
  const { providerId, status } = useGaze();
  const Icon = providerId === "off" ? EyeOff : providerId === "mouse-simulated" ? MousePointer2 : status === "error" || status === "permission-denied" ? TriangleAlert : providerId === "webgazer" ? Camera : Eye;

  return (
    <div className="no-drag fixed left-4 top-4 z-40">
      <Badge
        variant={providerId === "webgazer" && status === "active" ? "default" : "secondary"}
        className="gap-1.5 rounded-full border border-white/10 bg-background/65 px-3 py-1.5 text-[11px] shadow-xl backdrop-blur-xl"
      >
        <Icon className="size-3.5" />
        {indicatorLabel(providerId, status)}
      </Badge>
    </div>
  );
}

function indicatorLabel(providerId: string, status: string) {
  if (providerId === "off") return "Gaze off";
  if (providerId === "mouse-simulated") return status === "active" ? "Gaze simulated" : "Gaze idle";
  if (status === "starting") return "Camera starting";
  if (status === "calibrating") return "Gaze calibrating";
  if (status === "permission-denied") return "Camera denied";
  if (status === "unsupported") return "Camera unsupported";
  if (status === "error") return "Gaze error";
  if (status === "poor-tracking") return "Poor tracking";
  return status === "active" ? "Camera gaze active" : "Camera gaze idle";
}
