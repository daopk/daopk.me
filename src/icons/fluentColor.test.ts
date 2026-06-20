import { describe, expect, it } from "vitest";

import {
  AppStoreAppIcon,
  FallbackAppIcon,
  FinderAppIcon,
  FLUENT_COLOR_ICON_NAMES,
  SettingsAppIcon,
  TerminalAppIcon,
  type FluentColorIconName,
} from "./fluentColor";
import { fluentColorIconData } from "./generated/fluentColor";

describe("Fluent Color icon subset", () => {
  it("contains data for every mapped icon name", () => {
    for (const name of FLUENT_COLOR_ICON_NAMES) {
      const icon = fluentColorIconData[name as FluentColorIconName];

      expect(icon).toBeDefined();
      expect(icon.body).toContain("<");
    }
  });

  it("exports renderable Vue components for built-in identity icons", () => {
    for (const component of [
      FinderAppIcon,
      SettingsAppIcon,
      TerminalAppIcon,
      AppStoreAppIcon,
      FallbackAppIcon,
    ]) {
      expect(component).toBeTruthy();
    }
  });
});
