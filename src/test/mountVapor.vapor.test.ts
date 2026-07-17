import { describe, expect, it } from "vitest";
import { defineVaporComponent } from "vue";
import { Button } from "ropav/button";

import { verifiedVaporLoader } from "~/utils/vaporComponent";

import { mountVapor, mountVaporRoot } from "./mountVapor";

describe("mountVapor", () => {
  it("rejects VDOM components when a Vapor root is required", () => {
    const VdomComponent = { render: () => null };

    expect(() => mountVaporRoot(VdomComponent)).toThrow("was not compiled in Vapor mode");
    expect(() => mountVaporRoot(Button)).not.toThrow();
  });

  it("rejects VDOM components returned by an async loader", async () => {
    const VdomComponent = { render: () => null };

    await expect(verifiedVaporLoader(async () => ({ default: VdomComponent }))()).rejects.toThrow(
      "was not compiled in Vapor mode",
    );
    await expect(verifiedVaporLoader(async () => ({ default: Button }))()).resolves.toEqual({
      default: Button,
    });
  });

  it("dispatches only the requested value event and supports exact DOM events", async () => {
    const events: string[] = [];
    const Host = defineVaporComponent(() => {
      const input = document.createElement("input");
      input.addEventListener("change", () => events.push("change"));
      input.addEventListener("input", () => events.push("input"));
      input.addEventListener("keydown", (event) => events.push(event.key));
      return input;
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
