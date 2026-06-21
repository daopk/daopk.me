import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ToolbarTitle from "./ToolbarTitle.vue";

describe("ToolbarTitle", () => {
  it("renders title and subtitle", () => {
    const title = mount(ToolbarTitle, { props: { title: "Document", subtitle: "Draft" } });
    expect(title.text()).toContain("Document");
    expect(title.text()).toContain("Draft");
  });
});
