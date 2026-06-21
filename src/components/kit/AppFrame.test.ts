import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppFrame from "./AppFrame.vue";

describe("AppFrame", () => {
  it("applies background and layout variants and exposes its element", () => {
    const frame = mount(AppFrame, {
      props: { background: "subtle", layout: "flex-column" },
      slots: { default: "App" },
    });
    expect(frame.classes()).toContain("ds-kit-app-frame--subtle");
    expect(frame.classes()).toContain("ds-kit-app-frame--flex-column");
    expect((frame.vm as { element: Element | null }).element).toBe(frame.element);
  });

  it("maps safeArea modes onto inset classes", () => {
    const def = mount(AppFrame);
    expect(def.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(def.classes()).toContain("ds-kit-app-frame--safe-x");
    expect(def.classes()).not.toContain("ds-kit-app-frame--safe-top");

    const all = mount(AppFrame, { props: { safeArea: "all" } });
    expect(all.classes()).toContain("ds-kit-app-frame--safe-top");
    expect(all.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(all.classes()).toContain("ds-kit-app-frame--safe-x");

    const bottom = mount(AppFrame, { props: { safeArea: "bottom" } });
    expect(bottom.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(bottom.classes()).not.toContain("ds-kit-app-frame--safe-x");

    const none = mount(AppFrame, { props: { safeArea: false } });
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-bottom");
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-x");
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-top");
  });
});
