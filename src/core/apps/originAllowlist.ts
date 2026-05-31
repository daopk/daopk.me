/**
 * Optional origin allowlist for external (installed) apps.
 *
 * Trusted-ESM external apps execute arbitrary code with full access to the
 * workspace, so the strongest deployment-level control is restricting WHICH
 * origins may run. When this list is EMPTY (the default), any HTTPS origin is
 * allowed and the active controls are the HTTPS/reserved-id gates plus the
 * install-consent dialog. Populate it (or point it at a future user-facing
 * setting) to hard-limit installs to a set of trusted origins.
 *
 * The check applies to the app's ENTRY module origin — the code that actually
 * runs — not the manifest URL (inert JSON, already CORS-gated). Origins are
 * compared by exact {@link URL.origin} (scheme + host + port).
 */
export const EXTERNAL_APP_ORIGIN_ALLOWLIST: readonly string[] = [];

/**
 * True when `origin` may run an external app. An empty allowlist allows every
 * origin (the default posture); a non-empty allowlist permits only exact
 * `URL.origin` matches.
 */
export function isExternalOriginAllowed(
  origin: string,
  allowlist: readonly string[] = EXTERNAL_APP_ORIGIN_ALLOWLIST,
): boolean {
  return allowlist.length === 0 || allowlist.includes(origin);
}
