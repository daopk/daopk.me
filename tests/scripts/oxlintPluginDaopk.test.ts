import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "../../scripts/oxlint-plugin-daopk.js";

const rule = plugin.rules["no-private-host-imports"];

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.setDefaultConfig({
  languageOptions: {
    sourceType: "module",
    parserOptions: {
      lang: "ts",
    },
  },
});

new RuleTester().run("daopk/no-private-host-imports", rule, {
  valid: [
    {
      code: 'import { AppFrame } from "@daopk/kit";',
      filename: "apps/movies/src/App.ts",
    },
    {
      code: 'import type { ShellId } from "~/types/shell";',
      filename: "apps/movies/src/composables/useMovieTrailerPreview.ts",
    },
    {
      code: 'export type { ShellId } from "~/types/shell";',
      filename: "apps/movies/src/composables/useMovieTrailerPreview.ts",
    },
  ],
  invalid: [
    {
      code: 'import { useActiveShell } from "~/composables/useActiveShell";',
      filename: "apps/movies/src/composables/useMoviesThemeSuggestion.ts",
      errors: [{ messageId: "privateHostImport" }],
    },
    {
      code: 'export { useActiveShell } from "~/composables/useActiveShell";',
      filename: "apps/movies/src/composables/index.ts",
      errors: [{ messageId: "privateHostImport" }],
    },
    {
      code: 'export * from "~/runtime/sdk";',
      filename: "apps/movies/src/composables/index.ts",
      errors: [{ messageId: "privateHostImport" }],
    },
    {
      code: 'async function loadHostRuntime() { return import("~/runtime/sdk"); }',
      filename: "apps/movies/src/composables/useMoviesThemeSuggestion.ts",
      errors: [{ messageId: "privateHostImport" }],
    },
  ],
});
