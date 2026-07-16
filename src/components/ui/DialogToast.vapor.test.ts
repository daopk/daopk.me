import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { mountVapor, type VaporMount } from "~/test/mountVapor";

import Dialog from "./Dialog.vue";
import ToastHost from "./ToastHost.vue";
import { clearToasts, useToast } from "./useToast";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVapor>[0],
  options?: Parameters<typeof mountVapor>[1],
) {
  const wrapper = mountVapor(component, options);
  mounted.push(wrapper);
  return wrapper;
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
  clearToasts();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("Dialog", () => {
  it("renders viewport modal semantics, traps focus and restores the trigger", async () => {
    const open = ref(false);
    const Host = defineComponent({
      setup: () => () =>
        h("div", [
          h("button", { id: "dialog-trigger", onClick: () => (open.value = true) }, "Open dialog"),
          h(
            Dialog,
            {
              open: open.value,
              title: "Confirm change",
              description: "This updates your preferences.",
              "onUpdate:open": (next: boolean) => (open.value = next),
            },
            { default: () => h("button", { id: "inside-action" }, "Continue") },
          ),
        ]),
    });
    const wrapper = mount(Host);
    const trigger = wrapper.find<HTMLButtonElement>("#dialog-trigger");
    trigger.focus();
    trigger.click();
    await settle();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const overlay = document.body.querySelector<HTMLElement>(".ds-dialog__overlay");
    expect(dialog?.classList).toContain("ds-dialog__content--viewport");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();
    expect(overlay?.classList).toContain("ds-dialog__overlay--default");
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

  it("only lets the top dialog handle Escape and outside pointer dismissal", async () => {
    const firstUpdates: boolean[] = [];
    const secondUpdates: boolean[] = [];
    mount(Dialog, {
      props: {
        open: true,
        title: "First",
        "onUpdate:open": (next: boolean) => firstUpdates.push(next),
      },
    });
    mount(Dialog, {
      props: {
        open: true,
        title: "Second",
        "onUpdate:open": (next: boolean) => secondUpdates.push(next),
      },
    });
    await settle();

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(firstUpdates).toEqual([]);
    expect(secondUpdates).toEqual([false]);

    pointer(document.querySelectorAll(".ds-dialog__overlay")[0]!, "pointerdown");
    expect(firstUpdates).toEqual([]);
  });

  it("supports non-modal container sheets and non-dismissible system dialogs", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const updates: boolean[] = [];
    mount(Dialog, {
      props: {
        open: true,
        title: "Scoped sheet",
        portalTo: target,
        scope: "container",
        variant: "sheet",
        layer: "system",
        modal: false,
        dismissible: false,
        "onUpdate:open": (next: boolean) => updates.push(next),
      },
      slots: { default: () => h("button", "Explicit action") },
    });
    await settle();

    const dialog = target.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.classList).toContain("ds-dialog__content--container");
    expect(dialog?.classList).toContain("ds-dialog__content--sheet");
    expect(dialog?.classList).toContain("ds-dialog__content--system");
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    pointer(target.querySelector(".ds-dialog__overlay")!, "pointerdown");
    expect(updates).toEqual([]);
  });

  it("has no serious accessibility violations while open", async () => {
    mount(Dialog, {
      props: { open: true, title: "Accessible dialog", description: "Dialog details" },
      slots: { default: () => h("button", "Done") },
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
    const toast = useToast();
    toast.success({ title: "Uploaded", description: "3 files synced", duration: 10_000 });
    toast.error({ title: "Failed", duration: 10_000 });
    const wrapper = mount(ToastHost);
    await settle();

    const items = wrapper.findAll<HTMLElement>(".ds-toast");
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("role")).toBe("status");
    expect(items[1]?.getAttribute("role")).toBe("alert");

    wrapper.find<HTMLButtonElement>(".ds-toast__close").click();
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.findAll(".ds-toast")).toHaveLength(1);
  });

  it("flushes pre-mount calls and updates through the provider queue", async () => {
    vi.useFakeTimers();
    const toast = useToast();
    const id = toast.info({ title: "Uploading", duration: 10_000 });
    const wrapper = mount(ToastHost);
    await settle();

    expect(wrapper.find(".ds-toast").textContent).toContain("Uploading");
    toast.update(id, { title: "Uploaded", tone: "success" });
    await nextTick();

    expect(wrapper.find(".ds-toast").textContent).toContain("Uploaded");
  });

  it("retains active toasts across provider remounts", async () => {
    vi.useFakeTimers();
    useToast().info({ title: "Still active", duration: 10_000 });

    const firstHost = mount(ToastHost);
    await settle();
    expect(firstHost.find(".ds-toast").textContent).toContain("Still active");

    firstHost.unmount();
    const secondHost = mount(ToastHost);
    await settle();
    expect(secondHost.find(".ds-toast").textContent).toContain("Still active");
  });

  it("auto-dismisses while pausing the remaining timer on hover and focus", async () => {
    vi.useFakeTimers();
    useToast().info({ title: "Paused", duration: 100 });
    const wrapper = mount(ToastHost);
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

    useToast().warning({ title: "Focus paused", duration: 50 });
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
    useToast().info({ title: "Swipe me", duration: 10_000 });
    const wrapper = mount(ToastHost);
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
    const toast = useToast();
    toast.info({ title: "Information", duration: 10_000 });
    toast.warning({ title: "Warning", description: "Review this", duration: 10_000 });
    const wrapper = mount(ToastHost);
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
