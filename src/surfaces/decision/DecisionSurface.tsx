import { ArrowRight, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { SurfaceConfig } from "@/types/surface";

interface DecisionSurfaceProps {
  config: SurfaceConfig;
}

export function DecisionSurface({ config }: DecisionSurfaceProps) {
  const options = config.decisionOptions ?? [];

  return (
    <div className="mx-auto flex h-[calc(100vh-13rem)] max-w-5xl flex-col gap-8 overflow-y-auto px-8 pb-8 pt-8">
      <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />

      <div className="grid gap-4">
        {options.map((option) => (
          <article
            key={option.id}
            className="surface-panel grid gap-5 p-5 md:grid-cols-[1fr_180px]"
          >
            <div>
              <h4 className="text-base font-semibold">{option.label}</h4>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.tradeoff}</p>
            </div>
            <div className="flex items-center justify-between gap-4 md:justify-end">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="size-4 text-primary" />
                {option.confidence}% confidence
              </div>
              <Button size="icon" variant="secondary" aria-label={`Choose ${option.label}`}>
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/10 p-5">
        <p className="text-sm leading-6 text-primary">
          No outside action runs from this surface until you choose an option and approve the
          exact next step.
        </p>
      </div>
    </div>
  );
}
