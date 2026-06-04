import { Terminal } from "~/icons/lucide";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAutorunManifests, resetAutorunLatch } from "./autorun";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

vi.mock("~/core/debug", () => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

interface FakeKernel {
  kernel: Kernel;
  appsLaunch: ReturnType<typeof vi.fn>;
}

function makeManifest(overrides: Partial<AppManifest>): AppManifest {
  return {
    id: "test-app",
    name: "Test",
    icon: Terminal,
    category: "system",
    component: async () => ({ default: { template: "<div />" } }),
    ...overrides,
  };
}

function makeFakeKernel(manifests: AppManifest[]): FakeKernel {
  const appsLaunch = vi.fn(async (id: string) => ({
    id: `handle-${id}`,
    manifestId: id,
    on: vi.fn(),
    postMessage: vi.fn(),
  }));

  const kernel = {
    apps: {
      list: (): AppManifest[] => manifests,
      launch: appsLaunch,
    },
  } as unknown as Kernel;

  return { kernel, appsLaunch };
}

describe("runAutorunManifests (M3.6)", () => {
  beforeEach(() => {
    resetAutorunLatch();
  });

  afterEach(() => {
    resetAutorunLatch();
  });

  it("does nothing when no manifest has autorun:true", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "a" }),
      makeManifest({ id: "b" }),
    ]);

    await runAutorunManifests(kernel);

    expect(appsLaunch).not.toHaveBeenCalled();
  });

  it("launches a single singleton autorun manifest", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "warmer", autorun: true, singleton: true }),
      makeManifest({ id: "other" }),
    ]);

    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(1);
    expect(appsLaunch).toHaveBeenCalledWith("warmer");
  });

  it("launches multiple autorun manifests in registration order", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "first", autorun: true, singleton: true }),
      makeManifest({ id: "non-auto" }),
      makeManifest({ id: "second", autorun: true, singleton: true }),
    ]);

    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(2);
    expect(appsLaunch.mock.calls[0]?.[0]).toBe("first");
    expect(appsLaunch.mock.calls[1]?.[0]).toBe("second");
  });

  it("is idempotent — second invocation within the same lifetime is a no-op", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "warmer", autorun: true, singleton: true }),
    ]);

    await runAutorunManifests(kernel);
    await runAutorunManifests(kernel);
    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(1);
  });

  it("resetAutorunLatch() re-arms the runner for a fresh kernel lifetime", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "warmer", autorun: true, singleton: true }),
    ]);

    await runAutorunManifests(kernel);
    expect(appsLaunch).toHaveBeenCalledTimes(1);

    resetAutorunLatch();
    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(2);
  });

  it("skips non-singleton autorun manifests with a debugWarn", async () => {
    const { debugWarn } = await import("~/core/debug");
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "bad", autorun: true /* singleton omitted */ }),
      makeManifest({ id: "good", autorun: true, singleton: true }),
    ]);

    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(1);
    expect(appsLaunch).toHaveBeenCalledWith("good");
    expect(debugWarn).toHaveBeenCalledWith("[autorun]", expect.stringContaining("skipping bad"));
  });

  it("treats `singleton: false` the same as missing — explicit non-singleton is also skipped", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "bad", autorun: true, singleton: false }),
    ]);

    await runAutorunManifests(kernel);

    expect(appsLaunch).not.toHaveBeenCalled();
  });

  it("bails the in-flight pass when `resetAutorunLatch` fires mid-loop (dispose race guard)", async () => {
    // Simulates the HMR / test sequence: ShellHost schedules autorun;
    // calls `resetAutorunLatch()` — the next iteration must short-
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "first", autorun: true, singleton: true }),
      makeManifest({ id: "second", autorun: true, singleton: true }),
      makeManifest({ id: "third", autorun: true, singleton: true }),
    ]);

    appsLaunch.mockImplementationOnce(async () => {
      resetAutorunLatch();
      return { id: "handle-first", manifestId: "first", on: vi.fn(), postMessage: vi.fn() };
    });

    await runAutorunManifests(kernel);

    expect(appsLaunch).toHaveBeenCalledTimes(1);
    expect(appsLaunch).toHaveBeenCalledWith("first");
  });

  it("a fresh pass after `resetAutorunLatch` does not interleave with a zombie pass", async () => {
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "warmer", autorun: true, singleton: true }),
    ]);

    await runAutorunManifests(kernel);
    expect(appsLaunch).toHaveBeenCalledTimes(1);

    resetAutorunLatch();
    await runAutorunManifests(kernel);
    expect(appsLaunch).toHaveBeenCalledTimes(2);
    expect(appsLaunch.mock.calls[1]?.[0]).toBe("warmer");
  });

  it("swallows per-manifest launch errors so siblings still fire", async () => {
    const { debugWarn } = await import("~/core/debug");
    const { kernel, appsLaunch } = makeFakeKernel([
      makeManifest({ id: "broken", autorun: true, singleton: true }),
      makeManifest({ id: "healthy", autorun: true, singleton: true }),
    ]);

    appsLaunch.mockImplementationOnce(async () => {
      throw new Error("boom");
    });

    await expect(runAutorunManifests(kernel)).resolves.toBeUndefined();

    expect(appsLaunch).toHaveBeenCalledTimes(2);
    expect(appsLaunch.mock.calls[0]?.[0]).toBe("broken");
    expect(appsLaunch.mock.calls[1]?.[0]).toBe("healthy");
    expect(debugWarn).toHaveBeenCalledWith(
      "[autorun]",
      expect.stringContaining("launch failed for broken"),
      expect.any(Error),
    );
  });
});
