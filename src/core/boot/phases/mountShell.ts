import type { BootPhase } from "~/core/boot/types";

import { ingestShellStickyFromSearchOnce } from "~/shells/shellRegistry";

export const mountShellPhase: BootPhase = {
  id: "mount-shell",
  label: "Mount Shell",
  weight: 35,
  async run(ctx) {
    if (ctx.signal.aborted) {
      return;
    }

    ingestShellStickyFromSearchOnce(globalThis.location?.search ?? "");
  },
};
