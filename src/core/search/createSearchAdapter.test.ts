import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";

const workerMock = vi.hoisted(() => ({
  canUseSearchWorker: vi.fn(),
  createSearchWorkerAdapter: vi.fn(),
}));

const debugMock = vi.hoisted(() => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

vi.mock("~/core/search/SearchWorkerAdapter", () => workerMock);

vi.mock("~/core/debug", () => debugMock);

import { createSearchAdapter } from "~/core/search/createSearchAdapter";

function makeKernel(): Kernel {
  const commands: CommandManifest[] = [
    {
      id: "theme:toggle",
      title: "Toggle Theme",
      scope: "global",
      keywords: ["dark", "light"],
      run: () => undefined,
    },
  ];

  return {
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: vi.fn(),
      list: () => commands,
    },
    apps: {
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
      list: () => [],
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  } as unknown as Kernel;
}

describe("createSearchAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerMock.canUseSearchWorker.mockReturnValue(true);
  });

  it("returns the worker adapter after the readiness handshake succeeds", async () => {
    const workerAdapter = {
      ready: Promise.resolve(),
      query: vi.fn(async () => []),
      dispose: vi.fn(),
    };

    workerMock.createSearchWorkerAdapter.mockReturnValue(workerAdapter);

    await expect(createSearchAdapter(makeKernel())).resolves.toBe(workerAdapter);
    expect(workerAdapter.dispose).not.toHaveBeenCalled();
  });

  it("disposes an unready worker and falls back to MiniSearch", async () => {
    const workerAdapter = {
      ready: Promise.reject(new Error("silent worker")),
      query: vi.fn(async () => []),
      dispose: vi.fn(),
    };

    workerMock.createSearchWorkerAdapter.mockReturnValue(workerAdapter);

    const adapter = await createSearchAdapter(makeKernel());

    expect(workerAdapter.dispose).toHaveBeenCalledTimes(1);
    await expect(Promise.resolve(adapter.query("dark"))).resolves.toEqual([
      expect.objectContaining({ id: "theme:toggle", kind: "command" }),
    ]);
    expect(debugMock.debugWarn).toHaveBeenCalledWith(
      "[search]",
      "worker adapter unavailable; falling back to MiniSearch",
      expect.objectContaining({ message: "silent worker" }),
    );

    adapter.dispose();
  });
});
