import { Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { ApprovalAction, SurfaceConfig } from "@/types/surface";

interface ApprovalSurfaceProps {
  config: SurfaceConfig;
}

const riskVariant: Record<ApprovalAction["risk"], "default" | "secondary" | "destructive"> = {
  low: "default",
  medium: "secondary",
  high: "destructive",
};

export function ApprovalSurface({ config }: ApprovalSurfaceProps) {
  const actions = config.approvalActions ?? [];

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-5xl flex-col gap-8 px-8 py-8">
      <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />

      <div className="grid gap-4">
        {actions.map((action) => (
          <ApprovalRow key={action.id} action={action} />
        ))}
      </div>

      <div className="surface-panel p-5 text-sm leading-6 text-muted-foreground">
        TODO: Add audit log persistence, undo previews, entitlement checks, and Accessibility
        permission status before enabling production AppleScript or app-control actions.
      </div>
    </div>
  );
}

function ApprovalRow({ action }: { action: ApprovalAction }) {
  const runPlaceholder = async () => {
    toast.info("Write actions are disabled for this local read-only pass.");
  };

  return (
    <article className="surface-panel grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-base font-semibold">{action.label}</h4>
          <Badge variant={riskVariant[action.risk]}>{action.risk} risk</Badge>
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 text-primary" />
          {action.target}
        </p>
      </div>
      <Button onClick={runPlaceholder}>
        <Play className="size-4" />
        Approve
      </Button>
    </article>
  );
}
