import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

/**
 * The shared runtime surface the host exposes via the import map in index.html.
 * Marking these `external` keeps Vue, the SDK, and the kit/ui/icon layers OUT
 * of the app bundle so the running app reuses the host's single instances
 * (one Vue, one set of injection keys, one design system). See
 * `src/runtime/README.md` in the host.
 */
const HOST_RUNTIME_EXTERNALS = ["vue", "@daopk/sdk", "@daopk/kit", "@daopk/ui", "@daopk/icons"];

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

export default defineConfig({
  plugins: [vue(), injectCssOnLoad("notes")],
  build: {
    target: "es2022",
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "notes.js",
    },
    rollupOptions: {
      external: HOST_RUNTIME_EXTERNALS,
    },
  },
});
