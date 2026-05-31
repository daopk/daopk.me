import { describe, expect, it, vi } from "vitest";

import { BootManager } from "~/core/boot/BootManager";
import type { BootPhase } from "~/core/boot/types";
import type { Kernel, KernelBootFacade } from "~/types/kernel";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
}));

function makeBootFacade(): KernelBootFacade {
  return {
    status: "idle",
    progressFraction: 0,
    phaseLabel: "",
    error: null,
    scheduleIdleAfterShellReady: vi.fn(() => () => undefined),
  };
}

function makeKernel(track = vi.fn()): Kernel {
  return {
    telemetry: {
      isEnabled: vi.fn(() => true),
      track,
      setTransport: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;
}

function phase(label: string, run: BootPhase["run"] = vi.fn()): BootPhase {
  return {
    label,
    weight: 1,
    run,
  };
}

describe("BootManager telemetry", () => {
  it("records a boot.finished envelope when boot completes", async () => {
    const track = vi.fn();
    const phases = [phase("A"), phase("B")];
    const facade = makeBootFacade();
    const manager = new BootManager(makeKernel(track), facade, phases);

    await manager.boot();

    expect(track).toHaveBeenCalledWith({
      name: "boot.finished",
      payload: {
        durationMs: expect.any(Number),
        phaseCount: 2,
        status: "complete",
      },
    });
    expect(facade.error).toBeNull();
  });

  it("records failed status without swallowing the failed facade state", async () => {
    const track = vi.fn();
    const facade = makeBootFacade();
    const manager = new BootManager(makeKernel(track), facade, [
      phase("A", () => {
        throw new Error("boom");
      }),
    ]);

    await manager.boot();

    expect(facade.status).toBe("failed");
    expect(track).toHaveBeenCalledWith({
      name: "boot.finished",
      payload: {
        durationMs: expect.any(Number),
        phaseCount: 1,
        status: "failed",
      },
    });
  });

  it("surfaces the phase error on the facade so the host can show it", async () => {
    const facade = makeBootFacade();
    const failure = new Error("disk on fire");
    const manager = new BootManager(makeKernel(), facade, [
      phase("A", () => {
        throw failure;
      }),
    ]);

    await manager.boot();

    expect(facade.status).toBe("failed");
    expect(facade.error).toBe(failure);
  });

  it("normalizes a non-Error thrown value into an Error on the facade", async () => {
    const facade = makeBootFacade();
    const manager = new BootManager(makeKernel(), facade, [
      phase("A", () => {
        throw "stringy failure";
      }),
    ]);

    await manager.boot();

    expect(facade.error).toBeInstanceOf(Error);
    expect(facade.error?.message).toBe("stringy failure");
  });

  it("clears the failure error on reset so a retry starts clean", async () => {
    const facade = makeBootFacade();
    const manager = new BootManager(makeKernel(), facade, [
      phase("A", () => {
        throw new Error("boom");
      }),
    ]);

    await manager.boot();
    expect(facade.error).toBeInstanceOf(Error);

    manager.reset();

    expect(facade.status).toBe("idle");
    expect(facade.error).toBeNull();
  });
});
