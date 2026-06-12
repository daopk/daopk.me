import { describe, expect, it } from "vitest";

import { assetUrlForBase } from "../../vite/plugins/externalRuntimeImportMap";
import { restoreSameOriginRootHtmlAssets } from "../../vite/plugins/sameOriginRootHtmlAssets";
import { resolveBuildTime, resolvePublicAssetBase } from "../../vite/publicAssetBase";

describe("public asset base", () => {
  it("uses the CDN base only for production builds", () => {
    expect(
      resolvePublicAssetBase("serve", {
        DAOPK_PUBLIC_ASSET_BASE_URL: "https://cdn.daopk.me/",
      }),
    ).toBe("/");
    expect(resolvePublicAssetBase("build", {})).toBe("/");
    expect(
      resolvePublicAssetBase("build", {
        DAOPK_PUBLIC_ASSET_BASE_URL: "https://cdn.daopk.me",
      }),
    ).toBe("https://cdn.daopk.me/");
  });

  it("keeps import-map asset URLs aligned with Vite base", () => {
    expect(assetUrlForBase("assets/runtime.js", "/")).toBe("/assets/runtime.js");
    expect(assetUrlForBase("assets/runtime.js", "/shell/")).toBe("/shell/assets/runtime.js");
    expect(assetUrlForBase("assets/runtime.js", "https://cdn.daopk.me/")).toBe(
      "https://cdn.daopk.me/assets/runtime.js",
    );
  });

  it("restores root PWA and icon URLs to same-origin after CDN base rewrites", () => {
    const html = [
      '<link rel="icon" href="https://cdn.daopk.me/icons/favicon-32x32.png">',
      '<link rel="manifest" href="https://cdn.daopk.me/manifest.webmanifest">',
      '<script type="module" src="https://cdn.daopk.me/assets/index.js"></script>',
    ].join("");

    expect(restoreSameOriginRootHtmlAssets(html, "https://cdn.daopk.me/")).toBe(
      [
        '<link rel="icon" href="/icons/favicon-32x32.png">',
        '<link rel="manifest" href="/manifest.webmanifest">',
        '<script type="module" src="https://cdn.daopk.me/assets/index.js"></script>',
      ].join(""),
    );
  });

  it("prefers an explicit deterministic build time", () => {
    expect(
      resolveBuildTime(
        { DAOPK_BUILD_TIME: "2026-06-12T00:00:00.000Z" },
        () => new Date("2020-01-01T00:00:00.000Z"),
      ),
    ).toBe("2026-06-12T00:00:00.000Z");
  });
});
