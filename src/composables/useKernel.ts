// `useKernel` is defined once in the SDK module so the host and external apps
// resolve the same kernel injection key. Re-exported here to preserve the
// existing `~/composables/useKernel` import path used across the app.
export { useKernel } from "~/runtime/sdk";
