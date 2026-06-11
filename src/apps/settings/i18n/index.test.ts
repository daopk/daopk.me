import { describe, expect, it } from "vitest";

import { registeredTranslationNamespaces, translate } from "~/core/i18n";

import { settingsTranslations } from "./index";

describe("Settings i18n", () => {
  it("registers Settings-owned JSON dictionaries", () => {
    expect(registeredTranslationNamespaces()).toContain("app:settings");
    expect(settingsTranslations.en["settings.nav.language"]).toBe("Language");
    expect(settingsTranslations.vi["settings.nav.language"]).toBe("Ngôn ngữ");
    expect(translate("en", "settings.nav.language")).toBe("Language");
    expect(translate("vi", "settings.nav.language")).toBe("Ngôn ngữ");
  });
});
