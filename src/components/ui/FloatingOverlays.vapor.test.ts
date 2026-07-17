import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import HoverCard from "./HoverCard.vue";
import Tooltip from "./Tooltip.vue";

const mounted: VaporMount[] = [];

function button(text: string, onClick?: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  if (onClick !== undefined) element.addEventListener("click", onClick);
  return element;
}

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

function pointer(element: Element, type: string, pointerType = "mouse"): void {
  element.dispatchEvent(new PointerEvent(type, { bubbles: false, pointerType }));
}

async function settlePosition(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.querySelectorAll("[data-floating-test-portal]").forEach((element) => element.remove());
});

describe("Tooltip", () => {
  it("opens after hover delay, attaches ARIA and closes on Escape", async () => {
    vi.useFakeTimers();
    const wrapper = mount(Tooltip, {
      props: { label: "More info", delayDuration: 100 },
      slots: { default: () => button("Trigger") },
    });
    const trigger = wrapper.find<HTMLButtonElement>("button");

    pointer(trigger, "pointerenter");
    await vi.advanceTimersByTimeAsync(99);
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await settlePosition();
    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.textContent).toContain("More info");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip?.id);
    expect(tooltip?.style.position).toBe("fixed");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });

  it("supports focus, rich content and a custom portal", async () => {
    vi.useFakeTimers();
    const portal = document.createElement("div");
    portal.dataset.floatingTestPortal = "";
    document.body.appendChild(portal);
    const wrapper = mount(Tooltip, {
      props: { delayDuration: 0, portalTo: portal },
      slots: {
        default: () => button("Trigger"),
        content: "<strong>Rich help</strong>",
      },
    });

    wrapper.find<HTMLButtonElement>("button").focus();
    await vi.runAllTimersAsync();
    await settlePosition();
    expect(portal.querySelector("strong")?.textContent).toBe("Rich help");
    expect(portal.querySelector(".ds-tooltip__arrow")).not.toBeNull();
  });

  it("keeps a disabled trigger interactive without rendering content", async () => {
    vi.useFakeTimers();
    let clicks = 0;
    const wrapper = mount(Tooltip, {
      props: { disabled: true, label: "Hidden" },
      slots: { default: () => button("Trigger", () => clicks++) },
    });
    const trigger = wrapper.find<HTMLButtonElement>("button");
    trigger.click();
    pointer(trigger, "pointerenter");
    await vi.runAllTimersAsync();

    expect(clicks).toBe(1);
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });
});

describe("HoverCard", () => {
  it("honors open/close delays and keeps the panel open while hovered", async () => {
    vi.useFakeTimers();
    const updates: boolean[] = [];
    const wrapper = mount(HoverCard, {
      props: {
        openDelay: 80,
        closeDelay: 60,
        "onUpdate:open": (next: boolean) => updates.push(next),
      },
      slots: {
        default: () => button("Preview"),
        content: "<div>Preview content</div>",
      },
    });
    const trigger = wrapper.find<HTMLButtonElement>("button");

    pointer(trigger, "pointerenter");
    await vi.advanceTimersByTimeAsync(80);
    await settlePosition();
    const panel = document.body.querySelector<HTMLElement>(".ds-hover-card");
    expect(panel?.textContent).toContain("Preview content");
    expect(updates).toEqual([true]);

    pointer(trigger, "pointerleave");
    pointer(panel!, "pointerenter");
    await vi.advanceTimersByTimeAsync(60);
    expect(document.body.querySelector(".ds-hover-card")).not.toBeNull();

    pointer(panel!, "pointerleave");
    await vi.advanceTimersByTimeAsync(60);
    await nextTick();
    expect(document.body.querySelector(".ds-hover-card")).toBeNull();
    expect(updates).toEqual([true, false]);
  });

  it("positions from a virtual reference and supports default open", async () => {
    const reference = {
      getBoundingClientRect: () => new DOMRect(120, 80, 20, 20),
    };
    mount(HoverCard, {
      props: { defaultOpen: true, reference, side: "right", sideOffset: 12 },
      slots: {
        default: () => button("Preview"),
        content: "<div>Virtual preview</div>",
      },
    });

    await settlePosition();
    const panel = document.body.querySelector<HTMLElement>(".ds-hover-card");
    expect(panel?.textContent).toContain("Virtual preview");
    expect(panel?.style.position).toBe("fixed");
    expect(panel?.dataset.side).toMatch(/right|left/);
  });

  it("emits controlled state requests and hides all content when disabled", async () => {
    vi.useFakeTimers();
    const updates: boolean[] = [];
    const controlled = mount(HoverCard, {
      props: {
        open: false,
        openDelay: 0,
        "onUpdate:open": (next: boolean) => updates.push(next),
      },
      slots: {
        default: () => button("Preview"),
        content: "<div>Controlled content</div>",
      },
    });
    pointer(controlled.find("button"), "pointerenter");
    await vi.runAllTimersAsync();
    expect(updates).toEqual([true]);
    expect(document.body.querySelector(".ds-hover-card")).toBeNull();

    const disabled = mount(HoverCard, {
      props: { defaultOpen: true, disabled: true },
      slots: {
        default: () => button("Disabled preview"),
        content: "<div>Must stay hidden</div>",
      },
    });
    expect(disabled.find("button").textContent).toBe("Disabled preview");
    expect(document.body.textContent).not.toContain("Must stay hidden");
  });
});
