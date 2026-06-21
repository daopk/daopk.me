import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import SectionHeader from "./SectionHeader.vue";

const StubIcon = { template: '<svg data-testid="icon" />' };

describe("SectionHeader", () => {
  it("renders title, subtitle, icon, and actions", () => {
    const header = mount(SectionHeader, {
      props: { title: "Settings", subtitle: "Tune the system.", icon: StubIcon },
      slots: { actions: "<button>Done</button>" },
    });
    expect(header.text()).toContain("Settings");
    expect(header.text()).toContain("Tune the system.");
    expect(header.find("[data-testid='icon']").exists()).toBe(true);
    expect(header.find("button").text()).toBe("Done");
  });

  it("applies the page size modifier", () => {
    const page = mount(SectionHeader, { props: { title: "General", size: "page" } });
    expect(page.classes()).toContain("ds-kit-section-header--page");
  });
});
