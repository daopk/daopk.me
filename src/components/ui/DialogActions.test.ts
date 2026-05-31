import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DialogActions from "./DialogActions.vue";

describe("DialogActions", () => {
  it("defaults to end alignment and renders slot content", () => {
    const wrapper = mount(DialogActions, { slots: { default: "<button>OK</button>" } });
    expect(wrapper.classes()).toContain("ds-dialog-actions");
    expect(wrapper.classes()).toContain("ds-dialog-actions--end");
    expect(wrapper.find("button").text()).toBe("OK");
  });

  it("applies the requested alignment modifier", () => {
    const wrapper = mount(DialogActions, { props: { align: "between" } });
    expect(wrapper.classes()).toContain("ds-dialog-actions--between");
    expect(wrapper.classes()).not.toContain("ds-dialog-actions--end");
  });
});
