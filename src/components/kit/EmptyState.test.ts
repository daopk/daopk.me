import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import EmptyState from "./EmptyState.vue";

const StubIcon = { template: '<svg data-testid="icon" />' };

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
