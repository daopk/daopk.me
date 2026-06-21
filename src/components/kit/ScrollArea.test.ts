import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ScrollArea from "./ScrollArea.vue";

describe("ScrollArea", () => {
  it("defaults to the vertical axis and exposes its element", () => {
    const vertical = mount(ScrollArea, { slots: { default: "Body" } });
    expect(vertical.classes()).toContain("ds-kit-scroll-area--vertical");
    expect(vertical.classes()).not.toContain("ds-kit-scroll-area--safe-area");
    expect(vertical.text()).toBe("Body");
    expect((vertical.vm as { element: Element | null }).element).toBe(vertical.element);
  });

  it("applies horizontal axis and safe-area classes", () => {
    const horizontal = mount(ScrollArea, { props: { axis: "horizontal", safeArea: true } });
    expect(horizontal.classes()).toContain("ds-kit-scroll-area--horizontal");
    expect(horizontal.classes()).toContain("ds-kit-scroll-area--safe-area");
  });
});
