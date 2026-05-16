import { Toaster } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { CommandPalette } from "@/components/command/CommandPalette";
import { DebugHUD } from "@/components/debug/DebugHUD";
import { FloatingMicButton } from "@/components/voice/FloatingMicButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDebugShortcut } from "@/hooks/useDebugShortcut";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { VoiceController } from "@/voice/VoiceController";

export function App() {
  useGlobalShortcut();
  useDebugShortcut();

  return (
    <TooltipProvider>
      <div className="dark h-screen overflow-hidden bg-background text-foreground">
        <VoiceController />
        <AppShell />
        <CommandPalette />
        <DebugHUD />
        <FloatingMicButton />
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </TooltipProvider>
  );
}
