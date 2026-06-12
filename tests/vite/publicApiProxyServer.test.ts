import { describe, expect, it } from "vitest";

import { publicApiProxyTargetUrl } from "../../vite/plugins/publicApiProxyServer";

describe("publicApiProxyTargetUrl", () => {
  it("maps _api requests to the production origin", () => {
    expect(publicApiProxyTargetUrl("/_api/public/apps/index.json")).toBe(
      "https://daopk.me/_api/public/apps/index.json",
    );
    expect(publicApiProxyTargetUrl("/_api/public/photos/ocean.png?w=400")).toBe(
      "https://daopk.me/_api/public/photos/ocean.png?w=400",
    );
  });

  it("leaves unrelated routes alone", () => {
    expect(publicApiProxyTargetUrl("/public/apps/index.json")).toBeNull();
    expect(publicApiProxyTargetUrl("/api/public/apps/index.json")).toBeNull();
    expect(publicApiProxyTargetUrl("http://[::1")).toBeNull();
  });
});
