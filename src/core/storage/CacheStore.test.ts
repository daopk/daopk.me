import { describe, expect, it, vi } from "vitest";

import { getCache } from "~/core/storage/CacheStore";

describe("getCache", () => {
  it("returns null when CacheStorage unsupported", async () => {
    vi.stubGlobal("caches", undefined);

    await expect(getCache("test-bucket")).resolves.toBeNull();

    vi.unstubAllGlobals();
  });

  it("calls caches.open when available", async () => {
    const stub = {
      async open(name: string) {
        await Promise.resolve();

        expect(name).toBe("daopk-smoke");

        return {} as Cache;
      },
    };

    vi.stubGlobal("caches", stub);

    await expect(getCache("daopk-smoke")).resolves.toEqual({});

    vi.unstubAllGlobals();
  });
});
