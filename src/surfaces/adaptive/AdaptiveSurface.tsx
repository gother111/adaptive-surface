import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Columns3,
  FileText,
  ListChecks,
  NotebookPen,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { SurfaceConfig } from "@/types/surface";

interface AdaptiveSurfaceProps {
  config: SurfaceConfig;
}

const iconByKind = {
  summary: FileText,
  note: NotebookPen,
  research: Search,
  catch_up: ListChecks,
  comparison: Columns3,
};

export function AdaptiveSurface({ config }: AdaptiveSurfaceProps) {
  const Icon = iconByKind[config.kind as keyof typeof iconByKind] ?? Sparkles;
  const sections = config.sections ?? [];

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-8 py-8">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.07] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="surface-subpanel flex size-12 items-center justify-center text-primary">
                <Icon className="size-6" />
              </div>
              <SurfaceHeader
                title={config.title}
                subtitle={config.subtitle}
                status={config.streamStatus}
              />
            </div>
            <Badge variant="secondary" className="shrink-0">
              {config.confidence ? `${Math.round(config.confidence * 100)}% intent` : "live"}
            </Badge>
          </div>
        </div>

        {config.kind === "comparison" ? (
          <ComparisonSkeleton sections={sections} />
        ) : (
          <SectionGrid sections={sections} />
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="surface-panel p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" />
              Live transcript
            </div>
            <p className="mt-4 min-h-16 text-lg leading-8 text-foreground">
              {config.liveTranscript || "Start speaking and this text will stream in here."}
            </p>
          </div>
          <div className="surface-panel p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CircleDashed className="size-4 animate-spin text-primary" />
              Agent-ready next
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              TODO: pass this draft to LangGraph as a typed Work Object and stream validated
              patches back into Zustand.
            </p>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function SectionGrid({ sections }: { sections: NonNullable<SurfaceConfig["sections"]> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sections.map((section, index) => (
        <article
          key={section.id}
          className="surface-panel motion-content-update p-5 animate-in fade-in-0 slide-in-from-bottom-2"
          style={{ animationDelay: `${index * 35}ms` }}
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <CheckCircle2 className="size-4 text-primary" />
          </div>
          <ul className="mt-4 space-y-3">
            {section.items.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                <ArrowRight className="mt-1 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function ComparisonSkeleton({ sections }: { sections: NonNullable<SurfaceConfig["sections"]> }) {
  const optionItems = sections.find((section) => section.id === "options")?.items ?? ["Option A", "Option B"];
  const criteria = sections.find((section) => section.id === "criteria")?.items ?? ["Cost", "Speed", "Risk", "Fit"];

  return (
    <div className="surface-panel overflow-hidden">
      <div className="grid grid-cols-[180px_repeat(2,minmax(0,1fr))] border-b border-border-subtle bg-surface-2 text-sm font-medium">
        <div className="p-4 text-muted-foreground">Criteria</div>
        {optionItems.slice(0, 2).map((option, index) => (
          <div key={`${option}-${index}`} className="border-l border-border-subtle p-4">
            {option}
          </div>
        ))}
      </div>
      {criteria.map((criterion, rowIndex) => (
        <div key={criterion} className="grid grid-cols-[180px_repeat(2,minmax(0,1fr))] border-b border-border-subtle last:border-b-0">
          <div className="p-4 text-sm font-medium">{criterion}</div>
          {[0, 1].map((column) => (
            <div key={column} className="border-l border-border-subtle p-4">
              <div
                className={cn("h-3 rounded-full bg-primary/50", rowIndex % 2 === column ? "w-3/4" : "w-1/2")}
              />
            </div>
          ))}
        </div>
      ))}
      <div className="flex justify-end p-4">
        <Button variant="secondary" size="sm">Refine table</Button>
      </div>
    </div>
  );
}
