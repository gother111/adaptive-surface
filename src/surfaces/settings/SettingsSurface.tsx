import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeAlert,
  CalendarDays,
  DatabaseZap,
  FolderCog,
  KeyRound,
  Mail,
  Mic2,
  Network,
  NotebookPen,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  loadAppleContextBundle,
  loadExternalAuthRequirements,
  loadLocalContextPreview,
} from "@/lib/context-api";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import type {
  AppleCalendarEvent,
  AppleContextBundle,
  AppleContextWarning,
  AppleMailMessage,
  AppleNotePreview,
  ExternalAuthRequirement,
  LocalContextPreview,
} from "@/types/context";
import type { ContextSourceConfig, SurfaceConfig } from "@/types/surface";

interface SettingsSurfaceProps {
  config: SurfaceConfig;
}

type LoadState = "idle" | "loading" | "success" | "error";

export function SettingsSurface({ config }: SettingsSurfaceProps) {
  const settings = useSurfaceStore((state) => state.settings);
  const updateSettings = useSurfaceStore((state) => state.updateSettings);
  const setAppleContextBundle = useSurfaceStore((state) => state.setAppleContextBundle);

  const [localPreview, setLocalPreview] = useState<LocalContextPreview | null>(null);
  const [localState, setLocalState] = useState<LoadState>("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  const [applePreview, setApplePreview] = useState<AppleContextBundle | null>(null);
  const [appleState, setAppleState] = useState<LoadState>("idle");
  const [appleError, setAppleError] = useState<string | null>(null);

  const [authRequirements, setAuthRequirements] = useState<ExternalAuthRequirement[]>([]);
  const [authState, setAuthState] = useState<LoadState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void refreshLocalPreview();
    void refreshAuthRequirements();
    // We want this to refresh only when the configured roots or index path change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.personalFileIndexPath, settings.trustedFileRoots.join("|")]);

  async function refreshLocalPreview() {
    setLocalState("loading");
    setLocalError(null);

    try {
      const preview = await loadLocalContextPreview(
        settings.trustedFileRoots,
        settings.personalFileIndexPath,
      );
      setLocalPreview(preview);
      setLocalState("success");
    } catch (error) {
      setLocalState("error");
      setLocalError(error instanceof Error ? error.message : "Failed to load local context.");
    }
  }

  async function refreshApplePreview() {
    setAppleState("loading");
    setAppleError(null);

    try {
      const preview = await loadAppleContextBundle();
      setApplePreview(preview);
      setAppleContextBundle(preview);
      setAppleState("success");
    } catch (error) {
      setAppleState("error");
      setAppleError(error instanceof Error ? error.message : "Failed to load Apple app context.");
    }
  }

  async function refreshAuthRequirements() {
    setAuthState("loading");
    setAuthError(null);

    try {
      const requirements = await loadExternalAuthRequirements();
      setAuthRequirements(requirements);
      setAuthState("success");
    } catch (error) {
      setAuthState("error");
      setAuthError(error instanceof Error ? error.message : "Failed to load OAuth requirements.");
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col gap-8 px-8 py-8">
      <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center gap-3">
            <Network className="size-5 text-primary" />
            <h4 className="text-sm font-semibold">Model routing</h4>
          </div>
          <div className="mt-5 space-y-3">
            <Label htmlFor="model">Selected model</Label>
            <Input
              id="model"
              value={settings.selectedModel}
              onChange={(event) => updateSettings({ selectedModel: event.target.value })}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This is still the local router placeholder. The context work below is designed so a
            future model layer can consume structured local and app context safely.
          </p>
        </section>

        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center gap-3">
            <Mic2 className="size-5 text-primary" />
            <h4 className="text-sm font-semibold">Voice</h4>
          </div>
          <SettingToggle
            label="Continuous listening"
            description="Keep the microphone session open while the work surface is active."
            checked={settings.voiceMode === "continuous"}
            onCheckedChange={(checked) =>
              updateSettings({ voiceMode: checked ? "continuous" : "push-to-talk" })
            }
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" />
            <h4 className="text-sm font-semibold">Permissions</h4>
          </div>
          <SettingToggle
            label="Accessibility bridge"
            description="Needed later for deeper app control, but not for the first read-focused context pass."
            checked={settings.accessibilityEnabled}
            onCheckedChange={(checked) => updateSettings({ accessibilityEnabled: checked })}
          />
          <SettingToggle
            label="Apple app bridge"
            description="Required for local read-only Calendar, Notes, and Mail previews through a narrow allowlisted bridge."
            checked={settings.appleScriptEnabled}
            onCheckedChange={(checked) => updateSettings({ appleScriptEnabled: checked })}
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center gap-3">
            <FolderCog className="size-5 text-primary" />
            <h4 className="text-sm font-semibold">Local file context</h4>
          </div>

          <div className="mt-5 space-y-3">
            <Label htmlFor="indexPath">Personal directory index path</Label>
            <Input
              id="indexPath"
              value={settings.personalFileIndexPath}
              onChange={(event) => updateSettings({ personalFileIndexPath: event.target.value })}
            />
          </div>

          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-medium">Trusted folders</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {settings.trustedFileRoots.map((path) => (
                <Badge key={path} variant="secondary" className="bg-white/10 text-foreground">
                  {path}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                onClick={() => void refreshLocalPreview()}
                disabled={localState === "loading"}
              >
                <RefreshCw className={localState === "loading" ? "animate-spin" : undefined} />
                Refresh local context
              </Button>
              <StatusBadge state={localState} />
            </div>
            {localError ? <p className="mt-3 text-sm text-destructive">{localError}</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-white/10 bg-card/70 p-5">
        <div className="flex items-center gap-3">
          <DatabaseZap className="size-5 text-primary" />
          <div>
            <h4 className="text-sm font-semibold">Context source policy</h4>
            <p className="text-sm text-muted-foreground">
              This reflects your current approval model, not a generic default.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {settings.contextSources.map((source) => (
            <ContextSourceCard key={source.id} source={source} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ScrollText className="size-5 text-primary" />
              <div>
                <h4 className="text-sm font-semibold">Local context preview</h4>
                <p className="text-sm text-muted-foreground">
                  Live scan of your approved local folders plus the personal directory index file.
                </p>
              </div>
            </div>
            <StatusBadge state={localState} />
          </div>

          {localPreview ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard label="Files" value={localPreview.totalFiles.toLocaleString()} />
                <MetricCard label="Folders" value={localPreview.totalDirectories.toLocaleString()} />
                <MetricCard label="Scanned entries" value={localPreview.scannedEntries.toLocaleString()} />
                <MetricCard
                  label="Index file"
                  value={localPreview.indexFound ? "Found" : "Missing"}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <PreviewListCard
                  title="Top file types"
                  items={localPreview.topExtensions.map(
                    (item) => `${item.extension} | ${item.count.toLocaleString()}`,
                  )}
                  emptyLabel="No file extensions found yet."
                />
                <PreviewListCard
                  title="Recent files"
                  items={localPreview.recentFiles.map(
                    (item) =>
                      `${new Date(item.modifiedAtMs).toLocaleString()} | ${shortenPath(item.path)}`,
                  )}
                  emptyLabel="No recent files found yet."
                />
              </div>

              <PreviewListCard
                title="Personal directory index excerpt"
                items={localPreview.indexPreview}
                emptyLabel="The personal directory index file was not found or had no readable lines."
              />
            </div>
          ) : (
            <EmptyState body="Run the local context refresh to inspect your approved folders and personal directory file." />
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-5 text-primary" />
              <div>
                <h4 className="text-sm font-semibold">Apple app preview</h4>
                <p className="text-sm text-muted-foreground">
                  Pulls typed local read previews from Calendar, Notes, and Mail.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void refreshApplePreview()}
              disabled={appleState === "loading"}
            >
              <RefreshCw className={appleState === "loading" ? "animate-spin" : undefined} />
              Preview Apple apps
            </Button>
          </div>

          {appleError ? <p className="mt-4 text-sm text-destructive">{appleError}</p> : null}

          {applePreview ? (
            <div className="mt-5 space-y-4">
              <AppleSourceCard
                title="Calendar"
                icon={CalendarDays}
                items={applePreview.calendarEvents}
                emptyLabel="No calendar preview returned."
                renderItem={(event) => <CalendarPreviewItem event={event} />}
              />
              <AppleSourceCard
                title="Notes"
                icon={NotebookPen}
                items={applePreview.notes}
                emptyLabel="No notes preview returned."
                renderItem={(note) => <NotePreviewItem note={note} />}
              />
              <AppleSourceCard
                title="Mail"
                icon={Mail}
                items={applePreview.mailMessages}
                emptyLabel="No mail preview returned."
                renderItem={(message) => <MailPreviewItem message={message} />}
              />

              {applePreview.warnings.length ? (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
                    <BadgeAlert className="size-4" />
                    macOS permission warnings
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-amber-50/85">
                    {groupWarnings(applePreview.warnings).map((warningGroup) => (
                      <div key={warningGroup.source}>
                        <p className="font-medium capitalize">{warningGroup.source}</p>
                        {warningGroup.messages.map((message) => (
                          <p key={message}>{message}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState body="This will likely trigger macOS automation prompts the first time you run it inside the desktop app." />
          )}
        </section>
      </div>

      <section className="rounded-lg border border-white/10 bg-card/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BadgeAlert className="size-5 text-primary" />
            <div>
              <h4 className="text-sm font-semibold">OAuth blockers still missing</h4>
              <p className="text-sm text-muted-foreground">
                These are the exact app-level inputs the repo still needs before GitHub, Slack, and
                Gmail sign-in can become real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void refreshAuthRequirements()}
              disabled={authState === "loading"}
            >
              <RefreshCw className={authState === "loading" ? "animate-spin" : undefined} />
              Refresh blockers
            </Button>
            <StatusBadge state={authState} />
          </div>
        </div>

        {authError ? <p className="mt-4 text-sm text-destructive">{authError}</p> : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {authRequirements.map((requirement) => (
            <article
              key={requirement.id}
              className="rounded-md border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{requirement.label}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {requirement.provider}
                  </p>
                </div>
                <Badge variant="outline">Ready to configure</Badge>
              </div>

              <p className="mt-4 text-sm font-medium">Required values</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {requirement.requiredValues.map((item) => (
                  <Badge key={item} variant="secondary" className="bg-white/10 text-foreground">
                    {item}
                  </Badge>
                ))}
              </div>

              <p className="mt-4 text-sm font-medium">Redirect strategy</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {requirement.redirectStrategy}
              </p>

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {requirement.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function SettingToggle({ label, description, checked, onCheckedChange }: SettingToggleProps) {
  return (
    <div className="mt-5 flex items-start justify-between gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ContextSourceCard({ source }: { source: ContextSourceConfig }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{source.label}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{source.description}</p>
        </div>
        <Badge variant={badgeVariantForStatus(source.status)}>{labelForStatus(source.status)}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">Mode: {labelForMode(source.accessMode)}</Badge>
        <Badge variant="outline">Bridge: {labelForBridge(source.bridge)}</Badge>
        <Badge variant="outline">Writes: {labelForWritePolicy(source.writePolicy)}</Badge>
      </div>

      {source.detail ? (
        <p className="mt-4 text-sm leading-5 text-muted-foreground">{source.detail}</p>
      ) : null}

      {source.userValue ? (
        <p className="mt-3 text-sm leading-5 text-foreground/90">Configured value: {source.userValue}</p>
      ) : null}
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PreviewListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.length ? items.map((item) => <p key={item}>{item}</p>) : <p>{emptyLabel}</p>}
      </div>
    </div>
  );
}

function AppleSourceCard<T extends { id: string }>({
  title,
  icon: Icon,
  items,
  emptyLabel,
  renderItem,
}: {
  title: string;
  icon: typeof CalendarDays;
  items: T[];
  emptyLabel: string;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" />
        {title}
      </div>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.length ? items.map((item) => <div key={item.id}>{renderItem(item)}</div>) : <p>{emptyLabel}</p>}
      </div>
    </div>
  );
}

function CalendarPreviewItem({ event }: { event: AppleCalendarEvent }) {
  return (
    <article className="rounded-md border border-white/10 bg-background/30 p-3">
      <p className="font-medium text-foreground">{event.title}</p>
      <p className="mt-1 text-xs">{event.startAt}</p>
      <p className="mt-1 text-xs">{event.calendarName}</p>
      {event.location ? <p className="mt-1 text-xs">Location: {event.location}</p> : null}
    </article>
  );
}

function MailPreviewItem({ message }: { message: AppleMailMessage }) {
  return (
    <article className="rounded-md border border-white/10 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-foreground">{message.subject}</p>
        <Badge variant={message.isRead ? "outline" : "secondary"}>
          {message.isRead ? "Read" : "Unread"}
        </Badge>
      </div>
      <p className="mt-1 text-xs">{message.sender}</p>
      <p className="mt-1 text-xs">{message.mailbox}</p>
      {message.receivedAt ? <p className="mt-1 text-xs">{message.receivedAt}</p> : null}
      {message.preview ? <p className="mt-2 text-xs leading-5">{message.preview}</p> : null}
    </article>
  );
}

function NotePreviewItem({ note }: { note: AppleNotePreview }) {
  return (
    <article className="rounded-md border border-white/10 bg-background/30 p-3">
      <p className="font-medium text-foreground">{note.title}</p>
      <p className="mt-1 text-xs">{note.folder}</p>
      {note.modifiedAt ? <p className="mt-1 text-xs">Modified: {note.modifiedAt}</p> : null}
      {note.preview ? <p className="mt-2 text-xs leading-5">{note.preview}</p> : null}
    </article>
  );
}

function groupWarnings(warnings: AppleContextWarning[]) {
  const grouped = new Map<AppleContextWarning["source"], string[]>();
  for (const warning of warnings) {
    grouped.set(warning.source, [...(grouped.get(warning.source) ?? []), warning.message]);
  }
  return Array.from(grouped.entries()).map(([source, messages]) => ({ source, messages }));
}

function EmptyState({ body }: { body: string }) {
  return (
    <div className="mt-5 rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
      {body}
    </div>
  );
}

function StatusBadge({ state }: { state: LoadState }) {
  switch (state) {
    case "idle":
      return <Badge variant="outline">Idle</Badge>;
    case "loading":
      return <Badge variant="default">Loading</Badge>;
    case "success":
      return <Badge variant="secondary">Ready</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
  }
}

function badgeVariantForStatus(status: ContextSourceConfig["status"]) {
  switch (status) {
    case "ready":
      return "secondary";
    case "needs-permission":
    case "needs-auth":
    case "needs-oauth-config":
    case "needs-path":
      return "outline";
    case "planned":
      return "default";
  }
}

function labelForStatus(status: ContextSourceConfig["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "needs-permission":
      return "Needs permission";
    case "needs-auth":
      return "Needs sign-in";
    case "needs-oauth-config":
      return "Needs OAuth setup";
    case "needs-path":
      return "Needs path";
    case "planned":
      return "Planned";
  }
}

function labelForMode(mode: ContextSourceConfig["accessMode"]) {
  switch (mode) {
    case "disabled":
      return "Off";
    case "read":
      return "Read";
    case "approval":
      return "Approval gated";
  }
}

function labelForBridge(bridge: ContextSourceConfig["bridge"]) {
  switch (bridge) {
    case "tauri-fs":
      return "Tauri file access";
    case "applescript-read":
      return "AppleScript bridge";
    case "mail-connector":
      return "Mailbox connector";
    case "oauth-api":
      return "OAuth API";
    case "manual-import":
      return "Manual import";
  }
}

function labelForWritePolicy(policy: ContextSourceConfig["writePolicy"]) {
  switch (policy) {
    case "read-only":
      return "Read only";
    case "drafts-allowed":
      return "Drafts allowed";
    case "full-write":
      return "Full write";
  }
}

function shortenPath(path: string) {
  if (path.length <= 88) {
    return path;
  }

  return `${path.slice(0, 38)}...${path.slice(-44)}`;
}
