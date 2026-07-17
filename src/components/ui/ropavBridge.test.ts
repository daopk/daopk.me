import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface RopavStyleManifest {
  tokens: Array<{ name: string }>;
  componentVariables: Array<{ name: string }>;
}

const bridge = readFileSync(resolve(process.cwd(), "src/components/ui/ropavBridge.scss"), "utf8");
const manifest = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "node_modules/ropav/src/styles/styles-manifest.json"),
    "utf8",
  ),
) as RopavStyleManifest;
const publicVariables = new Set([
  ...manifest.tokens.map(({ name }) => name),
  ...manifest.componentVariables.map(({ name }) => name),
]);

describe("Ropav token bridge", () => {
  it("only overrides variables from Ropav's public style manifest", () => {
    const variables = Array.from(bridge.matchAll(/--rp-[\w-]+/g), ([name]) => name);

    expect(variables.length).toBeGreaterThan(0);
    expect(variables.filter((name) => !publicVariables.has(name))).toEqual([]);
  });

  it("does not target generated Ropav component selectors", () => {
    expect(bridge).not.toMatch(/(^|[,{])\s*\.rp-/m);
  });

  it("maps the WebOS foundation and semantic state roles", () => {
    for (const variable of [
      "--rp-font-family",
      "--rp-spacing-4",
      "--rp-radius-md",
      "--rp-size-control-md",
      "--rp-color-default",
      "--rp-color-control-border-focus",
      "--rp-primary-color-filled",
      "--rp-color-green-filled",
      "--rp-color-red-filled",
      "--rp-color-yellow-filled",
    ]) {
      expect(bridge).toContain(`${variable}:`);
    }
  });
});
