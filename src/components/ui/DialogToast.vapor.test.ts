import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, defineVaporComponent, insert, nextTick, ref } from "vue";

import { Modal } from "ropav/modal";
import { ToastProvider, useToast, type UseToastReturn } from "ropav/toast";

import { assertVaporComponents, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import ToastHost from "./ToastHost.vue";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

function mountToastHost(): { readonly toast: UseToastReturn; readonly wrapper: VaporMount } {
  let toast: UseToastReturn | undefined;
  const Consumer = defineVaporComponent(() => {
    toast = useToast();
    return createComponent(ToastHost);
  });
  const Host = defineVaporComponent(() =>
    createComponent(
      ToastProvider,
      {
        max: 5,
        duration: 5000,
        radius: "md",
        closeLabel: "Dismiss notification",
      },
      { default: () => createComponent(Consumer) },
    ),
  );
  const wrapper = mount(Host);
  if (!toast) throw new Error("Toast host did not mount inside its provider.");
  return { toast, wrapper };
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await Promise.resolve();
}

function pointer(element: Element, type: string, clientX = 0): void {
  element.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, clientX, pointerId: 1 }),
  );
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

it("keeps direct Ropav modal and the local toast host compiled in Vapor mode", () => {
  assertVaporComponents({ Modal, ToastHost });
});

