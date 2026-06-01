import { describe, expect, it } from "vitest";

import { photosProxyTargetUrl } from "../../vite/plugins/photosContentProxyServer";

describe("photosProxyTargetUrl", () => {
  it("maps photo content requests to the production origin", () => {
    expect(photosProxyTargetUrl("/_worker/photos/index.json")).toBe(
      "https://daopk.me/_worker/photos/index.json",
    );
    expect(photosProxyTargetUrl("/_worker/photos/2026/sunset.jpg?w=400")).toBe(
      "https://daopk.me/_worker/photos/2026/sunset.jpg?w=400",
    );
  });

  it("leaves unrelated routes alone", () => {
    expect(photosProxyTargetUrl("/blog/index.json")).toBeNull();
    expect(photosProxyTargetUrl("/photos/index.json")).toBeNull();
    expect(photosProxyTargetUrl("/_worker/photoshop/index.json")).toBeNull();
    expect(photosProxyTargetUrl("http://[::1")).toBeNull();
  });
});
