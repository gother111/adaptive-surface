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
import { GazeTarget } from "@/gaze/react/GazeTarget";
import { WorkspaceGrid } from "@/components/workspace/WorkspaceGrid";
import type {
  CalendarPanelProps,
  ChartFrameProps,
  EmailDraftSurfaceProps,
  FoundationSurfaceProps,
  MailPanelProps,
  NotesPanelProps,
  RemindersPanelProps,
  FilesPanelProps,
  SurfaceInstance,
  TableFrameProps,
  WorkspaceSession,
} from "@/workspace/types";

interface WorkspaceStageProps {
  session: WorkspaceSession;
}

export function WorkspaceStage({ session }: WorkspaceStageProps) {
  const primarySurface = session.surfaces.find((surface) => surface.id === session.primarySurfaceId && surface.status !== "hidden");
  const hasActiveSurface = session.surfaces.some((surface) => surface.status !== "hidden" && surface.role !== "debug");

  if (!primarySurface && !hasActiveSurface) {
    return (
      <GazeTarget
        id="surface:workspace-empty"
        type="surface-region"
        priority={4}
        className="h-screen"
        metadata={{
          label: "Workspace",
          entityId: "workspace-empty",
          actionHints: ["focus", "start"],
        }}
      >
        <section className="drag-region grid h-full place-items-center px-6">
          <div className="max-w-md text-center">
            <div className="surface-subpanel mx-auto mb-5 flex size-12 items-center justify-center text-primary shadow-[var(--shadow-surface)]">
              <Sparkles className="size-5" />
            </div>
            <h1 className="text-lg font-medium">Speak or type a command</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A workspace will stay open once there is something useful to work on.
            </p>
          </div>
        </section>
      </GazeTarget>
    );
  }

  return (
    <WorkspaceGrid
      session={session}
      renderSurface={(surface) => (
        <WorkspaceSurface
          surface={surface}
          debugVisible={session.debugVisible}
          primary={surface.id === session.primarySurfaceId}
        />
      )}
    />
  );
}

function WorkspaceSurface({ surface, debugVisible, primary }: { surface: SurfaceInstance; debugVisible: boolean; primary: boolean }) {
  const content = renderWorkspaceSurface(surface);

  const wrappedContent = content ? (
    <GazeTarget
      id={`surface:${surface.id}`}
      type={surface.kind === "document" ? "document" : surface.kind === "table" ? "table" : "surface"}
      priority={primary ? 20 : 10}
      metadata={{
        label: surfaceLabel(surface),
        entityId: surface.id,
        actionHints: ["open", "summarize", "compare", "focus"],
        surfaceKind: surface.kind,
      }}
    >
      {content}
    </GazeTarget>
  ) : null;

  if (!debugVisible || !content) {
    return wrappedContent;
  }

  return (
    <div className="relative">
      <div className="mb-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary">
        {surface.id} | {surface.kind} | {surface.role} | {surface.zone} | primary {primary ? "yes" : "no"}
      </div>
      {wrappedContent}
    </div>
  );
}

function renderWorkspaceSurface(surface: SurfaceInstance) {
  if (surface.status === "collapsed") {
    return <CollapsedSurface surface={surface} />;
  }

  if (surface.kind === "email_draft") {
    return <EmailDraftSurface props={readEmailProps(surface.props)} />;
  }

  if (surface.kind === "calendar") {
    return <CalendarPanel props={surface.props as unknown as CalendarPanelProps} />;
  }

  if (surface.kind === "mail") {
    return <MailPanel props={surface.props as unknown as MailPanelProps} />;
  }

  if (surface.kind === "notes") {
    return <NotesPanel props={surface.props as unknown as NotesPanelProps} />;
  }

  if (surface.kind === "reminders") {
    return <RemindersPanel props={surface.props as unknown as RemindersPanelProps} />;
  }

  if ((surface.kind === "files" || surface.kind === "document") && Array.isArray((surface.props as Partial<FilesPanelProps>).files)) {
    return <FilesPanel props={surface.props as unknown as FilesPanelProps} />;
  }

  if (surface.kind === "table") {
    return <TableFrame props={surface.props as unknown as TableFrameProps} />;
  }

  if (surface.kind === "chart") {
    return <ChartFrame props={surface.props as unknown as ChartFrameProps} />;
  }

  if (isFoundationSurface(surface.kind)) {
    return <FoundationPanel props={surface.props as unknown as FoundationSurfaceProps} />;
  }

  return null;
}

