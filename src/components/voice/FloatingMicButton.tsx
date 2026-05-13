import { Mic, MicOff, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export function FloatingMicButton() {
  const { supported, listening, interimText, error, toggle } = useSpeechRecognition();

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-3">
      {interimText || error ? (
        <div className="max-w-[520px] rounded-md border border-white/10 bg-popover/95 px-4 py-3 text-center text-sm shadow-xl backdrop-blur">
          {interimText ? <p className="text-foreground">{interimText}</p> : null}
          {error ? <p className="text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <Button
        size="lg"
        className="h-14 rounded-full border border-primary/30 bg-primary px-6 text-primary-foreground shadow-[0_0_46px_var(--surface-glow)] hover:bg-primary/90"
        onClick={() => {
          if (!supported) {
            toast.info("Voice input needs Web Speech API support. In production, add a native speech bridge or local transcription backend.");
          }
          toggle();
        }}
      >
        {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        {listening ? "Listening" : "Hold the surface"}
        {listening ? <Waves className="size-5 animate-pulse" /> : null}
      </Button>
    </div>
  );
}
