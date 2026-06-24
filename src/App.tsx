import { Toaster } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { CommandPalette } from "@/components/command/CommandPalette";
import { DebugHUD } from "@/components/debug/DebugHUD";
import { FloatingMicButton } from "@/components/voice/FloatingMicButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GazeProviderRoot } from "@/gaze/react/GazeContext";
import { useDebugShortcut } from "@/hooks/useDebugShortcut";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { PerceptionProviderRoot } from "@/perception/react/PerceptionContext";
import { ThemePreferenceProvider, useThemePreference } from "@/surface-system/theme";
import { VoiceController } from "@/voice/VoiceController";

export function App() {
  useGlobalShortcut();
  useDebugShortcut();

  return (
    <ThemePreferenceProvider>
      <AppContent />
    </ThemePreferenceProvider>
  );
}

function AppContent() {
  const { resolvedTheme } = useThemePreference();

  return (
    <TooltipProvider>
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <PerceptionProviderRoot>
          <GazeProviderRoot>
            <VoiceController />
            <AppShell />
            <CommandPalette />
            <DebugHUD />
            <FloatingMicButton />
          </GazeProviderRoot>
        </PerceptionProviderRoot>
        <Toaster theme={resolvedTheme} position="top-right" richColors />
      </div>
    </TooltipProvider>
  );
}
