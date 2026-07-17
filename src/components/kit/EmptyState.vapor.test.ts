import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";
import { defineVaporComponent } from "vue";

import EmptyState from "./EmptyState.vue";

const StubIcon = defineVaporComponent(() => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.dataset.testid = "icon";
  return icon;
});

describe("EmptyState", () => {
  it("centers an icon, title, and description", () => {
    const empty = mount(EmptyState, {
      props: { icon: StubIcon, title: "Nothing here", description: "Create something." },
    });
    expect(empty.text()).toContain("Nothing here");
    expect(empty.text()).toContain("Create something.");
    expect(empty.find("[data-testid='icon']").exists()).toBe(true);
  });
});
