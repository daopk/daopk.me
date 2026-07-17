import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { defineVaporComponent, type Component } from "vue";

import type { AppManifest } from "~/types/app";

import HomeScreenIcon from "./HomeScreenIcon.vue";

const StubIcon = defineVaporComponent(() => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.dataset.stubGlyph = "";
  return icon;
});
const StubApp = defineVaporComponent(() => document.createElement("div"));

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: StubApp }),
    ...overrides,
  };
}

describe("HomeScreenIcon", () => {
  it("renders the manifest's icon component and label", () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest() },
    });

    expect(wrapper.find("[data-stub-glyph]").exists()).toBe(true);
    expect(wrapper.find(".home-icon__label").text()).toBe("Alpha");
    expect(wrapper.find("button.home-icon").attributes("data-manifest-id")).toBe("alpha");
  });

  it("emits `launch` with the manifest id on click", async () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest() },
    });

    await wrapper.find("button.home-icon").trigger("click");

    expect(wrapper.emitted("launch")).toEqual([["alpha"]]);
  });

  it("emits `launch` on Enter / Space (a11y keyboard path)", async () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest() },
    });

    await wrapper.find("button.home-icon").trigger("keydown", { key: "Enter" });
    await wrapper.find("button.home-icon").trigger("keydown", { key: " " });

    expect(wrapper.emitted("launch")).toEqual([["alpha"], ["alpha"]]);
  });

  it("M1.3.6: flips to `aria-busy=true` and `disabled` when launching=true", () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest(), launching: true },
    });

    const button = wrapper.find("button.home-icon");
    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.classes()).toContain("home-icon--launching");
  });

  it("M1.3.6: renders the spinner overlay when launching=true (no spinner in idle state)", () => {
    const idle = mount(HomeScreenIcon, {
      props: { manifest: manifest(), launching: false },
    });
    expect(idle.find(".home-icon__spinner").exists()).toBe(false);

    const busy = mount(HomeScreenIcon, {
      props: { manifest: manifest(), launching: true },
    });
    expect(busy.find(".home-icon__spinner").exists()).toBe(true);
    expect(busy.find("[data-stub-glyph]").exists()).toBe(true);
  });

  it("M1.3.6: omits `aria-busy` and `disabled` in the default (idle) state", () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest() },
    });

    const button = wrapper.find("button.home-icon");
    expect(button.attributes("aria-busy")).toBeUndefined();
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("M1.3.6: suppresses `launch` re-emit while launching=true (re-press guard)", async () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest(), launching: true },
    });

    await wrapper.find("button.home-icon").trigger("click");
    await wrapper.find("button.home-icon").trigger("keydown", { key: "Enter" });
    await wrapper.find("button.home-icon").trigger("keydown", { key: " " });

    expect(wrapper.emitted("launch")).toBeUndefined();
  });

  it("M1.3.6: resumes emitting `launch` once launching flips back to false", async () => {
    const wrapper = mount(HomeScreenIcon, {
      props: { manifest: manifest(), launching: true },
    });

    await wrapper.find("button.home-icon").trigger("click");
    expect(wrapper.emitted("launch")).toBeUndefined();

    await wrapper.setProps({ launching: false });
    await wrapper.find("button.home-icon").trigger("click");

    expect(wrapper.emitted("launch")).toEqual([["alpha"]]);
  });
});
