import type { Component } from "vue";

type ComponentLoader = () => Promise<{ default: Component }>;

/**
 * Dev-only loaders: in `pnpm dev` there is no catalog/R2, so first-party apps
 * load straight from their workspace packages (full HMR, normal source maps).
 * This module is imported ONLY behind an `import.meta.env.DEV` gate
 * (registerFirstPartyApps.ts), so the workspace app packages are tree-shaken
 * out of the production shell bundle — matching the `_kit-gallery` dev pattern
 * in `src/main.ts`.
 */
export const FIRST_PARTY_DEV_ENTRIES: Record<string, ComponentLoader> = {
  notes: () => import("@daopk-app/notes") as Promise<{ default: Component }>,
};
