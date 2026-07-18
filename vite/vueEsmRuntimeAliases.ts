import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const requireFromVue = createRequire(
  realpathSync(fileURLToPath(new URL("../node_modules/vue/package.json", import.meta.url))),
);

function vueEsmRuntime(packageName: string, fileName: string): string {
  const packageJson = requireFromVue.resolve(`${packageName}/package.json`);
  return resolve(dirname(packageJson), "dist", fileName);
}

/**
 * Vue 3.6 exposes Vapor only from its ESM/browser module graph. Resolve
 * every Vue package to that graph so tests never mix runtime identities.
 */
export function vueEsmRuntimeAliases() {
  return [
    {
      find: /^vue$/,
      replacement: fileURLToPath(
        new URL("../node_modules/vue/dist/vue.runtime.esm-bundler.js", import.meta.url),
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
  ];
}
