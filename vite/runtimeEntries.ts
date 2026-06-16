import { fileURLToPath, URL } from "node:url";

/**
 * The host's shared runtime surface is emitted as dedicated build entries; the
 * build-only `externalRuntimeImportMap` plugin maps each bare specifier to its
 * hashed chunk via an import map in index.html. This makes the host and every
 * independently-published first-party app share ONE copy of Vue, the SDK, the
 * kit/ui component layers, and the icon set (one Vue instance + one set of
 * injection keys + one design system). See src/runtime/{vue,sdk,kit,ui,icons}.ts
 * + README.
 *
 * `specifier` is what apps import (and mark `external`); `chunkName` is the
 * Rollup entry name; `entry` is the façade module (path relative to the repo
 * root) re-exporting the real surface.
 *
 * Single source of truth: the import-map plugin, the build `rollupOptions.input`,
 * and the dev/preview/test `resolve.alias` are all derived from this list (via
 * the helpers below) so they can never drift out of sync.
 */
export const EXTERNAL_RUNTIME_ENTRIES = [
  { specifier: "vue", chunkName: "daopk-vue-runtime", entry: "src/runtime/vue.ts" },
  { specifier: "@daopk/sdk", chunkName: "daopk-sdk-runtime", entry: "src/runtime/sdk.ts" },
  { specifier: "@daopk/kit", chunkName: "daopk-kit-runtime", entry: "src/runtime/kit.ts" },
  { specifier: "@daopk/ui", chunkName: "daopk-ui-runtime", entry: "src/runtime/ui.ts" },
  { specifier: "@daopk/icons", chunkName: "daopk-icons-runtime", entry: "src/runtime/icons.ts" },
  { specifier: "@daopk/files", chunkName: "daopk-files-runtime", entry: "src/runtime/files.ts" },
  {
    specifier: "@daopk/markdown",
    chunkName: "daopk-markdown-runtime",
    entry: "src/runtime/markdown.ts",
  },
  {
    specifier: "@daopk/content",
    chunkName: "daopk-content-runtime",
    entry: "src/runtime/content.ts",
  },
] as const;

// Repo root resolved from this file's location (`vite/` -> repo root).
const repoRoot = new URL("../", import.meta.url);

const entryPath = (entry: string): string => fileURLToPath(new URL(entry, repoRoot));

/** Build `rollupOptions.input` map: chunk name -> absolute façade path. */
export function runtimeChunkInput(): Record<string, string> {
  return Object.fromEntries(
    EXTERNAL_RUNTIME_ENTRIES.map(({ chunkName, entry }) => [chunkName, entryPath(entry)]),
  );
}

/**
 * Dev/preview/test `resolve.alias` for the `@daopk/*` specifiers — each resolves
 * to its façade module so there is one instance. `vue` is intentionally absent:
 * it resolves to the real package and is only emitted as a shared chunk for the
 * build-time import map.
 */
export function runtimeResolveAlias(): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const { specifier, entry } of EXTERNAL_RUNTIME_ENTRIES) {
    if (specifier.startsWith("@daopk/")) {
      alias[specifier] = entryPath(entry);
    }
  }
  return alias;
}
