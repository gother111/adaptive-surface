import { FolderCog, KeyRound, Mic2, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import type { SurfaceConfig } from "@/types/surface";

interface SettingsSurfaceProps {
  config: SurfaceConfig;
}

export function SettingsSurface({ config }: SettingsSurfaceProps) {
  const settings = useSurfaceStore((state) => state.settings);
  const updateSettings = useSurfaceStore((state) => state.updateSettings);

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-5xl flex-col gap-8 px-8 py-8">
      <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />

      <div className="grid gap-4 lg:grid-cols-2">
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
            TODO: Connect model routing to local LangGraph, FastAPI, OpenAI-compatible providers,
            or a policy-based router.
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
            description="Required before controlling other macOS apps through Accessibility APIs."
            checked={settings.accessibilityEnabled}
            onCheckedChange={(checked) => updateSettings({ accessibilityEnabled: checked })}
          />
          <SettingToggle
            label="AppleScript bridge"
            description="Allows approval-gated AppleScript commands through the Rust shell boundary."
            checked={settings.appleScriptEnabled}
            onCheckedChange={(checked) => updateSettings({ appleScriptEnabled: checked })}
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-card/70 p-5">
          <div className="flex items-center gap-3">
            <FolderCog className="size-5 text-primary" />
            <h4 className="text-sm font-semibold">Integrations</h4>
          </div>
          <div className="mt-5 space-y-3">
            <Label htmlFor="backend">Local backend URL</Label>
            <Input
              id="backend"
              value={settings.localBackendUrl}
              onChange={(event) => updateSettings({ localBackendUrl: event.target.value })}
            />
          </div>
        </section>
      </div>
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
