import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { Connect, PluginOption } from "vite";

/**
 * In production the Worker serves the first-party app catalog (`/apps/index.json`)
 * and version-pinned modules (`/apps/<id>/<version>/<file>`) from R2. Vite has
 * neither, so this plugin serves the catalog from the repo's `apps/index.json`
 * and modules from each app's local `apps/<id>/dist/` build. This makes the
 * production load path (catalog fetch → versioned `import()`) testable under
 * `npm run preview` without a deploy.
 *
 * PREVIEW-ONLY: in `dev` the first-party loader imports each app straight from
 * its workspace package (HMR), so Vite already serves the real source at
 * `/apps/<id>/src/...`. Registering this middleware in dev would shadow those
 * source paths (e.g. `/apps/notes/src/main.ts`) and 404 them, so it is not.
 */
export function appsContentPreviewServer(): PluginOption {
  const appsRoot = fileURLToPath(new URL("../../apps", import.meta.url));
  const catalogPath = join(appsRoot, "index.json");
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
          res.setHeader("Content-Type", "application/json;charset=utf-8");
          res.end(await readFile(catalogPath, "utf8"));
        } catch {
          res.statusCode = 404;
          res.end("Not found");
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
          // Local dev/preview ignores the version segment — there is only one
          // built copy per app at apps/<id>/dist/. R2 serves the real
          // version-pinned URLs in production.
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
