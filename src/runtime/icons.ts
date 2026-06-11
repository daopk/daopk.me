/**
 * Stable re-export façade for the shared lucide icon set, emitted as the
 * `daopk-icons-runtime` build entry. The import map in index.html points the
 * bare `@daopk/icons` specifier at this entry's hashed chunk so first-party
 * apps reuse the host's already-bundled per-icon components instead of
 * shipping their own icon copies.
 *
 * App identity manifests carry serializable fluent-color icon keys. The host
 * resolves those keys internally; this runtime surface stays focused on in-app
 * lucide glyphs shared by independently-published app modules.
 *
 * See `src/runtime/kit.ts` for the build-entry / `preserveEntrySignatures`
 * rationale.
 */
export * from "~/icons/lucide";
