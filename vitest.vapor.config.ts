/// <reference types="vitest" />
import { defineProject, mergeConfig } from "vitest/config";

import { createViteConfig } from "./vite.config";
import { vueEsmRuntimeAliases } from "./vite/vueEsmRuntimeAliases";

// Vue 3.6 beta exposes Vapor only from its ESM/browser build. Keep Vapor tests
// in one ESM module graph instead of changing the Node/CJS runtime used by the
// repository's existing Vue Test Utils suite.
export default mergeConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createViteConfig("serve") as any,
  defineProject({
    resolve: {
      alias: vueEsmRuntimeAliases(),
    },
    test: {
      name: "vapor",
      globals: false,
      environment: "happy-dom",
      server: {
        deps: {
          inline: ["ropav"],
        },
      },
      include: [
        "src/**/*.vapor.test.ts",
        "tests/**/*.vapor.test.ts",
        "apps/*/src/**/*.vapor.test.ts",
      ],
      pool: "vmThreads",
      // Run after the much larger VDOM project so coverage does not multiply
      // worker pressure and make timing-sensitive DOM tests flaky.
      sequence: { groupOrder: 1 },
    },
  }),
);
