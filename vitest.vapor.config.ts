/// <reference types="vitest" />
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { defineConfig, mergeConfig } from "vitest/config";

import { createViteConfig } from "./vite.config";

const requireFromVue = createRequire(
  realpathSync(fileURLToPath(new URL("./node_modules/vue/package.json", import.meta.url))),
);

function vueEsmRuntime(packageName: string, fileName: string): string {
  const packageJson = requireFromVue.resolve(`${packageName}/package.json`);
  return resolve(dirname(packageJson), "dist", fileName);
}

// Vue 3.6 beta exposes Vapor only from its ESM/browser build. Keep Vapor tests
// in one ESM module graph instead of changing the Node/CJS runtime used by the
// repository's existing Vue Test Utils suite.
export default mergeConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createViteConfig("serve") as any,
  defineConfig({
    test: {
      alias: [
        {
          find: /^vue$/,
          replacement: fileURLToPath(
            new URL("./node_modules/vue/dist/vue.runtime.esm-bundler.js", import.meta.url),
          ),
        },
        {
          find: /^@vue\/reactivity$/,
          replacement: vueEsmRuntime("@vue/reactivity", "reactivity.esm-bundler.js"),
        },
        {
          find: /^@vue\/runtime-core$/,
          replacement: vueEsmRuntime("@vue/runtime-core", "runtime-core.esm-bundler.js"),
        },
        {
          find: /^@vue\/runtime-dom$/,
          replacement: vueEsmRuntime("@vue/runtime-dom", "runtime-dom.esm-bundler.js"),
        },
        {
          find: /^@vue\/runtime-vapor$/,
          replacement: vueEsmRuntime("@vue/runtime-vapor", "runtime-vapor.esm-bundler.js"),
        },
        {
          find: /^@vue\/shared$/,
          replacement: vueEsmRuntime("@vue/shared", "shared.esm-bundler.js"),
        },
      ],
      environment: "happy-dom",
      include: [
        "apps/calendar/src/widgets/LunarDateWidget.test.ts",
        "apps/clock/src/widgets/ClockWidgets.test.ts",
        "apps/notes/src/NotesDesktopLayer.test.ts",
        "apps/pdf-viewer/src/components/PdfFilePreview.test.ts",
      ],
      pool: "vmThreads",
    },
  }),
);
