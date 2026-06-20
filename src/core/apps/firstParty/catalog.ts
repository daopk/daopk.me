/**
 * Public façade for the first-party app catalog.
 *
 * The implementation is split across three focused modules so each concern can
 * be read and tested in isolation:
 *  - `trustedUrls`   — the trust boundary for module + asset URLs.
 *  - `catalogCoerce` — strict validation of the untrusted catalog document.
 *  - `catalogFetch`  — fetching the catalog from the public API.
 *
 * This module re-exports the stable surface those consumers depend on.
 */

export { isValidIconRef, resolveTrustedAppAssetUrl } from "./trustedUrls";
export { coerceFirstPartyCatalog } from "./catalogCoerce";
export {
  fetchFirstPartyCatalog,
  fetchFirstPartyCatalogForUpdate,
  type FirstPartyCatalogFetchResult,
} from "./catalogFetch";
