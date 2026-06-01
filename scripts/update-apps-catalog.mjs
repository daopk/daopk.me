// Merge per-app catalog-entry fragments into the first-party app catalog.
//
// The catalog (`/apps/index.json`, served from R2) maps every published app id
// to its current immutable, release-pinned module URL. A publish only rebuilds
// the apps that changed, so we MUST preserve the entries of the apps that did
// not: read the current catalog, upsert the changed entries, write it back.
//
// Usage: node scripts/update-apps-catalog.mjs <currentCatalog> <entriesDir> <outFile>
//   currentCatalog  existing catalog JSON (missing/empty => start fresh)
//   entriesDir      dir of `{ id, version, build, revision, entry }` fragments (recursed)
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

function coerceBuild(value) {
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

function coerceEntry(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    typeof value.version !== "string" ||
    typeof value.entry !== "string"
  ) {
    return null;
  }
  const build = coerceBuild(value.build);
  if (build === null) {
    return null;
  }
  return {
    id: value.id,
    version: value.version,
    build,
    ...(typeof value.revision === "string" && value.revision.length > 0
      ? { revision: value.revision }
      : {}),
    entry: value.entry,
  };
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
  const entry = coerceEntry(app);
  if (entry !== null) {
    byId.set(entry.id, entry);
  }
}

let upserted = 0;
for (const file of collectEntryFiles(entriesDir)) {
  const entry = readJson(file, null);
  const coerced = coerceEntry(entry);
  if (coerced !== null) {
    byId.set(coerced.id, coerced);
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
