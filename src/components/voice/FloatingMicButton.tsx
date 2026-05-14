import { Mic, MicOff, Sparkles, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function FloatingMicButton() {
  const supported = useSurfaceStore((state) => state.voiceSupported);
  const listening = useSurfaceStore((state) => state.listening);
  const listeningRequested = useSurfaceStore((state) => state.listeningRequested);
  const partialTranscript = useSurfaceStore((state) => state.partialTranscript);
  const activeIntent = useSurfaceStore((state) => state.activeIntent);
  const firstPartialLatencyMs = useSurfaceStore((state) => state.firstPartialLatencyMs);
  const error = useSurfaceStore((state) => state.voiceError);
  const toggle = useSurfaceStore((state) => state.toggleListeningRequested);

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-3">
      {partialTranscript || error || activeIntent ? (
        <div className="w-[min(720px,calc(100vw-32px))] rounded-lg border border-white/10 bg-popover/95 px-4 py-3 text-center text-sm shadow-xl backdrop-blur">
          {activeIntent ? (
            <div className="mb-2 flex items-center justify-center gap-2 text-xs text-primary">
              <Sparkles className="size-3.5" />
              <span>
                {activeIntent.title} · {Math.round(activeIntent.confidence * 100)}%
                {firstPartialLatencyMs ? ` · first words ${firstPartialLatencyMs}ms` : ""}
              </span>
            </div>
          ) : null}
          {partialTranscript ? <p className="text-foreground">{partialTranscript}</p> : null}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <Button
        size="lg"
        className={cn(
          "h-16 rounded-full border border-primary/30 px-7 text-primary-foreground shadow-[0_0_46px_var(--surface-glow)] transition-all duration-300 hover:bg-primary/90",
          listeningRequested || listening
            ? "scale-[1.03] bg-primary ring-8 ring-primary/10"
            : "bg-primary/90",
        )}
        onClick={() => {
          if (!supported) {
            toast.info("Voice input needs the native macOS Speech bridge next, or a local Whisper provider.");
          }
          toggle();
        }}
      >
        {listeningRequested ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        {listeningRequested ? "Listening live" : "Speak surface"}
        {listening ? <Waves className="size-5 animate-pulse" /> : null}
      </Button>
    </div>
  );
}
