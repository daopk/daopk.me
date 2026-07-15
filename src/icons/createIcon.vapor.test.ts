import { describe, expect, it } from "vitest";
import type { Component } from "vue";
import IconButton from "~/components/kit/IconButton.vue";
import { mountVapor } from "~/test/mountVapor";

import { TrashAppIcon } from "./fluentColor";
import { Search } from "./lucide";
import * as runtimeIcons from "../runtime/icons";
import { SETTINGS_MENU_ICON_ASSETS, SettingsAppearanceIcon } from "./settingsMenuIcons";

const PUBLIC_LUCIDE_EXPORTS = [
  "Activity",
  "AlertCircle",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Box",
  "CalendarDays",
  "CalendarRange",
  "Check",
  "ChevronLeft",
  "ChevronRight",
  "Clock",
  "Cloud",
  "CloudOff",
  "Copy",
  "Download",
  "Eraser",
  "ExternalLink",
  "File",
  "FileText",
  "Film",
  "Flag",
  "Folder",
  "FolderOpen",
  "FolderPlus",
  "Globe",
  "Grid2X2",
  "Home",
  "Image",
  "Info",
  "KeyRound",
  "Layers2",
  "LayoutGrid",
  "List",
  "Loader2",
  "Lock",
  "LogOut",
  "Maximize2",
  "Menu",
  "Minimize2",
  "Minus",
  "MoreHorizontal",
  "MoveHorizontal",
  "Palette",
  "Pause",
  "Pencil",
  "PictureInPicture",
  "PictureInPicture2",
  "Play",
  "Plus",
  "RefreshCw",
  "RotateCcw",
  "RotateCw",
  "RotateCwSquare",
  "Save",
  "Search",
  "Settings",
  "Share2",
  "Shield",
  "SkipForward",
  "Sparkles",
  "Terminal",
  "Timer",
  "Trash2",
  "Tv",
  "Type",
  "Unlock",
  "Upload",
  "Volume2",
  "VolumeX",
  "Wallpaper",
  "X",
  "ZoomIn",
  "ZoomOut",
] as const;

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

function isVaporDefinition(component: Component): boolean {
  return (
    typeof component === "object" &&
    component !== null &&
    "__vapor" in component &&
    component.__vapor === true
  );
}

describe("Vapor icon components", () => {
  it("keeps every factory output on the Vapor runtime", () => {
    expect(isVaporDefinition(Search)).toBe(true);
    expect(isVaporDefinition(TrashAppIcon)).toBe(true);
    expect(isVaporDefinition(SettingsAppearanceIcon)).toBe(true);
  });

  it("renders Lucide SVG defaults, custom props, attrs, and events", () => {
    let clicks = 0;
    const wrapper = mountVapor(Search, {
      props: {
        size: 32,
        strokeWidth: 1.5,
        class: "search-icon",
        "aria-label": "Search",
        "data-testid": "search",
        onClick: () => clicks++,
      },
    });
    const svg = wrapper.find<SVGElement>("svg");

    expect(svg.getAttribute("width")).toBe("32");
    expect(svg.getAttribute("height")).toBe("32");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("aria-label")).toBe("Search");
    expect(svg.getAttribute("data-testid")).toBe("search");
    expect(svg.classList.contains("search-icon")).toBe(true);
    expect(svg.querySelector("[stroke-width]")?.getAttribute("stroke-width")).toBe("1.5");

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
    const wrapper = mountVapor(SettingsAppearanceIcon, {
      props: { size: "2rem", class: "settings-icon" },
    });
    const image = wrapper.find<HTMLImageElement>("img");

    expect(image.getAttribute("src")).toBe(SETTINGS_MENU_ICON_ASSETS.appearance);
    expect(image.getAttribute("width")).toBe("2rem");
    expect(image.getAttribute("height")).toBe("2rem");
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("draggable")).toBe("false");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.classList.contains("settings-icon")).toBe(true);
    wrapper.unmount();
  });

  it("renders inside a legacy VDOM component through the production interop boundary", () => {
    const wrapper = mountVapor(IconButton, {
      props: { label: "Search", icon: Search },
    });
    const button = wrapper.find<HTMLButtonElement>("button");
    const icon = wrapper.find<SVGElement>("svg");

    expect(button.getAttribute("aria-label")).toBe("Search");
    expect(icon.classList.contains("ds-kit-icon-button__icon")).toBe(true);
    expect(icon.getAttribute("width")).toBe("24");
    expect(icon.getAttribute("height")).toBe("24");
    wrapper.unmount();
  });

  it("preserves the complete public @daopk/icons export surface", () => {
    expect(Object.keys(runtimeIcons).sort()).toEqual([...PUBLIC_LUCIDE_EXPORTS].sort());
  });
});
