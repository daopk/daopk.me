/// <reference types="vitest" />
import { defineConfig, mergeConfig } from "vitest/config";

import { createViteConfig } from "./vite.config";
import { vueEsmRuntimeAliases } from "./vite/vueEsmRuntimeAliases";

// Vue 3.6 beta exposes Vapor only from its ESM/browser build. Keep Vapor tests
// in one ESM module graph instead of changing the Node/CJS runtime used by the
// repository's existing Vue Test Utils suite.
export default mergeConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createViteConfig("serve") as any,
  defineConfig({
    resolve: {
      alias: vueEsmRuntimeAliases(),
    },
    test: {
      environment: "happy-dom",
      include: [
        "src/icons/createIcon.vapor.test.ts",
        "apps/calendar/src/widgets/LunarDateWidget.test.ts",
        "apps/clock/src/widgets/ClockWidgets.test.ts",
        "apps/notes/src/NotesDesktopLayer.test.ts",
        "apps/pdf-viewer/src/components/PdfFilePreview.test.ts",
      ],
      pool: "vmThreads",
    },
  }),
);
