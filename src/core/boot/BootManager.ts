import type { InjectionKey } from "vue";

import { debugWarn } from "~/core/debug";

import type { BootContext, BootPhase } from "~/core/boot/types";
import { durationSince, nowMs } from "~/core/telemetry";
import type { Kernel, KernelBootFacade } from "~/types/kernel";

export interface BootDisposable {
  dispose(): void;
}

export const BootManagerInjectionKey: InjectionKey<BootManager> = Symbol("daopk.boot-manager");

export class BootManager implements BootDisposable {
  readonly phases: ReadonlyArray<BootPhase>;

  private readonly facade: KernelBootFacade;

  private readonly kernelAccessor: Kernel;

  private disposed = false;
  private activeRun: Promise<void> | undefined;
  private abortCtl: AbortController | undefined;

  constructor(kernel: Kernel, kernelBoot: KernelBootFacade, phases: ReadonlyArray<BootPhase>) {
    this.kernelAccessor = kernel;
    this.facade = kernelBoot;
    this.phases = phases;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.abortCtl?.abort();
    this.abortCtl = undefined;
    this.activeRun = undefined;
  }

  reset(): void {
    if (this.facade.status === "failed" || this.facade.status === "cancelled") {
      this.facade.status = "idle";
      this.facade.progressFraction = 0;
      this.facade.phaseLabel = "";
      this.facade.error = null;
    }
  }

  async boot(): Promise<void> {
    if (this.disposed) {
      return;
    }

    if (!this.activeRun) {
      this.activeRun = this.runInternal().finally(() => {
        this.activeRun = undefined;
        this.abortCtl = undefined;
      });
    }

    await this.activeRun;
  }

  private markCancelled(): void {
    this.facade.status = "cancelled";
    this.facade.progressFraction = 0;
    this.facade.phaseLabel = "";
  }

  private async runInternal(): Promise<void> {
    if (this.facade.status === "complete") {
      return;
    }

    if (this.disposed) {
      return;
    }

    const totalWeight = this.phases.reduce((sum, p) => sum + p.weight, 0);
    const startedAt = nowMs();

    let completedWeight = 0;

    const abortCtl = new AbortController();
    this.abortCtl = abortCtl;
    const { signal } = abortCtl;

    const ctx: BootContext = {
      kernel: this.kernelAccessor,
      signal,
    };

    this.facade.status = "running";
    this.facade.phaseLabel = "Starting…";
    this.facade.error = null;

    try {
      for (const phase of this.phases) {
        if (signal.aborted || this.disposed) {
          this.markCancelled();
          this.trackFinished("cancelled", startedAt);
          return;
        }

        this.facade.phaseLabel = phase.label;

        await phase.run(ctx);

        completedWeight += phase.weight;
        this.facade.progressFraction = totalWeight > 0 ? completedWeight / totalWeight : 1;
      }

      this.facade.status = "complete";
      this.facade.phaseLabel = "Ready";
      this.facade.progressFraction = 1;
      this.trackFinished("complete", startedAt);
    } catch (error: unknown) {
      if (signal.aborted || this.disposed) {
        this.markCancelled();
        this.trackFinished("cancelled", startedAt);
        return;
      }

      this.facade.status = "failed";
      this.facade.error = error instanceof Error ? error : new Error(String(error));
      this.trackFinished("failed", startedAt);
      debugWarn("[boot]", "phase failure", error);
    }
  }

  private trackFinished(status: "complete" | "failed" | "cancelled", startedAt: number): void {
    this.kernelAccessor.telemetry.track({
      name: "boot.finished",
      payload: {
        durationMs: durationSince(startedAt),
        phaseCount: this.phases.length,
        status,
      },
    });
  }
}
