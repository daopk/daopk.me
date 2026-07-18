import { describe, expect, it } from "vitest";
import { createComponent, type VaporComponent } from "vue";
import { IconButton } from "ropav/icon-button";
import { mountVapor } from "~/test/mountVapor";
import Search from "~icons/lucide/search";

import { TrashAppIcon } from "./fluentColor";
import Icon from "./Icon.vue";
import { SETTINGS_MENU_ICON_ASSETS, SettingsAppearanceIcon } from "./settingsMenuIcons";

function referencedIds(svg: SVGElement): string[] {
  return Array.from(svg.querySelectorAll("[fill], [filter], [mask], [clip-path]"))
    .flatMap((element) =>
      ["fill", "filter", "mask", "clip-path"].map((attribute) => element.getAttribute(attribute)),
    )
    .flatMap((value) => {
      const match = value?.match(/^url\(#(.+)\)$/);
      return match?.[1] ? [match[1]] : [];
    });
}

function isVaporDefinition(component: VaporComponent): boolean {
  return (
    typeof component === "object" &&
    component !== null &&
    "__vapor" in component &&
    component.__vapor === true
  );
}

describe("Vapor icon components", () => {
  it("keeps every icon definition on the Vapor runtime", () => {
    expect(isVaporDefinition(Search)).toBe(true);
    expect(isVaporDefinition(TrashAppIcon)).toBe(true);
    expect(isVaporDefinition(SettingsAppearanceIcon)).toBe(true);
  });

  it("keeps compiled SVG dimensions relative to the surrounding font size", () => {
    const wrapper = mountVapor(Search);
    const svg = wrapper.find<SVGElement>("svg");

    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("height")).toBe("1em");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    wrapper.unmount();
  });

  it("sizes a glyph and forwards attrs and events through Icon", () => {
    let clicks = 0;
    const wrapper = mountVapor(Icon, {
      props: {
        icon: Search,
        size: 32,
        strokeWidth: 1.5,
        class: "search-icon",
        "aria-label": "Search",
        "data-testid": "search",
        onClick: () => clicks++,
      },
    });
    const svg = wrapper.find<SVGElement>("svg");

    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("height")).toBe("1em");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("aria-label")).toBe("Search");
    expect(svg.getAttribute("data-testid")).toBe("search");
    expect(svg.classList.contains("search-icon")).toBe(true);
    expect(svg.style.fontSize).toBe("32px");
    expect(svg.style.strokeWidth).toBe("1.5");
    expect(svg.classList.contains("daopk-vapor-icon")).toBe(true);

    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toBe(1);
    wrapper.unmount();
  });

  it("rewrites palette IDs independently for every component instance", () => {
    const first = mountVapor(TrashAppIcon);
    const second = mountVapor(TrashAppIcon);
    const firstSvg = first.find<SVGElement>("svg");
    const secondSvg = second.find<SVGElement>("svg");
    const firstIds = new Set(Array.from(firstSvg.querySelectorAll("[id]"), (node) => node.id));
    const secondIds = new Set(Array.from(secondSvg.querySelectorAll("[id]"), (node) => node.id));

    expect(firstIds.size).toBeGreaterThan(0);
    expect(secondIds.size).toBe(firstIds.size);
    expect([...firstIds].some((id) => secondIds.has(id))).toBe(false);
    expect(referencedIds(firstSvg).every((id) => firstIds.has(id))).toBe(true);
    expect(referencedIds(secondSvg).every((id) => secondIds.has(id))).toBe(true);

    first.unmount();
    second.unmount();
  });

  it("renders image icons with their compatibility props", () => {
    const wrapper = mountVapor(Icon, {
      props: { icon: SettingsAppearanceIcon, size: "2rem", class: "settings-icon" },
    });
    const image = wrapper.find<HTMLImageElement>("img");

    expect(image.getAttribute("src")).toBe(SETTINGS_MENU_ICON_ASSETS.appearance);
    expect(image.style.fontSize).toBe("2rem");
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("draggable")).toBe("false");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.classList.contains("settings-icon")).toBe(true);
    wrapper.unmount();
  });

  it("renders inside a Vapor component through the production component boundary", () => {
    const wrapper = mountVapor(IconButton, {
      props: { ariaLabel: "Search" },
      slots: { default: () => createComponent(Icon, { icon: Search, size: 24 }) },
    });
    const button = wrapper.find<HTMLButtonElement>("button");
    const icon = wrapper.find<SVGElement>("svg");

    expect(button.getAttribute("aria-label")).toBe("Search");
    expect(icon.parentElement?.classList.contains("rp-icon-button__icon")).toBe(true);
    expect(icon.getAttribute("width")).toBe("1em");
    expect(icon.getAttribute("height")).toBe("1em");
    expect(icon.style.fontSize).toBe("24px");
    wrapper.unmount();
  });
});
