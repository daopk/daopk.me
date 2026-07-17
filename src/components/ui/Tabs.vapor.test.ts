import { afterEach, describe, expect, it } from "vitest";
import { createComponent, defineVaporComponent, nextTick, ref } from "vue";
import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsValue } from "ropav/tabs";

import { assertVaporComponents, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

const mounted: VaporMount[] = [];

function text(value: string): Text {
  return document.createTextNode(value);
}

function mountTabs(initialValue: TabsValue = "month") {
  const value = ref<TabsValue>(initialValue);
  const Host = defineVaporComponent(() =>
    createComponent(
      Tabs,
      {
        modelValue: () => value.value,
        "onUpdate:modelValue": () => (next: TabsValue) => (value.value = next),
      },
      {
        default: () => [
          createComponent(
            TabsList,
            { ariaLabel: "Calendar view" },
            {
              default: () => [
                createComponent(
                  TabsTrigger,
                  { id: "tab-month", value: "month" },
                  { default: () => text("Month") },
                ),
                createComponent(
                  TabsTrigger,
                  { id: "tab-week", value: "week" },
                  { default: () => text("Week") },
                ),
                createComponent(
                  TabsTrigger,
                  { id: "tab-day", value: "day", disabled: true },
                  { default: () => text("Day") },
                ),
                createComponent(
                  TabsTrigger,
                  { id: "tab-year", value: "year" },
                  { default: () => text("Year") },
                ),
              ],
            },
          ),
          createComponent(
            TabsContent,
            { id: "panel-month", value: "month" },
            { default: () => text("Month panel") },
          ),
          createComponent(
            TabsContent,
            { id: "panel-week", value: "week" },
            { default: () => text("Week panel") },
          ),
          createComponent(
            TabsContent,
            { id: "panel-day", value: "day" },
            { default: () => text("Day panel") },
          ),
          createComponent(
            TabsContent,
            { id: "panel-year", value: "year" },
            { default: () => text("Year panel") },
          ),
        ],
      },
    ),
  );
  const wrapper = mountVaporRoot(Host);
  mounted.push(wrapper);
  return { value, wrapper };
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

it("keeps the direct Ropav tabs exports compiled in Vapor mode", () => {
  assertVaporComponents({ Tabs, TabsContent, TabsList, TabsTrigger });
});

describe("Tabs", () => {
  it("links triggers and panels through the Ropav registry", async () => {
    const { wrapper } = mountTabs();
    await nextTick();

    expect(wrapper.find('[role="tablist"]').getAttribute("aria-label")).toBe("Calendar view");
    expect(wrapper.find("#tab-month").getAttribute("aria-controls")).toBe("panel-month");
    expect(wrapper.find("#panel-month").getAttribute("aria-labelledby")).toBe("tab-month");
    expect(wrapper.find("#panel-week").hasAttribute("hidden")).toBe(true);
  });

  it("round-trips controlled selection and skips disabled tabs with the keyboard", async () => {
    const { value, wrapper } = mountTabs();

    wrapper.find<HTMLButtonElement>("#tab-week").click();
    await nextTick();
    expect(value.value).toBe("week");
    expect(wrapper.find("#tab-week").getAttribute("aria-selected")).toBe("true");

    wrapper
      .find("#tab-week")
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await nextTick();
    expect(value.value).toBe("year");
    expect(document.activeElement).toBe(wrapper.find("#tab-year"));
  });
});
