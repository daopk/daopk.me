import { describe, expect, it } from "vitest";

import {
  AppStoreAppIcon,
  FallbackAppIcon,
  FinderAppIcon,
  FLUENT_COLOR_ICON_NAMES,
  SettingsAppIcon,
  TerminalAppIcon,
} from "./fluentColor";

describe("Fluent Color icon subset", () => {
  it("keeps the configured collection subset unique", () => {
    expect(new Set(FLUENT_COLOR_ICON_NAMES).size).toBe(FLUENT_COLOR_ICON_NAMES.length);
  });

  it("exports renderable Vue components for built-in identity icons", () => {
    for (const component of [
      FinderAppIcon,
      SettingsAppIcon,
      TerminalAppIcon,
      AppStoreAppIcon,
      FallbackAppIcon,
    ]) {
      expect(component).toMatchObject({ __vapor: true });
    }
  });
});
