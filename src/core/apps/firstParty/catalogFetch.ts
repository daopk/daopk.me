/**
 * Fetch the published first-party catalog from the public API and hand it to
 * the strict coercion layer. Network failures are swallowed into an empty
 * catalog (boot path) or a structured error (App Store update checks); a bad
 * response can never throw into the boot sequence.
 */

import { debugWarn } from "~/core/debug";
import { publicApiUrl } from "~/core/publicApi";

import { coerceFirstPartyCatalog } from "./catalogCoerce";
import type { FirstPartyCatalog } from "./types";

/** Catalog of published first-party apps, served by the public API from R2. */
const FIRST_PARTY_CATALOG_URL = publicApiUrl("/public/apps/index.json");

const DEFAULT_TIMEOUT_MS = 4000;

export type FirstPartyCatalogFetchResult =
  | { ok: true; catalog: FirstPartyCatalog }
  | { ok: false; error: string };

function timeoutSignal(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (signal === undefined) {
    return timeout;
  }
  // `AbortSignal.any` is widely available; fall back to the caller's signal.
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal;
}

/**
 * Fetch + validate the catalog. Never throws: on any failure (offline first
 * load, 404, malformed JSON) it returns an empty catalog so boot continues and
 * the affected apps simply do not register this session.
 */
export async function fetchFirstPartyCatalog(
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<FirstPartyCatalog> {
  const result = await fetchFirstPartyCatalogForUpdate(options);
  if (!result.ok) {
    debugWarn("[first-party]", "catalog fetch error", result.error);
    return { apps: [] };
  }
  return result.catalog;
}

/**
 * Fetch + validate the catalog for user-triggered update checks. Unlike the
 * boot helper, this keeps the failure reason so App Store can surface it.
 */
export async function fetchFirstPartyCatalogForUpdate(
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<FirstPartyCatalogFetchResult> {
  try {
    const response = await fetch(FIRST_PARTY_CATALOG_URL, {
      signal: timeoutSignal(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Could not check for updates (${response.status}).`,
      };
    }
    return { ok: true, catalog: coerceFirstPartyCatalog(await response.json()) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
