import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import Separator from "./Separator.vue";

describe("Separator", () => {
  it("exposes separator semantics with an orientation", () => {
    const sep = mount(Separator, { props: { orientation: "vertical" } });
    expect(sep.attributes("role")).toBe("separator");
    expect(sep.attributes("aria-orientation")).toBe("vertical");
    expect(sep.classes()).toContain("ds-kit-separator--vertical");
  });

  it("drops the role when decorative", () => {
    const decorative = mount(Separator, { props: { decorative: true } });
    expect(decorative.attributes("role")).toBeUndefined();
  });
});
