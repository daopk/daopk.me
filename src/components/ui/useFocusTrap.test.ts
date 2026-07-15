import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useFocusTrap } from "./useFocusTrap";

const focusTrapMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  create: vi.fn(),
  deactivate: vi.fn(),
}));

vi.mock("focus-trap", () => ({
  createFocusTrap: focusTrapMocks.create,
}));

describe("useFocusTrap", () => {
  beforeEach(() => {
    focusTrapMocks.activate.mockReset();
    focusTrapMocks.create.mockReset();
    focusTrapMocks.deactivate.mockReset();
    focusTrapMocks.create.mockReturnValue({
      activate: focusTrapMocks.activate,
      deactivate: focusTrapMocks.deactivate,
    });
  });

  it("activates a DOM trap when the template ref is bound", async () => {
    const Harness = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null);
        useFocusTrap(target, { escapeDeactivates: false, preventScroll: true });
        return () => h("div", { ref: target, tabindex: -1 }, [h("button", "Close")]);
      },
    });

    const wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();

    const element = wrapper.get("div").element;
    expect(focusTrapMocks.create).toHaveBeenCalledOnce();
    expect(focusTrapMocks.create).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        allowOutsideClick: true,
        escapeDeactivates: false,
        preventScroll: true,
        returnFocusOnDeactivate: true,
      }),
    );
    expect(focusTrapMocks.activate).toHaveBeenCalledOnce();

    const options = focusTrapMocks.create.mock.calls[0]?.[1];
    expect(options?.fallbackFocus()).toBe(element);

    wrapper.unmount();
  });

  it("deactivates the trap when its component scope is disposed", async () => {
    const Harness = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null);
        useFocusTrap(target);
        return () => h("div", { ref: target, tabindex: -1 });
      },
    });

    const wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    wrapper.unmount();

    expect(focusTrapMocks.deactivate).toHaveBeenCalledOnce();
  });
});