describe("Modal", () => {
  it("renders viewport modal semantics, traps focus and restores the trigger", async () => {
    const open = ref(false);
    const Host = defineVaporComponent(() => {
      const root = document.createElement("div");
      const trigger = document.createElement("button");
      trigger.id = "dialog-trigger";
      trigger.textContent = "Open dialog";
      trigger.addEventListener("click", () => (open.value = true));
      root.append(trigger);
      insert(
        createComponent(
          Modal,
          {
            open: () => open.value,
            baseZIndex: 1601,
            title: "Confirm change",
            description: "This updates your preferences.",
            focusTrapOptions: { tabbableOptions: { displayCheck: "none" } },
            "onUpdate:open": () => (next: boolean) => (open.value = next),
          },
          {
            default: () => {
              const button = document.createElement("button");
              button.id = "inside-action";
              button.textContent = "Continue";
              return button;
            },
          },
        ),
        root,
      );
      return root;
    });
    const wrapper = mount(Host);
    const trigger = wrapper.find<HTMLButtonElement>("#dialog-trigger");
    trigger.focus();
    trigger.click();
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const modal = document.body.querySelector<HTMLElement>(".rp-modal");
    const overlay = document.body.querySelector<HTMLElement>(".rp-modal__overlay");
    expect(dialog?.classList).toContain("rp-modal__panel");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();
    expect(overlay).not.toBeNull();
    expect(modal?.style.zIndex).toBe("1601");
    expect(document.body.style.overflow).toBe("hidden");
    expect(wrapper.element.inert).toBe(true);
    expect(document.activeElement === dialog || dialog?.contains(document.activeElement)).toBe(
      true,
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await settle();
    expect(open.value).toBe(false);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(wrapper.element.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("supports custom portals, public part classes and non-dismissible surfaces", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const updates: boolean[] = [];
    mount(Modal, {
      props: {
        open: true,
        title: "Scoped modal",
        teleportTo: target,
        modal: false,
        closeOnEscape: false,
        closeOnOverlayClick: false,
        showCloseButton: false,
        classNames: {
          root: "consumer-modal",
          panel: "consumer-modal__panel",
          footer: "consumer-modal__footer",
        },
        "onUpdate:open": (next: boolean) => updates.push(next),
      },
      slots: {
        default: "<button>Explicit action</button>",
        footer: "<button>Footer action</button>",
      },
    });
    await settle();

    const dialog = target.querySelector<HTMLElement>('[role="dialog"]');
    expect(target.querySelector(".consumer-modal")).not.toBeNull();
    expect(dialog?.classList).toContain("consumer-modal__panel");
    expect(target.querySelector(".consumer-modal__footer")?.textContent).toContain("Footer action");
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    pointer(target.querySelector(".rp-modal__overlay")!, "pointerdown");
    expect(updates).toEqual([]);
  });

  it("has no serious accessibility violations while open", async () => {
    mount(Modal, {
      props: { open: true, title: "Accessible dialog", description: "Dialog details" },
      slots: { default: "<button>Done</button>" },
    });
    await settle();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const axe = (await import("axe-core")).default;
    const results = await axe.run(dialog, {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id }) => id),
    ).toEqual([]);
  });
});

describe("ToastHost", () => {
  it("renders tone-specific live regions and supports manual dismissal", async () => {
    vi.useFakeTimers();
    const { toast, wrapper } = mountToastHost();
    toast.success({ title: "Uploaded", description: "3 files synced", duration: 10_000 });
    toast.error({ title: "Failed", duration: 10_000 });
    await settle();

    const items = wrapper.findAll<HTMLElement>(".ds-toast");
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("role")).toBe("status");
    expect(items[1]?.getAttribute("role")).toBe("alert");

    wrapper.find<HTMLButtonElement>(".ds-toast__close").click();
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(1);
  });

  it("updates an active toast through the provider queue", async () => {
    vi.useFakeTimers();
    const { toast, wrapper } = mountToastHost();
    const id = toast.info({ title: "Uploading", duration: 10_000 });
    await settle();

    expect(wrapper.find(".ds-toast").textContent).toContain("Uploading");
    toast.update(id, { title: "Uploaded", type: "success" });
    await nextTick();

    expect(wrapper.find(".ds-toast").textContent).toContain("Uploaded");
    expect(wrapper.find<HTMLElement>(".ds-toast-viewport__item").dataset.type).toBe("success");
  });

  it("dismisses all active toasts through the provider API", async () => {
    vi.useFakeTimers();
    const { toast, wrapper } = mountToastHost();
    toast.info({ title: "First", duration: 10_000 });
    toast.warning({ title: "Second", duration: 10_000 });
    await settle();
    expect(wrapper.findAll(".ds-toast")).toHaveLength(2);

    toast.dismissAll();
    expect(toast.toasts.value).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(0);
  });

  it("auto-dismisses while pausing the remaining timer on hover and focus", async () => {
    vi.useFakeTimers();
    const { toast, wrapper } = mountToastHost();
    toast.info({ title: "Paused", duration: 100 });
    await settle();
    const item = wrapper.find<HTMLElement>(".ds-toast");

    await vi.advanceTimersByTimeAsync(40);
    item.dispatchEvent(new MouseEvent("mouseenter"));
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(1);

    item.dispatchEvent(new MouseEvent("mouseleave"));
    await vi.advanceTimersByTimeAsync(59);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(0);

    toast.warning({ title: "Focus paused", duration: 50 });
    await nextTick();
    const close = wrapper.find<HTMLButtonElement>(".ds-toast__close");
    close.focus();
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(1);
    close.blur();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(0);
  });

  it("dismisses a toast after a rightward swipe", async () => {
    vi.useFakeTimers();
    const { toast, wrapper } = mountToastHost();
    toast.info({ title: "Swipe me", duration: 10_000 });
    await settle();
    const item = wrapper.find<HTMLElement>(".ds-toast");
    const swipeItem = wrapper.find<HTMLElement>(".ds-toast-viewport__item");

    pointer(item, "pointerdown", 10);
    pointer(item, "pointermove", 90);
    await nextTick();
    expect(swipeItem.dataset.swipe).toBe("move");
    expect(swipeItem.style.getPropertyValue("--ds-toast-swipe-move-x")).toBe("80px");
    pointer(item, "pointerup", 90);
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(0);
  });

  it("has no serious accessibility violations with both live priorities", async () => {
    const { toast, wrapper } = mountToastHost();
    toast.info({ title: "Information", duration: 10_000 });
    toast.warning({ title: "Warning", description: "Review this", duration: 10_000 });
    await settle();
    const axe = (await import("axe-core")).default;
    const results = await axe.run(wrapper.find(".ds-toast-viewport"), {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id }) => id),
    ).toEqual([]);
  });
});
