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
