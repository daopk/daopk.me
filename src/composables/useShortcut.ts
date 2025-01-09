import { registerShellShortcut } from "~/core/shortcuts";

export function useShortcut() {
  return {
    listen: (
      chord: Parameters<typeof registerShellShortcut>[0],
      handler: (event: KeyboardEvent) => void,
    ): ReturnType<typeof registerShellShortcut> => registerShellShortcut(chord, handler),
  };
}
