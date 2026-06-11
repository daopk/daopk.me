import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";

import LanguageSection from "./LanguageSection.vue";

function mountSection() {
  return mount(LanguageSection, {
    attachTo: document.body,
  });
}

function mockBrowserLanguages(languages: readonly string[], language = languages[0] ?? ""): void {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(language);
}

describe("LanguageSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockBrowserLanguages(["en-US"], "en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders automatic, English, and Vietnamese choices", () => {
    const wrapper = mountSection();

    const cards = wrapper.findAll(".language__card");
    expect(cards).toHaveLength(3);
    expect(cards[0]?.text()).toContain("Automatic");
    expect(cards[1]?.text()).toContain("English");
    expect(cards[2]?.text()).toContain("Vietnamese");
    expect(cards[0]?.attributes("aria-checked")).toBe("true");
    expect(cards[1]?.attributes("aria-checked")).toBe("false");
    expect(cards[2]?.attributes("aria-checked")).toBe("false");

    wrapper.unmount();
  });

  it("uses browser Vietnamese while automatic is selected", () => {
    vi.restoreAllMocks();
    mockBrowserLanguages(["vi-VN", "en-US"], "vi-VN");

    const wrapper = mountSection();

    expect(wrapper.text()).toContain("Tự động");
    expect(wrapper.text()).toContain("Ngôn ngữ hiển thị");
    expect(wrapper.findAll(".language__card")[0]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("selecting Vietnamese updates the persisted locale, switches manual, and rerenders labels", async () => {
    const settings = useSettingsStore();
    const wrapper = mountSection();

    await wrapper.findAll(".language__card")[2]?.trigger("click");
    await nextTick();

    expect(settings.locale).toBe("vi");
    expect(settings.localeMode).toBe("manual");
    expect(wrapper.text()).toContain("Tiếng Việt");
    expect(wrapper.findAll(".language__card")[2]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("selecting English marks the locale as manually configured", async () => {
    const settings = useSettingsStore();
    const wrapper = mountSection();

    await wrapper.findAll(".language__card")[1]?.trigger("click");

    expect(settings.locale).toBe("en");
    expect(settings.localeMode).toBe("manual");
    expect(wrapper.findAll(".language__card")[0]?.attributes("aria-checked")).toBe("false");
    expect(wrapper.findAll(".language__card")[1]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });

  it("selecting automatic restores browser-following mode", async () => {
    const settings = useSettingsStore();
    const wrapper = mountSection();

    await wrapper.findAll(".language__card")[2]?.trigger("click");
    expect(settings.localeMode).toBe("manual");

    await wrapper.findAll(".language__card")[0]?.trigger("click");

    expect(settings.locale).toBe("vi");
    expect(settings.localeMode).toBe("auto");
    expect(wrapper.findAll(".language__card")[0]?.attributes("aria-checked")).toBe("true");

    wrapper.unmount();
  });
});
