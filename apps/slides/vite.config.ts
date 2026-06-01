import { defineDaopkApp } from "../_shared/viteApp";

// Slides is desktop-only and the heaviest first-party app. `@webcontainer/api`
// is an app-only dependency that is bundled (not externalized) — it is a small
// client that boots the actual WASM container from webcontainer-api.io at
// runtime, and it is dynamically `import()`-ed in `useSlidevRuntime.ts`, so it
// lands in its own lazy chunk fetched only when a deck is previewed. The
// `runtime-pnpm-lock.yaml?raw` import is inlined as a string by Vite. The
// WebContainer runtime requires `crossOriginIsolated` + SharedArrayBuffer,
// which the host document already provides via its COOP/COEP headers (the app
// module runs in that same isolated document).
export default defineDaopkApp("slides");
