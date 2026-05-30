import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  worker: {
    format: "es",
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
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
