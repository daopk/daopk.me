// Merge per-app catalog-entry fragments into the first-party app catalog.
//
// The catalog (`/apps/index.json`, served from R2) maps every published app id
// to its current immutable, version-pinned module URL. A publish only rebuilds
// the apps that changed, so we MUST preserve the entries of the apps that did
// not: read the current catalog, upsert the changed entries, write it back.
//
// Usage: node scripts/update-apps-catalog.mjs <currentCatalog> <entriesDir> <outFile>
//   currentCatalog  existing catalog JSON (missing/empty => start fresh)
//   entriesDir      dir of `{ id, version, entry }` fragments (recursed)
//   outFile         merged catalog destination
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CATALOG_SCHEMA_VERSION = 1;

function readJson(path, fallback) {
  try {
    if (path === undefined || path === "-" || !existsSync(path)) {
      return fallback;
    }
    const text = readFileSync(path, "utf8").trim();
    return text.length === 0 ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
}

function collectEntryFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectEntryFiles(full));
    } else if (entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function isValidEntry(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.version === "string" &&
    typeof value.entry === "string"
  );
}

const [, , currentPath, entriesDir, outPath] = process.argv;
if (outPath === undefined) {
  console.error(
    "Usage: node scripts/update-apps-catalog.mjs <currentCatalog> <entriesDir> <outFile>",
  );
  process.exit(1);
}

const current = readJson(currentPath, { version: CATALOG_SCHEMA_VERSION, apps: [] });
const byId = new Map();
for (const app of Array.isArray(current.apps) ? current.apps : []) {
  if (isValidEntry(app)) {
    byId.set(app.id, { id: app.id, version: app.version, entry: app.entry });
  }
}

let upserted = 0;
for (const file of collectEntryFiles(entriesDir)) {
  const entry = readJson(file, null);
  if (isValidEntry(entry)) {
    byId.set(entry.id, { id: entry.id, version: entry.version, entry: entry.entry });
    upserted += 1;
  }
}

const merged = {
  version: CATALOG_SCHEMA_VERSION,
  apps: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);

console.log(`Upserted ${upserted} entry(ies); catalog now lists ${merged.apps.length} app(s).`);
