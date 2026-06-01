/**
 * COOP/COEP headers that place the dev + preview servers in a cross-origin
 * isolated context. Mirrors the production Worker so SharedArrayBuffer-backed
 * features (e.g. the slides WebContainer runtime) behave the same locally.
 */
export const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};
