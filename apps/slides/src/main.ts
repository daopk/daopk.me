/**
 * Build entry for the Slides app. Published as a single ES module that
 * `export default`s the root component, loaded by the host at runtime from a
 * versioned URL (see the host's first-party app loader). Vue and the `@daopk/*`
 * runtime surface are marked `external` (vite.config.ts) and resolve to the
 * host via the import map; `@webcontainer/api` is bundled (app-only) and
 * dynamically imported on demand.
 */
export { default } from "./App.vue";
