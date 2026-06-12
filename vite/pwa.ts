import type { PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The shell PWA: a `generateSW` service worker that precaches the shell bundle
 * only. First-party app modules live OUTSIDE the precache (they ship from R2,
 * not `dist/`), so republishing an app never changes the shell's precache
 * manifest; `runtimeCaching` gives launched apps offline support instead.
 */
export function pwaPlugin(): PluginOption {
  return VitePWA({
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
      orientation: "portrait",
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
      // vite-plugin-pwa defaults this to /^assets\// because Vite emits hashed
      // asset names. Keep Workbox revisions anyway so update installs use
      // cache: "reload" and refresh immutable responses that may have old
      // security headers in browser caches.
      dontCacheBustURLsMatching: undefined,
      globPatterns: ["index.html", "favicon.ico", "assets/**/*.{js,css}"],
      navigateFallback: "index.html",
      // First-party app modules live OUTSIDE the precache (they ship from R2,
      // not dist/), which is the whole point: republishing an app never
      // changes the shell's precache manifest. These two rules give launched
      // apps offline support without coupling them to a shell update.
      navigateFallbackDenylist: [/^\/apps\//, /^\/_api(?:\/|$)/],
      runtimeCaching: [
        {
          // Catalog: revalidate so a republished app is picked up next boot,
          // but keep working offline from cache.
          urlPattern: /\/apps\/index\.json$/,
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "daopk-me-app-catalog-v1",
            cacheableResponse: { statuses: [200] },
            expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
          },
        },
        {
          // Release-pinned app modules are immutable → CacheFirst (offline launch).
          urlPattern: /\/apps\/[^/]+\/[^/]+\/.+$/,
          handler: "CacheFirst",
          options: {
            cacheName: "daopk-me-apps-v1",
            cacheableResponse: { statuses: [200] },
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
        {
          urlPattern: ({ url }) =>
            !url.pathname.startsWith("/_api/") &&
            /\.(?:png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname),
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
  });
}
