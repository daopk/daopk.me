import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin, type UserConfig } from "vite";

/**
 * Shared Vite preset for first-party app packages (`apps/<id>`). Each app builds
 * to a single ES module that `export default`s its root component (plus optional
 * named widget exports). The host runtime surface is marked `external` so the
 * running app reuses the host's single instances — one Vue, one set of injection
 * keys, one design system — resolved at runtime via the import map in
 * `index.html`. See `src/runtime/README.md`.
 *
 * This is NOT a workspace package (no package.json on purpose): the CI matrix
 * (`scripts/detect-changed-apps.mjs`) and pnpm only treat `apps/<id>` dirs that
 * have a package.json as apps, so `_shared` is ignored by both. App configs
 * import it by relative path (`../_shared/viteApp`).
 */

/** Bare specifiers resolved to the host at runtime via the import map. */
const HOST_RUNTIME_EXTERNALS = [
  "vue",
  "@daopk/sdk",
  "@daopk/kit",
  "@daopk/ui",
  "@daopk/icons",
  "@daopk/files",
  "@daopk/markdown",
  "@daopk/content",
];

/**
 * Fold the emitted scoped-style CSS into the ES entry chunk so a dynamically
 * `import()`-ed app injects its own styles on load (a bare `<script type=module>`
 * import never fetches a sibling .css automatically). Kit/ui styles + design
 * tokens already ship with the host; this only carries the app's own
 * `<style scoped>` output.
 */
function injectCssOnLoad(appId: string): Plugin {
  return {
    name: "daopk-inject-css-on-load",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      let css = "";
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "asset" && fileName.endsWith(".css")) {
          css += typeof output.source === "string" ? output.source : output.source.toString();
          delete bundle[fileName];
        }
      }
      if (css.trim().length === 0) {
        return;
      }

      const injector =
        `(function(){try{if(typeof document==="undefined")return;` +
        `var id="daopk-app-style:${appId}";if(document.getElementById(id))return;` +
        `var el=document.createElement("style");el.id=id;` +
        `el.textContent=${JSON.stringify(css)};document.head.appendChild(el);}catch(e){}})();\n`;

      for (const output of Object.values(bundle)) {
        if (output.type === "chunk" && output.isEntry) {
          output.code = injector + output.code;
          break;
        }
      }
    },
  };
}

/** Optional per-app overrides for apps that need more than the defaults. */
export interface DaopkAppOptions {
  /** Extra Vite plugins appended after vue() + the CSS injector. */
  readonly plugins?: Plugin[];
  /** Extra bare specifiers to mark external (rare; most app deps bundle in). */
  readonly externals?: readonly string[];
}

const WORKSPACE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Build config for a first-party app package. `id` is the published app id; the
 * lib build emits `<id>.js` (the entry contract the per-app CI uploads to R2).
 */
export function defineDaopkApp(id: string, options: DaopkAppOptions = {}): UserConfig {
  return defineConfig({
    envDir: WORKSPACE_ROOT,
    plugins: [vue(), injectCssOnLoad(id), ...(options.plugins ?? [])],
    build: {
      target: "es2022",
      cssCodeSplit: false,
      // Copy each app's `public/` (its `icon.svg` lives there) into `dist/` so
      // the publish workflow uploads it alongside the entry module and the host
      // can serve it at the app's release-pinned URL.
      copyPublicDir: true,
      lib: {
        entry: "src/main.ts",
        formats: ["es"],
        fileName: () => `${id}.js`,
      },
      rollupOptions: {
        external: [...HOST_RUNTIME_EXTERNALS, ...(options.externals ?? [])],
      },
    },
  }) as UserConfig;
}
