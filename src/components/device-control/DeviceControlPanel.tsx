import * as Dialog from "@radix-ui/react-dialog";
import {
  ClipboardCopy,
  ClipboardPaste,
  Eye,
  Monitor,
  RefreshCw,
  Replace,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canExecuteDeviceAction,
  getDeviceActionDescriptor,
  type DeviceActionId,
} from "@/device-control/action-broker";
import {
  loadDesktopPermissionStatus,
  observeDesktop,
  pasteTextToActiveApp,
  readSelectedText,
  replaceSelectionInActiveApp,
} from "@/lib/device-control-api";
import type {
  DesktopObservation,
  DesktopPermissionStatus,
  DeviceActionResult,
  PermissionCheck,
  SelectedTextResult,
} from "@/types/device-control";

const TEST_INSERTION_TEXT = "Adaptive Surface test insertion — confirm this appeared in the active app.";

type ConfirmationKind = "paste" | "replace";

export function DeviceControlPanel() {
  const [permissionStatus, setPermissionStatus] = useState<DesktopPermissionStatus | null>(null);
  const [observation, setObservation] = useState<DesktopObservation | null>(null);
  const [selectedText, setSelectedText] = useState<SelectedTextResult | null>(null);
  const [actionText, setActionText] = useState(TEST_INSERTION_TEXT);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<DeviceActionResult | null>(null);
  const [showFullSelection, setShowFullSelection] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationKind | null>(null);

  useEffect(() => {
    void refreshPermissionStatus();
  }, []);

  const latestSelectedText = selectedText ?? observation?.selectedText ?? null;
  const selectedPreview = useMemo(() => {
    if (!latestSelectedText?.text) return "";
    return showFullSelection ? latestSelectedText.text : truncate(latestSelectedText.text, 360);
  }, [latestSelectedText, showFullSelection]);

  const isLoading = loadingAction !== null;

  async function refreshPermissionStatus() {
    setLoadingAction("permissions");
    setError(null);
    try {
      setPermissionStatus(await loadDesktopPermissionStatus());
    } catch (caught) {
      setError(errorMessage(caught, "Unable to load desktop-control permissions."));
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleObserve() {
    setLoadingAction("observe");
    setError(null);
    setLastActionResult(null);
    try {
      const result = await observeDesktop();
      setObservation(result);
      setPermissionStatus(result.permissionStatus);
      setSelectedText(result.selectedText ?? null);
      setShowFullSelection(false);
    } catch (caught) {
      setError(errorMessage(caught, "Unable to observe the desktop."));
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleReadSelectedText() {
    setLoadingAction("selected-text");
    setError(null);
    setLastActionResult(null);
    try {
      const result = await readSelectedText();
      setSelectedText(result);
      setShowFullSelection(false);
    } catch (caught) {
      setError(errorMessage(caught, "Unable to read selected text."));
    } finally {
      setLoadingAction(null);
    }
  }

  function requestMutation(kind: ConfirmationKind) {
    const actionId = actionIdForConfirmation(kind);
    const decision = canExecuteDeviceAction(actionId, { approved: false });

    if (!decision.ok) {
      setConfirmation(kind);
      return;
    }

    setConfirmation(kind);
  }

  async function executeConfirmedMutation() {
    if (!confirmation) return;

    const actionId = actionIdForConfirmation(confirmation);
    const descriptor = getDeviceActionDescriptor(actionId);
    const decision = canExecuteDeviceAction(descriptor, { approved: true });
    if (!decision.ok) {
      setError(decision.reason);
      setConfirmation(null);
      return;
    }

    setLoadingAction(actionId);
    setError(null);
    setLastActionResult(null);
    try {
      const request = { text: actionText, restoreClipboard: true };
      const result =
        confirmation === "paste"
          ? await pasteTextToActiveApp(request)
          : await replaceSelectionInActiveApp(request);
      setLastActionResult(result);
      setConfirmation(null);
    } catch (caught) {
      setError(errorMessage(caught, `Unable to ${confirmation} text.`));
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Device runtime
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">Desktop observation and approved text actions</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshPermissionStatus}
          disabled={isLoading}
          aria-label="Refresh desktop-control permissions"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
        <RuntimeRow label="Platform" value={permissionStatus?.platform ?? "not checked"} />
        {permissionStatus ? (
          <>
            <PermissionRow check={permissionStatus.accessibility} />
            <PermissionRow check={permissionStatus.screenRecording} suffix="not required yet" />
            <PermissionRow check={permissionStatus.automation} />
          </>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={handleObserve} disabled={isLoading}>
          <Eye className="size-4" />
          Observe current app
        </Button>
        <Button variant="secondary" size="sm" onClick={handleReadSelectedText} disabled={isLoading}>
          <ClipboardCopy className="size-4" />
          Read selected text
        </Button>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-black/20 p-3 text-xs">
        <RuntimeRow label="Active app" value={observation?.activeApp?.name ?? "not observed"} icon={<Monitor className="size-3.5" />} />
        <RuntimeRow label="Bundle ID" value={observation?.activeApp?.bundleId ?? "n/a"} />
        <RuntimeRow label="Window" value={observation?.activeWindow?.title ?? "n/a"} />
        <RuntimeRow label="Observed" value={observation ? new Date(observation.capturedAtMs).toLocaleTimeString() : "never"} />
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-muted-foreground">Selected text preview</div>
          {latestSelectedText?.text && latestSelectedText.text.length > 360 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowFullSelection((value) => !value)}>
              {showFullSelection ? "Show less" : "Show more"}
            </Button>
          ) : null}
        </div>
        <pre className="mt-2 max-h-40 whitespace-pre-wrap break-words rounded-md bg-black/25 p-2 text-xs leading-5 text-muted-foreground">
          {selectedPreview || "No selected text captured."}
        </pre>
        {latestSelectedText ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            source: {latestSelectedText.source} | confidence: {Math.round(latestSelectedText.confidence * 100)}%
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="device-control-action-text">
          Text to paste or replace
        </label>
        <textarea
          id="device-control-action-text"
          value={actionText}
          onChange={(event) => setActionText(event.target.value)}
          className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => requestMutation("paste")} disabled={isLoading}>
            <ClipboardPaste className="size-4" />
            Paste test text...
          </Button>
          <Button variant="secondary" size="sm" onClick={() => requestMutation("replace")} disabled={isLoading}>
            <Replace className="size-4" />
            Replace selection...
          </Button>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</div> : null}
      {lastActionResult ? (
        <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{lastActionResult.message}</div>
          {lastActionResult.warnings.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {lastActionResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {observation?.warnings.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {observation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <ConfirmationDialog
        kind={confirmation}
        text={actionText}
        loading={isLoading}
        onCancel={() => setConfirmation(null)}
        onConfirm={executeConfirmedMutation}
      />
    </section>
  );
}

function PermissionRow({ check, suffix }: { check: PermissionCheck; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-2">
      <div className="min-w-0">
        <div className="truncate text-muted-foreground">
          {check.label}
          {suffix ? <span className="ml-1 text-[11px]">({suffix})</span> : null}
        </div>
        {check.reason ? <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground/80">{check.reason}</div> : null}
      </div>
      <Badge variant={badgeVariantForPermission(check.status)}>{check.status}</Badge>
    </div>
  );
}

function RuntimeRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  );
}

function ConfirmationDialog({
  kind,
  text,
  loading,
  onCancel,
  onConfirm,
}: {
  kind: ConfirmationKind | null;
  text: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const actionId = kind ? actionIdForConfirmation(kind) : null;
  const descriptor = actionId ? getDeviceActionDescriptor(actionId) : null;

  return (
    <Dialog.Root open={kind !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-popover p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-sm font-semibold">{descriptor?.label ?? "Confirm action"}</Dialog.Title>
              <Dialog.Description className="mt-2 text-xs leading-5 text-muted-foreground">
                This will change the active app using the clipboard fallback. The clipboard will be restored when possible.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cancel device action">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <pre className="mt-3 max-h-40 whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/20 p-3 text-xs leading-5 text-muted-foreground">
            {truncate(text, 700) || "No text provided."}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={loading || !text.trim()}>
              Confirm {kind ?? "action"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function actionIdForConfirmation(kind: ConfirmationKind): DeviceActionId {
  return kind === "paste" ? "desktop.pasteText" : "desktop.replaceSelection";
}

function badgeVariantForPermission(status: PermissionCheck["status"]) {
  if (status === "granted") return "default";
  if (status === "needed") return "destructive";
  return "secondary";
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
