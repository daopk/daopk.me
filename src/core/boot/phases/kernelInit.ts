import type { BootPhase } from "~/core/boot/types";

export const kernelInitPhase: BootPhase = {
  id: "kernel-init",
  label: "Kernel Init",
  weight: 45,
  async run(ctx) {
    if (ctx.signal.aborted) {
      return;
    }

    await ctx.kernel.init();
  },
};
