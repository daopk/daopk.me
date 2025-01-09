/** Global chord registry cooperating with Accessibility + IME guarded hooks. */

import { kernel } from "~/core/kernel";

export function registerShellShortcut(
  binding: string,
  action: (event: KeyboardEvent) => void,
): () => void {
  return kernel.shortcuts.register(binding, action);
}
