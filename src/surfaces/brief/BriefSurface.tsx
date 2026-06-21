import { CheckCircle2, CircleAlert, RadioTower } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { BriefBlock, SurfaceConfig } from "@/types/surface";

interface BriefSurfaceProps {
  config: SurfaceConfig;
}

const statusIcon = {
  fresh: CheckCircle2,
  watching: RadioTower,
  blocked: CircleAlert,
};

export function BriefSurface({ config }: BriefSurfaceProps) {
  const blocks = config.briefBlocks ?? [];

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-8 py-8">
        <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />

        <div className="grid gap-4 lg:grid-cols-3">
          {blocks.map((block) => (
            <BriefCard key={block.id} block={block} />
          ))}
        </div>

        <section className="surface-panel p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-primary" />
            Agent stream placeholder
          </div>
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-3 rounded-sm bg-surface-2">
                <div
                  className="h-full rounded-sm bg-primary/60"
                  style={{ width: `${72 - index * 18}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            TODO: Connect this area to local LangGraph or FastAPI streaming events and apply
            incremental updates to the Zustand surface store.
          </p>
        </section>
      </div>
    </ScrollArea>
  );
}

function BriefCard({ block }: { block: BriefBlock }) {
  const Icon = statusIcon[block.status ?? "fresh"];

  return (
    <article className="surface-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{block.title}</h4>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{block.body}</p>
    </article>
  );
}
