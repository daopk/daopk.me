// `useVfs` is defined once in the SDK module so the host and externally-loaded
// first-party apps resolve the same kernel + AppContext injection keys.
// Re-exported here to preserve the existing `~/composables/useVfs` import path
// used across the host app.
export { useVfs } from "~/runtime/sdk";
