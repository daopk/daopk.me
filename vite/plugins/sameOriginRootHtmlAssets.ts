import type { PluginOption } from "vite";

import { assetUrlForBase } from "../publicAssetBase";

const SAME_ORIGIN_ROOT_PATHS = [
  "manifest.webmanifest",
  "icons/android-chrome-192x192.png",
  "icons/android-chrome-512x512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-16x16.png",
  "icons/favicon-32x32.png",
  "icons/favicon.ico",
];

export function sameOriginRootHtmlAssets(): PluginOption {
  let resolvedBase = "/";

  return {
    name: "daopk-same-origin-root-html-assets",
    apply: "build",
    configResolved(config) {
      resolvedBase = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return restoreSameOriginRootHtmlAssets(html, resolvedBase);
      },
    },
    generateBundle(_options, bundle) {
      const indexHtml = bundle["index.html"];
      if (indexHtml?.type !== "asset") {
        return;
      }
      const source =
        typeof indexHtml.source === "string"
          ? indexHtml.source
          : new TextDecoder().decode(indexHtml.source);
      indexHtml.source = restoreSameOriginRootHtmlAssets(source, resolvedBase);
    },
  };
}

export function restoreSameOriginRootHtmlAssets(html: string, base: string): string {
  let restored = html;
  for (const path of SAME_ORIGIN_ROOT_PATHS) {
    restored = restored.split(assetUrlForBase(path, base)).join(`/${path}`);
  }
  return restored;
}
