import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import type { SettingsSectionId } from "~/types/settings";
import { mountVaporTest } from "~/test/mountVapor";

import {
  SETTINGS_MENU_ICON_ASSETS,
  SettingsAccountIcon,
  SettingsAboutDeviceIcon,
  SettingsAppearanceIcon,
  SettingsBackgroundIcon,
  SettingsComfortIcon,
  SettingsDockIcon,
  SettingsLanguageIcon,
  SettingsPrivacyIcon,
} from "./settingsMenuIcons";

const components = {
  appearance: SettingsAppearanceIcon,
  language: SettingsLanguageIcon,
  background: SettingsBackgroundIcon,
  comfort: SettingsComfortIcon,
  dock: SettingsDockIcon,
  account: SettingsAccountIcon,
  privacy: SettingsPrivacyIcon,
  about: SettingsAboutDeviceIcon,
} as const satisfies Record<SettingsSectionId, Component>;

describe("Settings menu bitmap icons", () => {
  it("provides one raster asset for every Settings section", () => {
    expect(Object.keys(SETTINGS_MENU_ICON_ASSETS)).toEqual([
      "appearance",
      "language",
      "background",
      "comfort",
      "dock",
      "account",
      "privacy",
      "about",
    ]);
  });

  it("renders each asset through the image icon component", () => {
    for (const section of Object.keys(components) as SettingsSectionId[]) {
      const wrapper = mountVaporTest(components[section]);

      expect(wrapper.element.tagName).toBe("IMG");
      expect(wrapper.attributes("src")).toBe(SETTINGS_MENU_ICON_ASSETS[section]);
      expect(wrapper.attributes("width")).toBe("24");
      expect(wrapper.attributes("height")).toBe("24");
      expect(wrapper.attributes("alt")).toBe("");

      wrapper.unmount();
    }
  });
});
