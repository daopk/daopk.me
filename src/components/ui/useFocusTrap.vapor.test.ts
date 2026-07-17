import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mountVaporElementComposable } from "~/test/mountVapor";

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
    const mounted = mountVaporElementComposable(
      () => {
        const element = document.createElement("div");
        element.tabIndex = -1;
        const button = document.createElement("button");
        button.textContent = "Close";
        element.append(button);
        return element;
      },
      (target) => useFocusTrap(target, { escapeDeactivates: false, preventScroll: true }),
    );

    await nextTick();

    const element = mounted.element;
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

    mounted.unmount();
  });

  it("maps a reactive enabled input to Ropav activation", async () => {
    const enabled = ref(false);
    const mounted = mountVaporElementComposable(
      () => {
        const element = document.createElement("div");
        element.tabIndex = -1;
        return element;
      },
      (target) => useFocusTrap(target, {}, enabled),
    );

    await nextTick();
    expect(focusTrapMocks.deactivate).toHaveBeenCalledOnce();

    enabled.value = true;
    await nextTick();
    expect(focusTrapMocks.activate).toHaveBeenCalledOnce();

    enabled.value = false;
    await nextTick();
    expect(focusTrapMocks.deactivate).toHaveBeenCalledTimes(2);

    mounted.unmount();
  });
});
