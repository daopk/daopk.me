import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import StatusBanner from "./StatusBanner.vue";

describe("StatusBanner", () => {
  it("renders a tone class and a status role by default", () => {
    const banner = mount(StatusBanner, { props: { tone: "error" }, slots: { default: "Failed" } });
    expect(banner.classes()).toContain("ds-kit-status-banner--error");
    expect(banner.attributes("role")).toBe("status");
    expect(banner.text()).toBe("Failed");
  });
});
