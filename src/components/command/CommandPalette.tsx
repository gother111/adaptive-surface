import { Command } from "cmdk";
import { Search } from "lucide-react";
import { surfaceMetas } from "@/lib/surface-fixtures";
import { cn } from "@/lib/utils";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function CommandPalette() {
  const open = useSurfaceStore((state) => state.commandOpen);
  const setOpen = useSurfaceStore((state) => state.setCommandOpen);
  const setActiveSurface = useSurfaceStore((state) => state.setActiveSurface);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start bg-black/45 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <Command
        className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-white/10 bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Switch surface or prepare an action..."
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
            No matching surface.
          </Command.Empty>
          <Command.Group heading="Surfaces" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            {surfaceMetas.map((surface) => {
              const Icon = surface.icon;

              return (
                <Command.Item
                  key={surface.id}
                  value={`${surface.title} ${surface.description}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm outline-none",
                    "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                  )}
                  onSelect={() => setActiveSurface(surface.id)}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  <span className="flex-1">{surface.title}</span>
                  <span className="text-xs text-muted-foreground">{surface.kind}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
