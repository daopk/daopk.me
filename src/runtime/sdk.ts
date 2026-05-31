/**
 * Host SDK for external (installed) apps — the public `@daopk/sdk` surface.
 *
 * This module is the SINGLE definition site for the kernel injection keys and
 * `useKernel`. The host imports these symbols (directly or via the `~/types/*`
 * re-exports) and external apps import them at runtime via the import map the
 * host injects into `index.html`. Because both resolve to THIS one module, the
 * host and every external app share ONE set of injection-key symbols and ONE
 * Vue instance (the import map also maps the bare `vue` specifier to the
 * host's Vue chunk). Without that, `inject()` / `useKernel()` silently fail
 * across the boundary.
 *
 * External-app build preset (Vite/Rollup):
 *
 *   // vite.config.ts of the external app
 *   build: { rollupOptions: { external: ["vue", "@daopk/sdk"] } }
 *
 * The app entry module must `export default` a Vue component and import Vue
 * from `"vue"` (resolved to the host instance via the import map). Serve the
 * built module over HTTPS with permissive CORS — the host page runs under COEP
 * `credentialless`, so cross-origin module scripts must send CORS headers.
 *
 * See `src/runtime/README.md` for the full authoring guide.
 */
import { inject, type InjectionKey } from "vue";

import type { AppChromeController, AppContext } from "~/types/app";
import type { Kernel } from "~/types/kernel";

/** Provided at the app root in `main.ts`; resolved by `useKernel`. */
export const KernelInjectionKey: InjectionKey<Kernel> = Symbol("daopk.kernel");

/** Provided per window/frame by the shell's app mount. */
export const AppContextInjectionKey: InjectionKey<AppContext> = Symbol("AppContext");

/** Provided by shells that surface app chrome (e.g. the mobile AppView header). */
export const AppChromeInjectionKey: InjectionKey<AppChromeController> = Symbol("AppChrome");

/** Resolve the running kernel. Throws if called before the kernel is provided. */
export function useKernel(): Kernel {
  const injected = inject(KernelInjectionKey, undefined);

  if (!injected) {
    throw new Error(
      "useKernel(): KernelInjectionKey missing — bootstrapKernel must run before mount.",
    );
  }

  return injected;
}

export type {
  AppChromeBackAction,
  AppChromeController,
  AppContext,
  AppHandle,
  AppManifest,
  AppPermission,
} from "~/types/app";
export type { Kernel } from "~/types/kernel";
