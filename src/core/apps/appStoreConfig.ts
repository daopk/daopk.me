/**
 * Where the App Store pulls its catalog from at runtime.
 *
 * The registry is a single JSON index listing installable external apps. It is
 * served same-origin by default (like the blog content) so it inherits the
 * COOP/COEP `credentialless` posture without extra CORS setup; the per-app
 * `manifestUrl` it points at may live on any HTTPS origin that sends CORS
 * headers. Point {@link APP_STORE_REGISTRY_URL} elsewhere to use a hosted
 * catalog later.
 */
export const APP_STORE_REGISTRY_URL = "/app-store/index.json";

/** One entry in the App Store registry index. */
export interface AppStoreListing {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Optional preview icon shown in the catalog (decorative). */
  iconUrl?: string;
  /** HTTPS URL of the external app manifest passed to `installExternalApp`. */
  manifestUrl: string;
}

/** Shape of the registry index document. */
export interface AppStoreRegistry {
  apps: AppStoreListing[];
}

/**
 * Narrow an unknown fetch payload into an {@link AppStoreRegistry}. Skips
 * malformed entries instead of throwing so one bad listing can't break the
 * whole catalog. `manifestUrl` is required (it's what gets installed); icon and
 * description are optional and only kept when they are strings.
 */
export function coerceAppStoreRegistry(input: unknown): AppStoreRegistry {
  if (typeof input !== "object" || input === null || !("apps" in input)) {
    return { apps: [] };
  }
  const rawApps = (input as { apps: unknown }).apps;
  if (!Array.isArray(rawApps)) {
    return { apps: [] };
  }

  const apps: AppStoreListing[] = [];
  for (const raw of rawApps) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.manifestUrl !== "string"
    ) {
      continue;
    }
    const listing: AppStoreListing = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      manifestUrl: entry.manifestUrl,
    };
    if (typeof entry.description === "string") {
      listing.description = entry.description;
    }
    if (typeof entry.iconUrl === "string") {
      listing.iconUrl = entry.iconUrl;
    }
    apps.push(listing);
  }
  return { apps };
}
