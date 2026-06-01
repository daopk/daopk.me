import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import { crossOriginIsolationHeaders } from "./vite/crossOriginIsolation";
import { appsContentPreviewServer } from "./vite/plugins/appsContentPreviewServer";
import { blogContentDevServer } from "./vite/plugins/blogContentDevServer";
import { externalRuntimeImportMap } from "./vite/plugins/externalRuntimeImportMap";
import { filesContentProxyServer } from "./vite/plugins/filesContentProxyServer";
import { photosContentProxyServer } from "./vite/plugins/photosContentProxyServer";
import { pwaPlugin } from "./vite/pwa";
import { runtimeChunkInput, runtimeResolveAlias } from "./vite/runtimeEntries";

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
      // Derived from EXTERNAL_RUNTIME_ENTRIES so input/alias/import-map agree.
      ...runtimeResolveAlias(),
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
      // Emit Vue and the host runtime façades as dedicated, hashed library
      // entries alongside the HTML app. `preserveEntrySignatures: "strict"`
      // keeps their full, real-named export surface so externally-loaded app
      // modules can import Vue + the injection keys by their real names via the
      // import map (the host's own imports may use mangled names — same chunk,
      // same instance). The import-map plugin locates each chunk by name.
      preserveEntrySignatures: "strict",
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        ...runtimeChunkInput(),
      },
    },
  },
  plugins: [
    blogContentDevServer(),
    filesContentProxyServer(),
    photosContentProxyServer(),
    appsContentPreviewServer(),
    externalRuntimeImportMap(),
    vue(),
    pwaPlugin(),
  ],
});
