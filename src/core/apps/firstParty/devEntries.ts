import type { FirstPartyModuleLoader } from "./registerFirstPartyApps";

/**
 * Dev-only loaders: in `pnpm dev` there is no catalog/R2, so first-party apps
 * load code straight from their workspace packages (full HMR, normal source
 * maps), while `devManifests.ts` imports each app-owned manifest JSON. Each
 * loader returns the app's module namespace, so the host can resolve the default
 * export plus any named widget/preview exports named by the manifest.
 *
 * Loaders are auto-discovered from every `apps/<id>/src/main.ts` (the
 * `defineDaopkApp` entry convention), keyed by `<id>`. Adding a first-party app
 * therefore needs no edit here — only an entry in `FIRST_PARTY_APP_ID_LIST`
 * ([registry.ts](registry.ts)), which stays the deliberate trust allowlist.
 * `registerFirstPartyApps` only ever looks up ids on that allowlist, so any app
 * folder not on it is ignored.
 *
 * This module is imported ONLY behind an `import.meta.env.DEV` gate
 * (registerFirstPartyApps.ts), so the workspace app packages are tree-shaken
 * out of the production shell bundle — matching the `_kit-gallery` dev pattern
 * in `src/main.ts`.
 */
const entryModules = import.meta.glob<Record<string, unknown>>("../../../../apps/*/src/main.ts");

function appIdFromEntryPath(path: string): string | null {
  return /\/apps\/([^/]+)\/src\/main\.ts$/.exec(path)?.[1] ?? null;
}

export const FIRST_PARTY_DEV_ENTRIES: Record<string, FirstPartyModuleLoader> = Object.fromEntries(
  Object.entries(entryModules).flatMap(([path, load]) => {
    const id = appIdFromEntryPath(path);
    return id === null ? [] : [[id, load]];
  }),
);
