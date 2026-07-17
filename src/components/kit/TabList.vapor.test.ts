import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import TabList from "./TabList.vue";
import type { TabListOption } from "./types";

const tabs: readonly TabListOption[] = [
  { value: "month", label: "Month", id: "tab-month", panelId: "panel-month" },
  { value: "week", label: "Week", id: "tab-week", panelId: "panel-week" },
  { value: "day", label: "Day", id: "tab-day", panelId: "panel-day", disabled: true },
  { value: "year", label: "Year", id: "tab-year", panelId: "panel-year" },
];

function mountTabs(modelValue = "month") {
  return mount(TabList, { props: { modelValue, tabs, label: "Calendar view" } });
}

describe("TabList", () => {
  it("exposes tablist/tab semantics and wiring", () => {
    const wrapper = mountTabs();
    expect(wrapper.attributes("role")).toBe("tablist");
    expect(wrapper.find("#tab-month").attributes("aria-selected")).toBe("true");
    expect(wrapper.find("#tab-month").attributes("aria-controls")).toBe("panel-month");
  });

  it("selects on click and emits", async () => {
    const wrapper = mountTabs();
    await wrapper.find("#tab-week").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["week"]]);
    expect(wrapper.emitted("change")).toEqual([["week"]]);
  });

  it("does not select a disabled tab", async () => {
    const wrapper = mountTabs();
    await wrapper.find("#tab-day").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("uses a roving tabindex anchored on the active tab", () => {
    const wrapper = mountTabs();
    expect(wrapper.find("#tab-month").attributes("tabindex")).toBe("0");
    expect(wrapper.find("#tab-week").attributes("tabindex")).toBe("-1");
    expect(wrapper.find("#tab-year").attributes("tabindex")).toBe("-1");
  });

  it("moves with ArrowRight/ArrowLeft and skips disabled tabs", async () => {
    const wrapper = mountTabs();

    await wrapper.find("#tab-month").trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["week"]);

    // From "week", ArrowRight should skip the disabled "day" and land on "year".
    const onWeek = mountTabs("week");
    await onWeek.find("#tab-week").trigger("keydown", { key: "ArrowRight" });
    expect(onWeek.emitted("update:modelValue")?.at(-1)).toEqual(["year"]);
  });

  it("wraps with ArrowLeft and supports Home/End", async () => {
    const wrapStart = mountTabs("month");
    await wrapStart.find("#tab-month").trigger("keydown", { key: "ArrowLeft" });
    expect(wrapStart.emitted("update:modelValue")?.at(-1)).toEqual(["year"]);

    const homeEnd = mountTabs("week");
    await homeEnd.find("#tab-week").trigger("keydown", { key: "End" });
    expect(homeEnd.emitted("update:modelValue")?.at(-1)).toEqual(["year"]);
    await homeEnd.find("#tab-week").trigger("keydown", { key: "Home" });
    expect(homeEnd.emitted("update:modelValue")?.at(-1)).toEqual(["month"]);
  });
});
