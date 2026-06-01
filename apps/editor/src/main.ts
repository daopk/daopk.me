/**
 * Build entry for the Editor app. Published as a single ES module that
 * `export default`s the root component, loaded by the host at runtime from a
 * versioned URL. Vue and the `@daopk/*` runtime surface (including
 * `@daopk/markdown` for the preview renderer) are external (apps/_shared/viteApp.ts)
 * and resolve to the host via the import map, so this module shares the host's
 * single Vue instance, injection keys, design system, and markdown pipeline.
 */
export { default } from "./App.vue";
