import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { Connect, PluginOption } from "vite";

const CATALOG_SCHEMA_VERSION = 1;
const PREVIEW_BUILD = 0;

export interface FirstPartyPreviewCatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly build: number;
  readonly entry: string;
  readonly manifest: unknown;
}

export interface FirstPartyPreviewCatalog {
  readonly version: typeof CATALOG_SCHEMA_VERSION;
  readonly apps: readonly FirstPartyPreviewCatalogEntry[];
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function buildFirstPartyPreviewCatalog(
  appsRoot: string,
): Promise<FirstPartyPreviewCatalog> {
  const dirs = await readdir(appsRoot, { withFileTypes: true });
  const apps: FirstPartyPreviewCatalogEntry[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) {
      continue;
    }

    let rawPackageJson: string;
    let rawManifestJson: string;
    try {
      [rawPackageJson, rawManifestJson] = await Promise.all([
        readFile(join(appsRoot, dir.name, "package.json"), "utf8"),
        readFile(join(appsRoot, dir.name, "app.manifest.json"), "utf8"),
      ]);
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      throw error;
    }

    const packageJson = JSON.parse(rawPackageJson) as { version?: unknown };
    const manifest = JSON.parse(rawManifestJson) as { id?: unknown };
    if (
      typeof packageJson.version !== "string" ||
      packageJson.version.length === 0 ||
      manifest.id !== dir.name
    ) {
      continue;
    }

    const release = `${packageJson.version}+${PREVIEW_BUILD}`;
    apps.push({
      id: dir.name,
      version: packageJson.version,
      build: PREVIEW_BUILD,
      entry: `/apps/${dir.name}/${release}/${dir.name}.js`,
      manifest,
    });
  }

  apps.sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: CATALOG_SCHEMA_VERSION,
    apps,
  };
}

/**
 * In production the Worker serves the first-party app catalog (`/apps/index.json`)
 * and release-pinned modules (`/apps/<id>/<version+build>/<file>`) from R2. Vite has
 * neither, so this plugin synthesizes the catalog from each app package.json
 * and serves modules from each app's local `apps/<id>/dist/` build. This makes
 * the production load path (catalog fetch → versioned `import()`) testable
 * under `npm run preview` without a deploy or committed catalog artifact.
 *
 * PREVIEW-ONLY: in `dev` the first-party loader imports each app straight from
 * its workspace package (HMR), so Vite already serves the real source at
 * `/apps/<id>/src/...`. Registering this middleware in dev would shadow those
 * source paths (e.g. `/apps/notes/src/main.ts`) and 404 them, so it is not.
 */
export function appsContentPreviewServer(): PluginOption {
  const appsRoot = fileURLToPath(new URL("../../apps", import.meta.url));
  const modulePattern = /^\/apps\/([a-z0-9][a-z0-9-]*)\/[^/]+\/(.+)$/;

  const contentTypeFor = (file: string): string => {
    if (file.endsWith(".css")) return "text/css;charset=utf-8";
    if (file.endsWith(".map")) return "application/json;charset=utf-8";
    return "text/javascript;charset=utf-8";
  };

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0];

    if (pathname === "/apps/index.json") {
      void (async () => {
        try {
          const catalog = await buildFirstPartyPreviewCatalog(appsRoot);
          res.setHeader("Content-Type", "application/json;charset=utf-8");
          res.end(`${JSON.stringify(catalog, null, 2)}\n`);
        } catch {
          res.statusCode = 500;
          res.end("Could not build app catalog");
        }
      })();
      return;
    }

    const match = modulePattern.exec(pathname);
    if (match !== null) {
      const [, id, file] = match;
      if (file.includes("..")) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }
      void (async () => {
        try {
          // Local dev/preview ignores the release segment — there is only one
          // built copy per app at apps/<id>/dist/. R2 serves the real
          // release-pinned URLs in production.
          const bytes = await readFile(join(appsRoot, id, "dist", file));
          res.setHeader("Content-Type", contentTypeFor(file));
          res.end(bytes);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      })();
      return;
    }

    next();
  };

  return {
    name: "daopk-apps-content-preview-server",
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
