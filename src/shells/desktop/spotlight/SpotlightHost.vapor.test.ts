import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import SpotlightHost from "./SpotlightHost.vue";
import { kernel } from "~/core/kernel";
import { useSpotlightRecentsStore } from "~/core/spotlight/SpotlightRecentsStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

// the SFC's a11y wiring (covered by Spotlight.test.ts).
vi.mock("~/components/spotlight/Spotlight.vue", async () => {
  const { defineVaporComponent } = await import("vue");
  return {
    default: defineVaporComponent(
      (_props, { emit }) => {
        const spotlight = document.createElement("div");
        spotlight.className = "spotlight-stub";
        spotlight.dataset.testid = "spotlight-stub";
        const close = document.createElement("button");
        close.className = "spotlight-stub__close";
        close.textContent = "close";
        close.addEventListener("click", () => emit("close"));
        spotlight.appendChild(close);
        return spotlight;
      },
      {
        props: ["query", "hits", "recents"],
        emits: ["update:query", "dispatch", "close"],
      },
    ),
  };
});

function dispatchKey(init: KeyboardEventInit & { key: string }): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
}

function mountHost(): ReturnType<typeof mount> {
  return mount(SpotlightHost, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });
}

describe("SpotlightHost", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    // window-level keydown listener under test. Boot is idempotent.
    await kernel.init();
  });

  afterEach(() => {
    useSpotlightRecentsStore().dispose();
    kernel.dispose();
    document.body.innerHTML = "";
  });

  it("starts with the Spotlight SFC unmounted (v-if open=false)", () => {
    const w = mountHost();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    w.unmount();
  });

  it("Meta+K opens Spotlight (mounts the SFC)", async () => {
    const w = mountHost();

    dispatchKey({ key: "k", metaKey: true });
    await nextTick();

    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);
    w.unmount();
  });

  it("Ctrl+K opens Spotlight independently of Meta (no Meta↔Ctrl aliasing)", async () => {
    const w = mountHost();

    dispatchKey({ key: "k", ctrlKey: true });
    await nextTick();

    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);
    w.unmount();
  });

  it("spotlight.open.requested opens Spotlight without toggling it closed", async () => {
    const w = mountHost();

    kernel.events.emit("spotlight.open.requested", { source: "dock" });
    await nextTick();

    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    kernel.events.emit("spotlight.open.requested", { source: "dock" });
    await nextTick();

    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);
    w.unmount();
  });

  it("Meta+K toggles closed when palette is already open", async () => {
    const w = mountHost();

    dispatchKey({ key: "k", metaKey: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    dispatchKey({ key: "k", metaKey: true });
    await nextTick();
    await vi.waitFor(() => expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false));

    w.unmount();
  });

  it("calls preventDefault on the matched keydown so browser defaults don't fire", () => {
    const w = mountHost();

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    w.unmount();
  });

  it("IME composition keypresses (isComposing=true) do NOT toggle the palette", async () => {
    const w = mountHost();

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    Object.defineProperty(event, "isComposing", { value: true });
    window.dispatchEvent(event);
    await nextTick();

    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    w.unmount();
  });

  it("auto-repeat keydown events do NOT re-trigger the toggle", async () => {
    const w = mountHost();

    dispatchKey({ key: "k", metaKey: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    dispatchKey({ key: "k", metaKey: true, repeat: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    w.unmount();
  });

  it("close emit from the SFC closes the palette", async () => {
    const w = mountHost();
    dispatchKey({ key: "k", metaKey: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    await w.find(".spotlight-stub__close").trigger("click");
    await vi.waitFor(() => expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false));

    w.unmount();
  });

  it("unmounting the host detaches the shortcut listeners", async () => {
    const w = mountHost();
    w.unmount();

    dispatchKey({ key: "k", metaKey: true });
    await nextTick();

    expect(document.body.querySelector("[data-testid='spotlight-stub']")).toBeNull();
  });

  it("unmounting the host detaches the spotlight.open.requested listener", async () => {
    const w = mountHost();
    w.unmount();

    kernel.events.emit("spotlight.open.requested", { source: "dock" });
    await nextTick();

    expect(document.body.querySelector("[data-testid='spotlight-stub']")).toBeNull();
  });

  it("modifier-mismatch chords do NOT toggle (Shift+K, plain K)", async () => {
    const w = mountHost();

    dispatchKey({ key: "k" });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false);

    dispatchKey({ key: "k", shiftKey: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false);

    dispatchKey({ key: "k", metaKey: true, shiftKey: true });
    await nextTick();
    expect(w.find('[data-testid="spotlight-stub"]').exists()).toBe(false);

    w.unmount();
  });
});
