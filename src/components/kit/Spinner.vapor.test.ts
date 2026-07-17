import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import Spinner from "./Spinner.vue";

describe("Spinner", () => {
  it("exposes a status role, label, and size modifier", () => {
    const spinner = mount(Spinner, { props: { size: "lg", label: "Fetching" } });
    expect(spinner.attributes("role")).toBe("status");
    expect(spinner.attributes("aria-label")).toBe("Fetching");
    expect(spinner.classes()).toContain("ds-kit-spinner--lg");
  });
});
