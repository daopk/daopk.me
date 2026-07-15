/**
 * Stable re-export façade for the ui component layer, emitted as the
 * `daopk-ui-runtime` build entry. The import map in index.html points the bare
 * `@daopk/ui` specifier at this entry's hashed chunk so first-party apps reuse
 * the host's ONE copy of the behaviorally-complex primitives (Button, Dialog,
 * ContextMenu, ...). The facade remains stable while the implementation is a
 * Vapor-native hybrid of Ropav adapters and local DOM layers.
 *
 * See `src/runtime/kit.ts` for the build-entry / `preserveEntrySignatures`
 * rationale.
 */
export * from "~/components/ui";
