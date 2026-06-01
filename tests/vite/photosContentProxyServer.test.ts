import { describe, expect, it } from "vitest";

import { photosProxyTargetUrl } from "../../vite/plugins/photosContentProxyServer";

describe("photosProxyTargetUrl", () => {
  it("maps photo content requests to the production origin", () => {
    expect(photosProxyTargetUrl("/photos/index.json")).toBe("https://daopk.me/photos/index.json");
    expect(photosProxyTargetUrl("/photos/2026/sunset.jpg?w=400")).toBe(
      "https://daopk.me/photos/2026/sunset.jpg?w=400",
    );
  });

  it("leaves unrelated routes alone", () => {
    expect(photosProxyTargetUrl("/blog/index.json")).toBeNull();
    expect(photosProxyTargetUrl("/photoshop/index.json")).toBeNull();
    expect(photosProxyTargetUrl("http://[::1")).toBeNull();
  });
});
