import type { PluginOption } from "vite";

import { EXTERNAL_RUNTIME_ENTRIES } from "../runtimeEntries";

type RuntimeBundle = Record<string, { type: string; name?: string }>;

function findChunkFileByName(bundle: RuntimeBundle, chunkName: string): string | undefined {
  for (const [fileName, output] of Object.entries(bundle)) {
    if (
      output.type === "chunk" &&
      (output.name === chunkName || fileName.startsWith(`assets/${chunkName}-`))
    ) {
      return fileName;
    }
  }
  return undefined;
}

/**
 * Build-only: after chunks are emitted, inject an import map (+ modulepreloads)
 * into index.html so externally-loaded app modules resolve `import "vue"` and
 * `import "@daopk/sdk"` to the host's hashed runtime chunks. The map is only
 * injected at build time, so external apps are testable under `npm run preview`
 * (not `npm run dev`) — documented in src/runtime/README.md.
 */
export function externalRuntimeImportMap(): PluginOption {
  return {
    name: "daopk-external-runtime-importmap",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle as RuntimeBundle | undefined;
        if (!bundle) {
          return html;
        }

        const imports: Record<string, string> = {};
        const preloads: string[] = [];
        for (const { specifier, chunkName } of EXTERNAL_RUNTIME_ENTRIES) {
          const file = findChunkFileByName(bundle, chunkName);
          if (!file) {
            console.warn(
              `[daopk] external runtime import map skipped: ${specifier} chunk not found`,
            );
            return html;
          }
          imports[specifier] = `/${file}`;
          preloads.push(`/${file}`);
        }

        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: { type: "importmap" },
              children: JSON.stringify({ imports }),
              injectTo: "head-prepend",
            },
            ...preloads.map((href) => ({
              tag: "link",
              attrs: { rel: "modulepreload", crossorigin: true, href },
              injectTo: "head" as const,
            })),
          ],
        };
      },
    },
  };
}