function EmailDraftSurface({ props }: { props: EmailDraftSurfaceProps }) {
  return (
    <section className="surface-panel flex h-full min-h-[520px] flex-col overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" />
            Email draft
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.statusLabel ? <Badge variant="outline">{props.statusLabel}</Badge> : null}
            <Badge variant="secondary">{props.tone}</Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          <FieldRow label="To" value={props.to || "Recipient forming..."} />
          <FieldRow label="Subject" value={props.subject || "Untitled"} />
        </div>
        {props.sourceChips?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {props.sourceChips.map((chip) => (
              <Badge key={chip} variant="outline" className="border-border-subtle bg-surface-2 text-muted-foreground">
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
        {props.statusLabel ? (
          <div className="mt-4 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
            {props.statusDetail ?? `${props.statusLabel}. No mail has been sent.`}
            {props.safetyChecklist?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-primary/90">
                {props.safetyChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="surface-subpanel min-h-full whitespace-pre-wrap p-5 text-[15px] leading-7 text-foreground">
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
        {props.items.length ? (
          props.items.map((item) => (
            <div key={item.id} className="surface-row p-3 text-sm">
              <div className="font-medium">{item.label}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.calendarName}</div>
              {item.location ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.location}</div> : null}
            </div>
          ))
        ) : (
          <EmptyPanelText status={props.status} label="No calendar events loaded yet." />
        )}
        <PanelWarnings warnings={props.warnings} />
      </div>
    </PanelShell>
  );
}

function MailPanel({ props }: { props: MailPanelProps }) {
  return (
    <PanelShell icon={<Mail className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.messages.length ? (
          props.messages.map((message) => (
            <article key={message.id} className="surface-row p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{message.subject}</h3>
                <Badge variant={message.isRead ? "outline" : "secondary"}>
                  {message.isRead ? "Read" : "Unread"}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.sender}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.mailbox}</p>
              {message.receivedAt ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.receivedAt}</p> : null}
              {message.preview ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{message.preview}</p> : null}
            </article>
          ))
        ) : (
          <EmptyPanelText status={props.status} label="No inbox messages loaded yet." />
        )}
        <PanelWarnings warnings={props.warnings} />
      </div>
    </PanelShell>
  );
}

function NotesPanel({ props }: { props: NotesPanelProps }) {
  return (
    <PanelShell icon={<NotebookText className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.notes.length ? (
          props.notes.map((note) => (
            <article key={note.id} className="surface-row p-3 text-sm">
              <h3 className="font-medium">{note.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{note.folder}</p>
              {note.modifiedAt ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{note.modifiedAt}</p> : null}
              {note.excerpt ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{note.excerpt}</p> : null}
            </article>
          ))
        ) : (
          <EmptyPanelText status={props.status} label="No notes loaded yet." />
        )}
        <PanelWarnings warnings={props.warnings} />
      </div>
    </PanelShell>
  );
}

function RemindersPanel({ props }: { props: RemindersPanelProps }) {
  return (
    <PanelShell icon={<NotebookText className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.reminders.length ? (
          props.reminders.map((reminder) => (
            <article key={reminder.id} className="surface-row p-3 text-sm">
              <h3 className="font-medium">{reminder.title}</h3>
              {reminder.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{reminder.detail}</p> : null}
              {reminder.dueAt ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{reminder.dueAt}</p> : null}
            </article>
          ))
        ) : (
          <EmptyPanelText status={props.status} label="No reminders loaded yet." />
        )}
        <PanelWarnings warnings={props.warnings} />
      </div>
    </PanelShell>
  );
}

function FilesPanel({ props }: { props: FilesPanelProps }) {
  return (
    <PanelShell icon={<FileSpreadsheet className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        {props.files.length ? (
          props.files.map((file) => (
            <article key={file.id} className="surface-row p-3 text-sm">
              <h3 className="font-medium">{file.label}</h3>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{file.path}</p>
              {file.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{file.detail}</p> : null}
            </article>
          ))
        ) : (
          <EmptyPanelText status={props.status} label="No trusted file results loaded yet." />
        )}
        <PanelWarnings warnings={props.warnings} />
      </div>
    </PanelShell>
  );
}

function FoundationPanel({ props }: { props: FoundationSurfaceProps }) {
  const items = props.items ?? [];
  const detailEntries = props.detail ? Object.entries(props.detail).filter(([, value]) => value !== undefined && value !== null && value !== "") : [];

  return (
    <PanelShell icon={<Sparkles className="size-4 text-primary" />} title={props.title} badge={props.status}>
      <div className="space-y-3">
        <div className="surface-row p-3 text-xs leading-5 text-muted-foreground">
          <div><span className="text-foreground">Command:</span> {props.command}</div>
          <div><span className="text-foreground">Adapter:</span> {props.adapter}</div>
          {props.provider ? <div><span className="text-foreground">Provider:</span> {props.provider}</div> : null}
          {props.errorKind ? <div><span className="text-foreground">Error kind:</span> {props.errorKind}</div> : null}
          {typeof props.didOpenExternalApp === "boolean" ? (
            <div><span className="text-foreground">External app opened:</span> {props.didOpenExternalApp ? "yes" : "no"}</div>
          ) : null}
          {props.summary ? <div className="mt-2 text-foreground">{props.summary}</div> : null}
        </div>

        {props.approval ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <div className="font-medium text-foreground">Approval needed: {props.approval.label}</div>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {JSON.stringify(props.approval.preview, null, 2)}
            </pre>
          </div>
        ) : null}

        {items.length ? (
          <div className="space-y-2">
            {items.map((item, index) => (
              <article key={`${props.title}-${index}`} className="surface-row p-3 text-sm">
                <ObjectPreview item={item} />
              </article>
            ))}
          </div>
        ) : props.status === "empty" ? (
          <EmptyPanelText status={props.status} label="The adapter returned no matching data." />
        ) : null}

        {detailEntries.length ? (
          <div className="surface-row p-3 text-xs leading-5 text-muted-foreground">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                <span className="text-foreground">{key}</span>
                <span className="min-w-0 break-words">{String(value)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {props.body ? (
          <div className="surface-subpanel max-h-[46vh] overflow-auto whitespace-pre-wrap p-4 text-sm leading-6">
            {props.body}
          </div>
        ) : null}

        {props.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive-foreground">
            <div className="font-medium">Exact error</div>
            <div className="mt-1 break-words">{props.error}</div>
          </div>
        ) : null}

        {props.permissionHint || props.suggestedNextAction ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-muted-foreground">
            {props.permissionHint ? <p>{props.permissionHint}</p> : null}
            {props.suggestedNextAction ? <p className="mt-1">{props.suggestedNextAction}</p> : null}
          </div>
        ) : null}
      </div>
    </PanelShell>
  );
}

function ObjectPreview({ item }: { item: Record<string, unknown> }) {
  const title = pickString(item, ["title", "subject", "displayName", "name", "label", "id"]);
  const subtitle = pickString(item, ["subtitle", "sender", "folder", "calendarName", "listName", "organization", "path"]);
  const body = pickString(item, ["preview", "body", "contentPreview", "notes", "readableType"]);

  return (
    <div>
      <div className="font-medium">{title}</div>
      {subtitle ? <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{subtitle}</div> : null}
      {body ? <div className="mt-2 break-words text-xs leading-5 text-muted-foreground">{body}</div> : null}
    </div>
  );
}

function EmptyPanelText({ status, label }: { status: string; label: string }) {
  return (
    <p className="surface-row p-3 text-xs leading-5 text-muted-foreground">
      {status === "loading" ? "Loading real local Apple context..." : label}
    </p>
  );
}

function PanelWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-muted-foreground">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}

function TableFrame({ props }: { props: TableFrameProps }) {
  return (
    <PanelShell icon={<FileSpreadsheet className="size-4 text-primary" />} title={props.title} badge="fixture">
      <div className="overflow-hidden rounded-md border border-border-subtle text-xs">
        <div className="grid bg-surface-2 font-medium" style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(0, 1fr))` }}>
          {props.columns.map((column) => (
            <div key={column} className="border-r border-border-subtle p-2 last:border-r-0">
              {column}
            </div>
          ))}
        </div>
        {props.rows.map((row, index) => (
          <div key={index} className="grid border-t border-border-subtle" style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(0, 1fr))` }}>
            {props.columns.map((column) => (
              <div key={column} className="min-w-0 border-r border-border-subtle p-2 text-muted-foreground last:border-r-0">
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
    <PanelShell icon={<BarChart3 className="size-4 text-primary" />} title={props.title} badge="fixture">
      <div className="surface-subpanel flex h-44 items-end gap-2 p-3">
        {props.series.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-sm bg-primary/75"
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
    <section className="surface-panel overflow-hidden p-4">
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
    <div className="surface-row flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
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
    statusLabel: typeof props.statusLabel === "string" ? props.statusLabel : undefined,
    statusDetail: typeof props.statusDetail === "string" ? props.statusDetail : undefined,
    safetyChecklist: Array.isArray(props.safetyChecklist)
      ? props.safetyChecklist.filter((item): item is string => typeof item === "string")
      : [],
    sourceChips: Array.isArray(props.sourceChips)
      ? props.sourceChips.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function surfaceLabel(surface: SurfaceInstance) {
  if (surface.kind === "email_draft") return "Email draft";
  if (surface.kind === "calendar") return "Calendar";
  if (surface.kind === "mail") return "Mail";
  if (surface.kind === "notes") return "Notes";
  if (surface.kind === "reminders") return "Reminders";
  if (surface.kind === "files") return "Files";
  if (surface.kind === "table") return "Table";
  if (surface.kind === "chart") return "Chart";
  if (isFoundationSurface(surface.kind)) return "Local context";
  return "Surface";
}

function isFoundationSurface(kind: SurfaceInstance["kind"]) {
  return [
    "capability_status",
    "email_list",
    "email_detail",
    "calendar_day",
    "reminder_list",
    "notes_list",
    "note_detail",
    "contacts",
    "files",
    "file_detail",
    "document",
    "command_error",
    "unsupported_context",
    "approval",
  ].includes(kind);
}

function pickString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}
