import type { FirstPartyCatalogEntry } from "./types";

/**
 * Dev-only catalog data. The app packages own the manifest JSON; the host
 * imports it only in dev so HMR can register apps without fetching R2.
 *
 * Manifests and versions are auto-discovered from each `apps/<id>/` workspace
 * package, so adding a first-party app needs no edit here — only an entry in
 * `FIRST_PARTY_APP_ID_LIST` ([registry.ts](registry.ts)), which gates what the
 * shell actually registers.
 */
const manifestModules = import.meta.glob<unknown>("../../../../apps/*/app.manifest.json", {
  eager: true,
  import: "default",
});
const packageModules = import.meta.glob<{ version?: string }>("../../../../apps/*/package.json", {
  eager: true,
  import: "default",
});

function appIdFromPath(path: string, file: "app.manifest.json" | "package.json"): string | null {
  return new RegExp(`/apps/([^/]+)/${file.replace(".", "\\.")}$`).exec(path)?.[1] ?? null;
}

const versionById = new Map<string, string>();
for (const [path, pkg] of Object.entries(packageModules)) {
  const id = appIdFromPath(path, "package.json");
  if (id !== null) {
    versionById.set(id, pkg.version ?? "0.0.0");
  }
}

function devEntry(id: string, version: string, manifest: unknown): FirstPartyCatalogEntry {
  return {
    id,
    version,
    build: 0,
    entry: `/apps/${id}/${version}+0/${id}.js`,
    manifest: manifest as FirstPartyCatalogEntry["manifest"],
  };
}

export const FIRST_PARTY_DEV_CATALOG_ENTRIES: readonly FirstPartyCatalogEntry[] = Object.entries(
  manifestModules,
).flatMap(([path, manifest]) => {
  const id = appIdFromPath(path, "app.manifest.json");
  if (id === null) {
    return [];
  }
  return [devEntry(id, versionById.get(id) ?? "0.0.0", manifest)];
});
