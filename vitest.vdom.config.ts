/// <reference types="vitest" />
import { fileURLToPath } from "node:url";

import { defineProject, mergeConfig } from "vitest/config";

import { createViteConfig } from "./vite.config";
import { vueEsmRuntimeAliases } from "./vite/vueEsmRuntimeAliases";

// Merge with `vite.config.ts` so plugins (vue), aliases, and other shared
// build options live in one place. This project only owns VDOM test settings.
export default mergeConfig(
  // Type cast bridges the Vite 7 (vitest's peer) vs Vite 8 (installed)
  // declarative Plugin shape mismatch; runtime behavior is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createViteConfig("serve") as any,
  defineProject({
    resolve: {
      alias: [
        {
          find: /^@vue\/test-utils$/,
          replacement: fileURLToPath(
            new URL(
              "./node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs",
              import.meta.url,
            ),
          ),
        },
        ...vueEsmRuntimeAliases(true),
      ],
    },
    test: {
      name: "vdom",
      globals: false,
      environment: "happy-dom",
      // Installs the profile-session fallback and the production Vapor
      // interop plugin for VDOM consumers of Vapor children.
      setupFiles: ["./src/test/vitest.setup.ts", "./src/test/vitest.vdom.setup.ts"],
      pool: "vmThreads",
      sequence: { groupOrder: 0 },
      server: {
        deps: {
          // Mixed VDOM/Vapor tests must resolve Vue-bearing dependencies in
          // the same ESM runtime as the application and Vue Test Utils.
          inline: true,
        },
      },
      include: ["src/**/*.test.ts", "tests/**/*.test.ts", "apps/*/src/**/*.test.ts"],
      exclude: ["**/*.vapor.test.ts"],
    },
  }),
);
