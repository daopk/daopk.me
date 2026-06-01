# Host runtime SDK (`@daopk/sdk`)

This folder exposes the **shared runtime** that external (installed) apps reuse,
so a third-party app runs inside the host with the host's **single** Vue
instance and the host's kernel injection keys. Sharing one instance is what
makes `provide` / `inject`, reactivity, and `useKernel()` work across the
host ↔ external-app boundary. Two Vue copies (or two copies of an injection-key
symbol) silently break `inject()`.

## How sharing works

- `sdk.ts` is the **single definition site** for `KernelInjectionKey`,
  `AppContextInjectionKey`, `AppChromeInjectionKey`, and `useKernel`. The host
  imports these (directly or via the `~/types/*` re-exports); they are bundled
  only here.
- At build time Vite emits two dedicated, hashed entry chunks:
  - `daopk-vue-runtime-*.js` — a re-export façade for `vue` (`vue.ts`).
  - `daopk-sdk-runtime-*.js` — this SDK (`sdk.ts`).
    `preserveEntrySignatures: "strict"` keeps their **real** export names.
- A build-only Vite plugin (`externalRuntimeImportMap` in `vite.config.ts`)
  injects an [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap)
  into `index.html`:

  ```html
  <script type="importmap">
    {
      "imports": {
        "vue": "/assets/daopk-vue-runtime-<hash>.js",
        "@daopk/sdk": "/assets/daopk-sdk-runtime-<hash>.js"
      }
    }
  </script>
  ```

  Both façade chunks re-export from the host's one Vue core chunk, so an
  external app's `import "vue"` and the host's own `import "vue"` resolve to the
  **same** module instance.

## Authoring an external app

An external app is a single ES module served over **HTTPS** that
`export default`s a Vue component. Build it with Vue and the SDK marked
**external** so they resolve to the host at runtime via the import map:

```ts
// vite.config.ts (external app)
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: "src/main.ts", formats: ["es"], fileName: "app" },
    rollupOptions: { external: ["vue", "@daopk/sdk"] },
  },
});
```

```ts
// src/main.ts (external app entry)
import { defineComponent, h, ref } from "vue";
import { useKernel } from "@daopk/sdk";

export default defineComponent({
  name: "HelloExternalApp",
  setup() {
    const kernel = useKernel(); // the host kernel — same instance as built-ins
    const count = ref(0);
    return () => h("button", { onClick: () => (count.value += 1) }, `clicked ${count.value}`);
  },
});
```

### Hosting requirements

- **HTTPS** entry URL (enforced by the installer).
- **CORS**: the host page runs under COEP `credentialless`, so cross-origin
  module scripts must send permissive CORS headers
  (`Access-Control-Allow-Origin`).
- Prefer **immutable / versioned** entry URLs. Dynamic `import()` cannot use
  Subresource Integrity, so a stable, content-addressed URL is the integrity
  story.

## Dev vs. preview/prod

The import map is injected **only at build time**. Under `npm run dev` there is
no import map, so external apps are testable under `npm run preview` (or a real
deploy), not the dev server. The host app itself works normally in dev.

## Install security model

Trusted-ESM external apps run arbitrary code with full access to the workspace.
There is no sandbox; the controls are layered admission checks, not isolation:

- **HTTPS-only** manifest URL and entry module (`installExternalApp` + the
  validator). The manifest is fetched with `credentials: "omit"`.
- **Reserved ids**: ids in `BUILTIN_APP_IDS` (and any `_`-prefixed id) are
  rejected so an install can never shadow a built-in / first-party app. The
  live registry (`kernel.apps.list()`) is also checked at install time.
- **Manifest validation** (`externalManifest.ts`): category/permission
  whitelists, window clamping, unknown fields stripped, no `autorun`.
- **Install consent**: an informational dialog shows identity, entry origin, and
  requested permissions. It does **not** pre-grant anything — runtime permission
  prompts still gate every capability the first time it is used.
- **Optional origin allowlist** (`originAllowlist.ts`): leave
  `EXTERNAL_APP_ORIGIN_ALLOWLIST` empty to allow any HTTPS origin (default), or
  populate it to restrict the app **entry** origin to a trusted set. A future
  user-facing setting can override it per device.

## Update / upgrade flow

Installing a manifest whose `id` matches an already-installed external app is an
**upsert**: the store record is replaced and the app is unregistered then
re-registered so the new loader closure / metadata take effect. The App Store
reflects this — an installed app at a different catalog `version` shows
**Update**, the same version shows **Reinstall**. Authors ship an update by
publishing a new immutable entry URL and bumping `version` in the manifest.

## Production CORS + import-map checklist

Typecheck/lint cannot catch import-map or CORS regressions; verify against a
built `preview`/deploy:

1. `npm run build` then `npm run preview`.
2. View source on `/` — confirm the injected `<script type="importmap">` maps
   `vue` and `@daopk/sdk` to the real hashed `/assets/*` chunks, with matching
   `<link rel="modulepreload">` tags.
3. Install a real external app from the App Store and launch it.
4. In DevTools → Network, confirm **one** `daopk-vue-runtime-*.js` request is
   shared by host and app (no second Vue copy from the app's origin).
5. Confirm the app's cross-origin entry responds with
   `Access-Control-Allow-Origin` (COEP `credentialless` requires it).
6. Confirm `useKernel()` / injected `AppContext` work inside the app (they break
   silently if a second Vue or injection-key symbol leaked in).
