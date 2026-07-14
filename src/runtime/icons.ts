/**
 * Stable re-export façade for the shared lucide icon set, emitted as the
 * `daopk-icons-runtime` build entry. The import map in index.html points the
 * bare `@daopk/icons` specifier at this entry's hashed chunk so first-party
 * apps reuse the host's already-bundled per-icon components instead of
 * shipping their own icon copies.
 *
 * App identity is not shipped through this surface: built-in apps import their
 * generated image glyphs directly, while first-party apps declare a flat icon
 * filename (e.g. `icon.png`) that the host resolves to a release-pinned image
 * at registration. This runtime surface stays focused on in-app lucide glyphs
 * shared by independently-published app modules.
 *
 * See `src/runtime/kit.ts` for the build-entry / `preserveEntrySignatures`
 * rationale.
 */
export * from "~/icons/lucide";
