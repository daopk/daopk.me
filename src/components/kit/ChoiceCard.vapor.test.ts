import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import ChoiceCard from "./ChoiceCard.vue";

describe("ChoiceCard", () => {
  it("exposes radio semantics, content, and emits select", async () => {
    const card = mount(ChoiceCard, {
      props: { selected: true, title: "Light", description: "Bright" },
    });
    expect(card.attributes("role")).toBe("radio");
    expect(card.attributes("aria-checked")).toBe("true");
    expect(card.text()).toContain("Light");
    expect(card.text()).toContain("Bright");

    await card.trigger("click");
    expect(card.emitted("select")).toHaveLength(1);
  });
});
