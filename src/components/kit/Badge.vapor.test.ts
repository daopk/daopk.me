import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import Badge from "./Badge.vue";

describe("Badge", () => {
  it("renders tone class and slot content", () => {
    const badge = mount(Badge, { props: { tone: "accent" }, slots: { default: "Read only" } });
    expect(badge.classes()).toContain("ds-kit-badge--accent");
    expect(badge.text()).toBe("Read only");
  });
});
