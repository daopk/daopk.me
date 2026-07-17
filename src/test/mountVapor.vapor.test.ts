import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import Button from "~/components/ui/Button.vue";

import { mountVapor, mountVaporRoot } from "./mountVapor";

describe("mountVapor", () => {
  it("rejects VDOM components when a Vapor root is required", () => {
    const VdomComponent = defineComponent({ render: () => h("div", "VDOM") });

    expect(() => mountVaporRoot(VdomComponent)).toThrow("was not compiled in Vapor mode");
    expect(() => mountVaporRoot(Button)).not.toThrow();
  });

  it("dispatches only the requested value event and supports exact DOM events", async () => {
    const events: string[] = [];
    const Host = defineComponent({
      render: () =>
        h("input", {
          onChange: () => events.push("change"),
          onInput: () => events.push("input"),
          onKeydown: (event: KeyboardEvent) => events.push(event.key),
        }),
    });
    const wrapper = mountVapor(Host);

    await wrapper.setValue("input", "first");
    await wrapper.setValue("input", "second", "change");
    await wrapper.trigger("input", new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

    expect(wrapper.find<HTMLInputElement>("input").value).toBe("second");
    expect(events).toEqual(["input", "change", "Enter"]);
  });

  it("makes cleanup idempotent", () => {
    const wrapper = mountVaporRoot(Button);

    wrapper.unmount();
    expect(() => wrapper.unmount()).not.toThrow();
    expect(document.body.contains(wrapper.element)).toBe(false);
  });
});
