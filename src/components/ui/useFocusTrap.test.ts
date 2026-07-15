import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useFocusTrap } from "./useFocusTrap";

const focusTrapMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  deactivate: vi.fn(),
  use: vi.fn(),
}));

vi.mock("ropav/focus-trap", () => ({
  useFocusTrap: focusTrapMocks.use,
}));

describe("useFocusTrap", () => {
  beforeEach(() => {
    focusTrapMocks.activate.mockReset();
    focusTrapMocks.deactivate.mockReset();
    focusTrapMocks.use.mockReset();
    focusTrapMocks.use.mockReturnValue({
      activate: focusTrapMocks.activate,
      deactivate: focusTrapMocks.deactivate,
    });
  });

  it("delegates to Ropav while preserving the facade defaults", async () => {
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
    expect(focusTrapMocks.use).toHaveBeenCalledOnce();
    expect(focusTrapMocks.use).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        allowOutsideClick: true,
        escapeDeactivates: false,
        preventScroll: true,
        returnFocusOnDeactivate: true,
      }),
    );
    expect(focusTrapMocks.activate).toHaveBeenCalledOnce();

    const target = focusTrapMocks.use.mock.calls[0]?.[0];
    const options = focusTrapMocks.use.mock.calls[0]?.[1];
    expect(target?.value).toBe(element);
    expect(options?.fallbackFocus()).toBe(element);

    wrapper.unmount();
  });

  it("maps a reactive enabled input to Ropav activation", async () => {
    const enabled = ref(false);
    const Harness = defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null);
        useFocusTrap(target, {}, enabled);
        return () => h("div", { ref: target, tabindex: -1 });
      },
    });

    const wrapper = mount(Harness, { attachTo: document.body });
    await nextTick();
    expect(focusTrapMocks.deactivate).toHaveBeenCalledOnce();

    enabled.value = true;
    await nextTick();
    expect(focusTrapMocks.activate).toHaveBeenCalledOnce();

    enabled.value = false;
    await nextTick();
    expect(focusTrapMocks.deactivate).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });
});
