/**
 * Build entry for the Photos app. Published as a single ES module that
 * `export default`s the root component, loaded by the host at runtime from a
 * versioned URL (see the host's first-party app loader). Vue and the `@daopk/*`
 * runtime surface are marked `external` (vite.config.ts) and resolve to the
 * host via the import map, so this module shares the host's single Vue
 * instance, injection keys, and design system. `focus-trap-vue` is bundled in.
 */
export { default } from "./App.vue";
