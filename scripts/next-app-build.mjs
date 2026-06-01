#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

import { nextAppBuild } from "./lib/appBuildNumbers.mjs";

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

const [, , catalogPath, appId] = process.argv;
if (catalogPath === undefined || appId === undefined || appId.length === 0) {
  console.error("Usage: node scripts/next-app-build.mjs <currentCatalog> <appId>");
  process.exit(1);
}

process.stdout.write(String(nextAppBuild(readJson(catalogPath, { apps: [] }), appId)));
