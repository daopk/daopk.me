import { afterEach, describe, expect, it, vi } from "vitest";

const vitePwaMock = vi.hoisted(() => vi.fn((options: unknown) => ({ name: "mock-pwa", options })));

vi.mock("vite-plugin-pwa", () => ({
  VitePWA: vitePwaMock,
}));

describe("pwaPlugin", () => {
  const originalAssetBase = process.env.DAOPK_PUBLIC_ASSET_BASE_URL;

  afterEach(() => {
    vitePwaMock.mockClear();
    if (originalAssetBase === undefined) {
      delete process.env.DAOPK_PUBLIC_ASSET_BASE_URL;
    } else {
      process.env.DAOPK_PUBLIC_ASSET_BASE_URL = originalAssetBase;
    }
  });

  it("keeps the service worker registration scoped to daopk.me when assets use the CDN", async () => {
    process.env.DAOPK_PUBLIC_ASSET_BASE_URL = "https://cdn.daopk.me/";

    const { pwaPlugin } = await import("../../vite/pwa");

    pwaPlugin();

    expect(vitePwaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        buildBase: "/",
        scope: "/",
        workbox: expect.objectContaining({
          modifyURLPrefix: {
            "assets/": "https://cdn.daopk.me/assets/",
          },
        }),
      }),
    );
  });
});
