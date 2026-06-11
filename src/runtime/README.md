# Host runtime SDK (`@daopk/sdk`)

This folder exposes the shared runtime that independently-published first-party
apps reuse. App packages under `apps/<id>` own serializable app metadata in
`app.manifest.json` and ship Vue modules; the shell owns the first-party id
allowlist, schema validation, icon-key resolution, and platform policy.

Sharing one runtime instance keeps `provide` / `inject`, reactivity, and
`useKernel()` working across the host/app boundary. Two Vue copies, or two
copies of an injection-key symbol, silently break injection.

## How sharing works

- `injectionKeys.ts` is the single symbol definition site for
  `KernelInjectionKey`, `AppContextInjectionKey`, and `AppChromeInjectionKey`.
  `sdk.ts` exposes those keys plus `useKernel` and `useVfs` as the public
  `@daopk/sdk` facade.
- At build time Vite emits dedicated runtime chunks such as
  `daopk-vue-runtime-*.js`, `daopk-sdk-runtime-*.js`, and
  `daopk-kit-runtime-*.js`.
- The build-only `externalRuntimeImportMap` plugin injects an import map into
  `index.html` so bare imports like `vue`, `@daopk/sdk`, and `@daopk/kit`
  resolve to those host chunks.
- First-party catalog entries include the app manifest and point to same-origin,
  release-pinned modules under `/apps/<id>/<version+build>/...`. When a module
  imports the shared surfaces, it gets the same instances the shell already
  uses.

## First-Party App Packages

Each package in `apps/<id>` owns an `app.manifest.json`, builds a single ES
module, and marks shared runtime surfaces as Rollup externals:

```json
{
  "id": "notes",
  "name": "Notes",
  "icon": "NotesAppIcon",
  "category": "productivity",
  "permissions": ["vfs.read", "vfs.write"]
}
```

```ts
// apps/<id>/vite.config.ts
import { defineDaopkApp } from "../_shared/viteApp";

export default defineDaopkApp("<id>");
```

The shared helper configures the app package for Vue and externalizes host
runtime specifiers. App entries export the app component as default:

```ts
// apps/<id>/src/main.ts
export { default } from "./App.vue";
```

Inside the app, import runtime helpers from the public facades:

```ts
import { useKernel, useVfs } from "@daopk/sdk";
import { AppFrame } from "@daopk/kit";
```

## Dev vs Preview/Prod

In development, the shell loads workspace packages directly through
`firstPartyAppsPhase`, so HMR stays simple and no import map is needed.

In preview and production, the shell fetches `/apps/index.json`, validates each
same-origin catalog entry and manifest, resolves serializable icon/matcher keys,
and loads the published module only when the user launches the app or mounts one
of its widgets. The import map is injected only during `vite build`, so runtime
composition should be verified with `pnpm build` plus `pnpm preview`.

## Verification Checklist

1. Run `pnpm build` then `pnpm preview`.
2. View source on `/` and confirm the injected import map points `vue`,
   `@daopk/sdk`, `@daopk/kit`, and related facades at hashed `/assets/*`
   runtime chunks.
3. Launch a first-party app from the App Store or shell and confirm the module
   loads from its `/apps/<id>/...` catalog URL.
4. In DevTools Network, confirm one shared Vue runtime chunk is used by both the
   shell and launched app.
5. Confirm `useKernel()`, `useVfs()`, and injected `AppContext` work inside the
   launched app.
