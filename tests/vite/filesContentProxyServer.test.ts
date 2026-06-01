import { describe, expect, it } from "vitest";

import { filesProxyTargetUrl } from "../../vite/plugins/filesContentProxyServer";

describe("filesProxyTargetUrl", () => {
  it("maps file content requests to the production origin", () => {
    expect(filesProxyTargetUrl("/_worker/files/index.json")).toBe(
      "https://daopk.me/_worker/files/index.json",
    );
    expect(filesProxyTargetUrl("/_worker/files/raw/docs/spec.pdf")).toBe(
      "https://daopk.me/_worker/files/raw/docs/spec.pdf",
    );
  });

  it("leaves unrelated routes alone", () => {
    expect(filesProxyTargetUrl("/_worker/photos/index.json")).toBeNull();
    expect(filesProxyTargetUrl("/files/index.json")).toBeNull();
    expect(filesProxyTargetUrl("/_worker/filesystem/index.json")).toBeNull();
    expect(filesProxyTargetUrl("http://[::1")).toBeNull();
  });
});
