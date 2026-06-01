import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { defineConfig, type Connect, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

/**
 * In production the Worker serves `/blog/*` from R2. Vite has neither, so this
 * plugin serves the same paths from the local `blog/` folder during `dev` and
 * `preview`, keeping the app's same-origin fetches working offline of R2.
 */
interface DevBlogPost {
  slug: string;
  metadata: { title: string | null; date: string | null; description: string | null };
}

function blogContentDevServer(): PluginOption {
  const postsDir = fileURLToPath(new URL("./blog", import.meta.url));
  const blogLibUrl = new URL("./scripts/lib/blogPosts.mjs", import.meta.url).href;
  const postFilePattern = /^\/blog\/([a-z0-9-]+)\.md$/;

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0];

    if (pathname === "/blog/index.json") {
      void (async () => {
        try {
          const { readBlogPosts, comparePostsNewestFirst } = await import(blogLibUrl);
          const posts = (await readBlogPosts(postsDir)).sort(
            comparePostsNewestFirst,
          ) as DevBlogPost[];
          const index = posts.map((post) => ({
            slug: post.slug,
            title: post.metadata.title,
            date: post.metadata.date,
            description: post.metadata.description,
          }));
          res.setHeader("Content-Type", "application/json;charset=utf-8");
          res.end(JSON.stringify(index));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      })();
      return;
    }

    const match = postFilePattern.exec(pathname);
    if (match !== null) {
      void (async () => {
        try {
          const markdown = await readFile(join(postsDir, `${match[1]}.md`), "utf8");
          res.setHeader("Content-Type", "text/markdown;charset=utf-8");
          res.end(markdown);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      })();
      return;
    }

    next();
  };

  return {
    name: "blog-content-dev-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * The host's shared runtime surface is emitted as dedicated build entries; the
 * build-only `externalRuntimeImportMap` plugin maps each bare specifier to its
 * hashed chunk via an import map in index.html. This makes the host and every
 * externally-loaded app share ONE copy of Vue, the SDK, the kit/ui component
 * layers, and the icon set (one Vue instance + one set of injection keys + one
 * design system). See src/runtime/{vue,sdk,kit,ui,icons}.ts + README.
 *
 * `specifier` is what apps import (and mark `external`); `chunkName` is the
 * Rollup entry name; `entry` is the façade module re-exporting the real surface.
 */
const EXTERNAL_RUNTIME_ENTRIES = [
  { specifier: "vue", chunkName: "daopk-vue-runtime", entry: "./src/runtime/vue.ts" },
  { specifier: "@daopk/sdk", chunkName: "daopk-sdk-runtime", entry: "./src/runtime/sdk.ts" },
  { specifier: "@daopk/kit", chunkName: "daopk-kit-runtime", entry: "./src/runtime/kit.ts" },
  { specifier: "@daopk/ui", chunkName: "daopk-ui-runtime", entry: "./src/runtime/ui.ts" },
  { specifier: "@daopk/icons", chunkName: "daopk-icons-runtime", entry: "./src/runtime/icons.ts" },
] as const;

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
function externalRuntimeImportMap(): PluginOption {
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
            console.warn(`[daopk] external runtime import map skipped: ${specifier} chunk not found`);
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

export default defineConfig({
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  resolve: {
    alias: {
      // The shared runtime specifiers resolve to the host's façade modules in
      // dev/preview/test (one instance). In a standalone app's own build these
      // are marked `external` and resolved at runtime via the import map.
      "@daopk/sdk": fileURLToPath(new URL("./src/runtime/sdk.ts", import.meta.url)),
      "@daopk/kit": fileURLToPath(new URL("./src/runtime/kit.ts", import.meta.url)),
      "@daopk/ui": fileURLToPath(new URL("./src/runtime/ui.ts", import.meta.url)),
      "@daopk/icons": fileURLToPath(new URL("./src/runtime/icons.ts", import.meta.url)),
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      // Emit Vue and the host SDK as dedicated, hashed library entries
      // alongside the HTML app. `preserveEntrySignatures: "strict"` keeps their
      // full, real-named export surface so externally-loaded app modules can
      // import Vue + the injection keys by their real names via the import map
      // (the host's own imports may use mangled names — same chunk, same
      // instance). The import-map plugin locates both chunks by name.
      preserveEntrySignatures: "strict",
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        ...Object.fromEntries(
          EXTERNAL_RUNTIME_ENTRIES.map(({ chunkName, entry }) => [
            chunkName,
            fileURLToPath(new URL(entry, import.meta.url)),
          ]),
        ),
      },
    },
  },
  plugins: [
    blogContentDevServer(),
    externalRuntimeImportMap(),
    vue(),
    VitePWA({
      devOptions: {
        enabled: false,
      },
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        id: "/",
        name: "WebOS",
        short_name: "WebOS",
        description: "A browser-based operating system workspace.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f7f3fa",
        theme_color: "#5a2d82",
        icons: [
          {
            src: "/icons/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      pwaAssets: {
        disabled: true,
      },
      registerType: "prompt",
      strategies: "generateSW",
      workbox: {
        cacheId: "daopk-me",
        cleanupOutdatedCaches: true,
        globPatterns: ["index.html", "favicon.ico", "assets/**/*.{js,css}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif|svg|ico)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "daopk-me-images-v1",
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
});
