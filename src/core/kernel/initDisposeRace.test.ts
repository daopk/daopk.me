import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import type { SearchAdapter } from "~/core/search/SearchAdapter";

const searchMock = vi.hoisted(() => {
  const state = {
    promise: Promise.resolve({} as SearchAdapter),
    resolve: (_adapter: SearchAdapter) => undefined,
  };

  function reset(): void {
    state.promise = new Promise<SearchAdapter>((resolve) => {
      state.resolve = resolve;
    });
  }

  return {
    createSearchAdapter: vi.fn(() => state.promise),
    reset,
    resolve: (adapter: SearchAdapter): void => state.resolve(adapter),
  };
});

vi.mock("~/core/search/createSearchAdapter", () => ({
  createSearchAdapter: searchMock.createSearchAdapter,
}));

vi.mock("~/core/debug", () => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
}));

import { kernel } from "./index";

describe("kernel init/dispose race", () => {
  beforeEach(() => {
    searchMock.reset();
    searchMock.createSearchAdapter.mockClear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    kernel.dispose();
  });

  it("disposes a search adapter that resolves after kernel.dispose()", async () => {
    const adapter: SearchAdapter = {
      query: vi.fn(async () => [{ kind: "command", id: "stale", title: "Stale", score: 1 }]),
      dispose: vi.fn(),
    };

    const init = kernel.init();
    expect(searchMock.createSearchAdapter).toHaveBeenCalledTimes(1);

    kernel.dispose();
    searchMock.resolve(adapter);

    await init;

    expect(adapter.dispose).toHaveBeenCalledTimes(1);
    await expect(kernel.search.query("stale")).resolves.toEqual([]);
  });
});
