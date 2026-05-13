import { Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StreamStatus } from "@/types/surface";

interface SurfaceHeaderProps {
  title: string;
  subtitle: string;
  status?: StreamStatus;
}

const statusLabel: Record<StreamStatus, string> = {
  idle: "Idle",
  thinking: "Thinking",
  streaming: "Streaming",
  complete: "Complete",
  error: "Error",
};

export function SurfaceHeader({ title, subtitle, status = "idle" }: SurfaceHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h3 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant={status === "error" ? "destructive" : "secondary"} className="gap-2">
        {status === "thinking" || status === "streaming" ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Activity className="size-3" />
        )}
        {statusLabel[status]}
      </Badge>
    </div>
  );
}
