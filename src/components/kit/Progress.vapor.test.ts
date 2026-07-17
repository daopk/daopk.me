import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import Progress from "./Progress.vue";

describe("Progress", () => {
  it("exposes progressbar semantics for a determinate value", () => {
    const wrapper = mount(Progress, { props: { value: 40, label: "Uploading" } });
    expect(wrapper.attributes("role")).toBe("progressbar");
    expect(wrapper.attributes("aria-label")).toBe("Uploading");
    expect(wrapper.attributes("aria-valuemin")).toBe("0");
    expect(wrapper.attributes("aria-valuemax")).toBe("100");
    expect(wrapper.attributes("aria-valuenow")).toBe("40");
    expect(wrapper.find(".ds-kit-progress__indicator").attributes("style")).toContain("40%");
  });

  it("clamps the value to the [0, max] range", () => {
    const over = mount(Progress, { props: { value: 240, max: 100 } });
    expect(over.attributes("aria-valuenow")).toBe("100");

    const under = mount(Progress, { props: { value: -10 } });
    expect(under.attributes("aria-valuenow")).toBe("0");
  });

  it("drops aria-valuenow and animates when indeterminate", () => {
    const wrapper = mount(Progress, { props: { value: null } });
    expect(wrapper.attributes("aria-valuenow")).toBeUndefined();
    expect(wrapper.classes()).toContain("ds-kit-progress--indeterminate");
  });
});
