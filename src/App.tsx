import { Toaster } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { CommandPalette } from "@/components/command/CommandPalette";
import { FloatingMicButton } from "@/components/voice/FloatingMicButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";

export function App() {
  useGlobalShortcut();

  return (
    <TooltipProvider>
      <div className="dark h-screen overflow-hidden bg-background text-foreground">
        <AppShell />
        <CommandPalette />
        <FloatingMicButton />
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </TooltipProvider>
  );
}
