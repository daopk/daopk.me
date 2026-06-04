/**
 * Stable re-export façade for the kit component layer, emitted as the
 * `daopk-kit-runtime` build entry. The import map in index.html points the
 * bare `@daopk/kit` specifier at this entry's hashed chunk so first-party apps
 * loaded from versioned URLs reuse the host's ONE copy of the design-system
 * kit (one Vue instance, one set of scoped-style + token bindings) instead of
 * bundling a second copy.
 *
 * Mirrors `src/runtime/vue.ts` / `src/runtime/sdk.ts`: it is a build *entry*
 * (vite.config.ts `rollupOptions.input`) and `preserveEntrySignatures: "strict"`
 * keeps its full, real-named export surface so published first-party app
 * modules can import kit names the host never references statically.
 */
export * from "~/components/kit";
