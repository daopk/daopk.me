import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_MODE,
  isLocaleMode,
  isSupportedLocale,
  normalizeLocaleTag,
  preferredLocaleFromLanguages,
  registerAppTranslations,
  registeredTranslationNamespaces,
  translate,
} from "./index";

describe("i18n", () => {
  it("defaults to English locale metadata", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(DEFAULT_LOCALE_MODE).toBe("auto");
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("vi")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isLocaleMode("auto")).toBe(true);
    expect(isLocaleMode("manual")).toBe(true);
    expect(isLocaleMode("browser")).toBe(false);
  });

  it("maps browser language tags to the first supported locale", () => {
    expect(normalizeLocaleTag("vi-VN")).toBe("vi");
    expect(normalizeLocaleTag("en_US")).toBe("en");
    expect(normalizeLocaleTag("fr-FR")).toBeNull();
    expect(preferredLocaleFromLanguages(["fr-FR", "vi-VN", "en-US"])).toBe("vi");
    expect(preferredLocaleFromLanguages(["fr-FR"])).toBe("en");
  });

  it("translates known keys by locale", () => {
    expect(translate("en", "i18n.locale.en.label")).toBe("English");
    expect(translate("vi", "i18n.locale.en.label")).toBe("Tiếng Anh");
  });

  it("registers app-owned bundles with English fallback and interpolation", () => {
    const dispose = registerAppTranslations("demo", {
      en: {
        "demo.greeting": "Hello {name}",
        "demo.fallback": "Fallback only",
      },
      vi: {
        "demo.greeting": "Xin chào {name}",
      },
    });

    expect(registeredTranslationNamespaces()).toContain("app:demo");
    expect(translate("vi", "demo.greeting", { name: "Linh" })).toBe("Xin chào Linh");
    expect(translate("vi", "demo.fallback")).toBe("Fallback only");
    expect(translate("en", "demo.greeting", { name: "Alpha" })).toBe("Hello Alpha");

    dispose();
    expect(translate("en", "demo.greeting", { name: "Alpha" })).toBe("demo.greeting");
  });

  it("leaves missing params and unknown keys intact", () => {
    const dispose = registerAppTranslations("missing-param-demo", {
      en: {
        "missing.template": "Hello {name}",
      },
    });

    expect(translate("en", "missing.template")).toBe("Hello {name}");
    expect(translate("en", "missing.key")).toBe("missing.key");

    dispose();
  });

  it("replaces bundles by namespace and restores previous bundles on dispose", () => {
    const disposeFirst = registerAppTranslations("replace-demo", {
      en: { "replace.value": "First" },
    });
    const disposeSecond = registerAppTranslations("replace-demo", {
      en: { "replace.value": "Second" },
    });

    expect(translate("en", "replace.value")).toBe("Second");

    disposeSecond();
    expect(translate("en", "replace.value")).toBe("First");

    disposeFirst();
    expect(translate("en", "replace.value")).toBe("replace.value");
  });

  it("rejects empty app ids", () => {
    expect(() =>
      registerAppTranslations("", {
        en: { "empty.value": "Empty" },
      }),
    ).toThrow("appId is required");
  });

  it("filters unsupported locales and non-string dictionary values", () => {
    const dispose = registerAppTranslations("coerce-demo", {
      en: {
        "coerce.valid": "Valid",
        "coerce.invalid": 123,
      },
      fr: {
        "coerce.valid": "Bonjour",
      },
    } as never);

    expect(translate("en", "coerce.valid")).toBe("Valid");
    expect(translate("en", "coerce.invalid")).toBe("coerce.invalid");

    dispose();
  });
});
