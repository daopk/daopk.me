import type { RuleTester } from "oxlint/plugins-dev";

type OxlintRule = Parameters<RuleTester["run"]>[1];

declare const plugin: {
  readonly rules: {
    readonly "no-private-host-imports": OxlintRule;
  };
};

export default plugin;
