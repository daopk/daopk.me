import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import ToolbarGroup from "./ToolbarGroup.vue";

describe("ToolbarGroup", () => {
  it("renders a labelled group with the separated modifier", () => {
    const group = mount(ToolbarGroup, {
      props: { label: "Navigation", separated: true },
      slots: { default: "<button>Back</button>" },
    });
    expect(group.attributes("role")).toBe("group");
    expect(group.attributes("aria-label")).toBe("Navigation");
    expect(group.classes()).toContain("ds-kit-toolbar-group--separated");
  });
});
