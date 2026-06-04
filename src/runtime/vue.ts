/**
 * Stable re-export façade for Vue, emitted as the `daopk-vue-runtime` build
 * entry. The import map in index.html points the bare `vue` specifier at this
 * entry's hashed chunk so published first-party app modules resolve
 * `import "vue"` to the exact Vue module instance the host bundles (one shared
 * instance — required for cross-boundary reactivity, `provide`/`inject`, and
 * `useKernel`).
 *
 * Two build settings keep this working:
 *  - it is a build *entry* (vite.config.ts `rollupOptions.input`), and
 *  - `preserveEntrySignatures: "strict"` keeps its full, real-named export
 *    surface (published first-party apps import Vue names the host never
 *    references statically, which tree-shaking / export mangling would
 *    otherwise drop).
 */
export * from "vue";
