import { debugWarn } from "~/core/debug";
import { publicApiOrigin, publicApiUrl } from "~/core/publicApi";

import type { FirstPartyCatalog, FirstPartyCatalogEntry } from "./types";

/** Catalog of published first-party apps, served by the public API from R2. */
const FIRST_PARTY_CATALOG_URL = publicApiUrl("/public/apps/index.json");

const DEFAULT_TIMEOUT_MS = 4000;

export type FirstPartyCatalogFetchResult =
  | { ok: true; catalog: FirstPartyCatalog }
  | { ok: false; error: string };

/**
 * Entries must be release-pinned module paths from the configured public API
 * origin. First-party apps run in the trusted lane, so the catalog must never
 * point that lane at an arbitrary cross-origin URL.
 */
const ENTRY_PATH_PATTERN =
  /^\/public\/apps\/[a-z0-9][a-z0-9-]*\/[0-9A-Za-z.+-]+\/[A-Za-z0-9._/-]+\.js$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceBuild(value: unknown): number | null {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function coerceEntry(input: unknown): FirstPartyCatalogEntry | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, version, build: rawBuild, revision, entry } = input;
  if (typeof id !== "string" || typeof version !== "string" || typeof entry !== "string") {
    return null;
  }
  const build = coerceBuild(rawBuild);
  if (build === null) {
    debugWarn("[first-party]", `rejecting catalog entry for "${id}": bad build`, rawBuild);
    return null;
  }
  if (!isTrustedEntryUrl(entry, id)) {
    debugWarn("[first-party]", `rejecting catalog entry for "${id}": bad entry URL`, entry);
    return null;
  }
  return {
    id,
    version,
    build,
    ...(typeof revision === "string" && revision.length > 0 ? { revision } : {}),
    entry,
  };
}

function isTrustedEntryUrl(entry: string, id: string): boolean {
  const configuredOrigin = publicApiOrigin();
  const pathname = entry.startsWith("/") ? entry : absoluteEntryPathname(entry, configuredOrigin);
  if (pathname === null) {
    return false;
  }

  return ENTRY_PATH_PATTERN.test(pathname) && pathname.startsWith(`/public/apps/${id}/`);
}

function absoluteEntryPathname(entry: string, configuredOrigin: string): string | null {
  if (configuredOrigin.length === 0) {
    return null;
  }

  try {
    const url = new URL(entry);
    return url.origin === configuredOrigin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** Validate + normalize an untrusted-shaped catalog document; drop bad entries. */
export function coerceFirstPartyCatalog(input: unknown): FirstPartyCatalog {
  if (!isRecord(input) || !Array.isArray(input.apps)) {
    return { apps: [] };
  }
  const seen = new Set<string>();
  const apps: FirstPartyCatalogEntry[] = [];
  for (const raw of input.apps) {
    const entry = coerceEntry(raw);
    if (entry === null || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    apps.push(entry);
  }
  return { apps };
}

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
