import {
  BarChart3,
  CalendarDays,
  FileSpreadsheet,
  Mail,
  NotebookText,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CalendarPanelProps,
  ChartFrameProps,
  EmailDraftSurfaceProps,
  NotesPanelProps,
  SurfaceInstance,
  TableFrameProps,
  WorkspaceSession,
} from "@/workspace/types";

interface WorkspaceStageProps {
  session: WorkspaceSession;
}

export function WorkspaceStage({ session }: WorkspaceStageProps) {
  const primarySurface = session.surfaces.find((surface) => surface.id === session.primarySurfaceId && surface.status !== "hidden");
  const supportingSurfaces = session.surfaces
    .filter((surface) => surface.role !== "primary" && surface.status !== "hidden" && surface.role !== "debug")
    .sort(sortSupportingSurfaces);

  if (!primarySurface) {
    return (
      <section className="drag-region grid h-screen place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-primary shadow-[0_0_42px_var(--surface-glow)]">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-lg font-medium">Speak or press Cmd Shift Space</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A workspace will stay open once there is something useful to work on.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="h-screen min-h-0 overflow-hidden px-4 pb-24 pt-16 sm:px-5 lg:px-6">
      <div
        className={cn(
          "mx-auto grid h-full max-w-7xl gap-4",
          supportingSurfaces.length > 0
            ? "grid-cols-1 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {supportingSurfaces.length > 0 ? (
          <aside className="no-drag flex min-h-0 flex-col gap-3 overflow-auto pr-1">
            {supportingSurfaces.map((surface) => (
              <SupportingSurface key={surface.id} surface={surface} />
            ))}
          </aside>
        ) : null}

        <div className="no-drag min-h-0">
          <PrimarySurface surface={primarySurface} />
        </div>
      </div>
    </section>
  );
}

function PrimarySurface({ surface }: { surface: SurfaceInstance }) {
  if (surface.kind === "email_draft") {
    return <EmailDraftSurface props={readEmailProps(surface.props)} />;
  }

  return null;
}

function SupportingSurface({ surface }: { surface: SurfaceInstance }) {
  if (surface.status === "collapsed") {
    return <CollapsedSurface surface={surface} />;
  }

  if (surface.kind === "calendar") {
    return <CalendarPanel props={surface.props as unknown as CalendarPanelProps} />;
  }

  if (surface.kind === "notes") {
    return <NotesPanel props={surface.props as unknown as NotesPanelProps} />;
  }

  if (surface.kind === "table") {
    return <TableFrame props={surface.props as unknown as TableFrameProps} />;
  }

  if (surface.kind === "chart") {
    return <ChartFrame props={surface.props as unknown as ChartFrameProps} />;
  }

  return null;
}

function EmailDraftSurface({ props }: { props: EmailDraftSurfaceProps }) {
  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-lg border border-white/10 bg-card/82 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" />
            Email draft
          </div>
          <Badge variant="secondary">{props.tone}</Badge>
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          <FieldRow label="To" value={props.to || "Recipient forming..."} />
          <FieldRow label="Subject" value={props.subject || "Untitled"} />
        </div>
        {props.sourceChips?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {props.sourceChips.map((chip) => (
              <Badge key={chip} variant="outline" className="border-white/10 bg-white/[0.04] text-muted-foreground">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="min-h-full whitespace-pre-wrap rounded-lg border border-white/[0.08] bg-white/[0.035] p-5 text-[15px] leading-7 text-foreground">
          {props.body}
        </div>
      </div>
    </section>
  );
}

function CalendarPanel({ props }: { props: CalendarPanelProps }) {
  return (
    <PanelShell icon={<CalendarDays className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.items.map((item) => (
          <div key={item.id} className="rounded-md border border-white/10 bg-background/35 p-3 text-sm">
            <div className="font-medium">{item.label}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function NotesPanel({ props }: { props: NotesPanelProps }) {
  return (
    <PanelShell icon={<NotebookText className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.notes.map((note) => (
          <article key={note.id} className="rounded-md border border-white/10 bg-background/35 p-3 text-sm">
            <h3 className="font-medium">{note.title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{note.excerpt}</p>
          </article>
        ))}
      </div>
    </PanelShell>
  );
}

function TableFrame({ props }: { props: TableFrameProps }) {
  return (
    <PanelShell icon={<FileSpreadsheet className="size-4 text-primary" />} title={props.title} badge="mock">
      <div className="overflow-hidden rounded-md border border-white/10 text-xs">
        <div className="grid bg-white/[0.045] font-medium" style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(0, 1fr))` }}>
          {props.columns.map((column) => (
            <div key={column} className="border-r border-white/10 p-2 last:border-r-0">
              {column}
            </div>
          ))}
        </div>
        {props.rows.map((row, index) => (
          <div key={index} className="grid border-t border-white/10" style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(0, 1fr))` }}>
            {props.columns.map((column) => (
              <div key={column} className="min-w-0 border-r border-white/10 p-2 text-muted-foreground last:border-r-0">
                {row[column]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function ChartFrame({ props }: { props: ChartFrameProps }) {
  const max = Math.max(...props.series.map((item) => item.value), 1);

  return (
    <PanelShell icon={<BarChart3 className="size-4 text-primary" />} title={props.title} badge="mock">
      <div className="flex h-44 items-end gap-2 rounded-md border border-white/10 bg-background/35 p-3">
        {props.series.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-sm bg-primary/75 shadow-[0_0_18px_var(--surface-glow)]"
              style={{ height: `${Math.max(14, (item.value / max) * 124)}px` }}
            />
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function PanelShell({
  icon,
  title,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-card/78 p-4 shadow-xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        <Badge variant="secondary">{badge}</Badge>
      </div>
      {children}
    </section>
  );
}

function CollapsedSurface({ surface }: { surface: SurfaceInstance }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
      <PanelLeftClose className="size-3.5 text-primary" />
      <span className="min-w-0 flex-1 truncate">{surfaceLabel(surface)} collapsed</span>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-foreground">{value}</span>
    </div>
  );
}

function readEmailProps(props: Record<string, unknown>): EmailDraftSurfaceProps {
  return {
    to: typeof props.to === "string" ? props.to : "",
    subject: typeof props.subject === "string" ? props.subject : "Friday availability",
    body: typeof props.body === "string" ? props.body : "Hi,\n\nTell me what this email should say.\n\nBest,",
    tone: props.tone === "formal" || props.tone === "direct" || props.tone === "warm" ? props.tone : "warm",
    sourceChips: Array.isArray(props.sourceChips)
      ? props.sourceChips.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function sortSupportingSurfaces(a: SurfaceInstance, b: SurfaceInstance) {
  return zoneWeight(a.zone) - zoneWeight(b.zone) || a.createdAt - b.createdAt;
}

function zoneWeight(zone: SurfaceInstance["zone"]) {
  if (zone === "top_left") return 0;
  if (zone === "left") return 1;
  if (zone === "bottom_left") return 2;
  if (zone === "bottom") return 3;
  return 4;
}

function surfaceLabel(surface: SurfaceInstance) {
  if (surface.kind === "email_draft") return "Email draft";
  if (surface.kind === "calendar") return "Calendar";
  if (surface.kind === "notes") return "Notes";
  if (surface.kind === "table") return "Table";
  if (surface.kind === "chart") return "Chart";
  return "Surface";
}
