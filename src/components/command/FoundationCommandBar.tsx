import { SendHorizontal } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function FoundationCommandBar() {
  const [value, setValue] = useState("");
  const receiveVoiceFinal = useSurfaceStore((state) => state.receiveVoiceFinal);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = value.trim();
    if (!command) return;

    setValue("");
    receiveVoiceFinal(command);
  }

  return (
    <form
      onSubmit={submit}
      className="surface-panel-elevated no-drag fixed bottom-24 left-1/2 z-40 flex w-[min(780px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 p-2"
    >
      <input
        aria-label="Type a local command"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Type a command, for example: show recent emails"
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="icon" aria-label="Run command">
        <SendHorizontal className="size-4" />
      </Button>
    </form>
  );
}
