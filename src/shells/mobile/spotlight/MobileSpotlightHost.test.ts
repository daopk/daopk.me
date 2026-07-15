import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import MobileSpotlightHost from "./MobileSpotlightHost.vue";
import { kernel } from "~/core/kernel";
import { useSpotlightRecentsStore } from "~/core/spotlight/SpotlightRecentsStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

// without dragging in the focus trap + the full a11y wiring (covered
vi.mock("~/components/spotlight/Spotlight.vue", () => ({
  default: defineComponent({
    name: "SpotlightStub",
    props: { query: String, hits: Array, recents: Array },
    emits: ["update:query", "dispatch", "close"],
    setup() {
      return () => h("div", { "data-testid": "spotlight-stub" }, "spotlight");
    },
  }),
}));

interface PointerInit {
  pointerId?: number;
  pointerType?: "mouse" | "touch" | "pen";
  clientX?: number;
  clientY?: number;
}

function pointerEvent(type: string, init: PointerInit = {}): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(e, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "touch" },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
  });
  return e;
}

function mountHost(): {
  scrollEl: HTMLDivElement;
  setScrollTop: (n: number) => void;
  wrapper: ReturnType<typeof mount>;
  unmount: () => void;
} {
  const scrollEl = document.createElement("div");
  document.body.appendChild(scrollEl);

  let _scrollTop = 0;
  Object.defineProperty(scrollEl, "scrollTop", {
    configurable: true,
    get: () => _scrollTop,
    set: (v: number) => {
      _scrollTop = v;
    },
  });

  const scrollRef = ref<HTMLElement | null>(scrollEl);

  const Harness = defineComponent({
    setup() {
      return () =>
        h(MobileSpotlightHost, {
          scrollContainer: scrollRef.value,
        });
    },
  });

  const wrapper = mount(Harness, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });

  return {
    scrollEl,
    setScrollTop: (n: number) => {
      _scrollTop = n;
    },
    wrapper,
    unmount: () => {
      wrapper.unmount();
      scrollEl.remove();
    },
  };
}

describe("MobileSpotlightHost", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    useSpotlightRecentsStore().dispose();
    kernel.dispose();
    document.body.innerHTML = "";
  });

  it("starts with the Spotlight SFC unmounted", () => {
    const { wrapper, unmount } = mountHost();
    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    unmount();
  });

  it("opens Spotlight when a downward pull crosses the 80px distance threshold", async () => {
    const { scrollEl, wrapper, unmount } = mountHost();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 60 }));
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 100 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(true);
    unmount();
  });

  it("maps pull progress directly onto the renderer-independent peek styles", async () => {
    const { scrollEl, wrapper, unmount } = mountHost();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 40 }));
    await nextTick();

    const peek = wrapper.get(".mobile-spotlight-host__peek");
    expect(peek.attributes("style")).toContain("opacity: 0.5");
    expect(peek.attributes("style")).toContain("transform: translateY(6px)");

    unmount();
  });

  it("opens Spotlight on a short fast flick (velocity escape hatch)", async () => {
    const { scrollEl, wrapper, unmount } = mountHost();

    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    clock = 50;
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 40 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(true);
    nowSpy.mockRestore();
    unmount();
  });

  it("does NOT open when the pull is too short and too slow", async () => {
    const { scrollEl, wrapper, unmount } = mountHost();

    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    clock = 1000;
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 30 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    nowSpy.mockRestore();
    unmount();
  });

  it("does NOT open when the home grid is scrolled (scrollTop > 0 gate)", async () => {
    const { scrollEl, setScrollTop, wrapper, unmount } = mountHost();
    setScrollTop(120);

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 60 }));
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 100 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    unmount();
  });

  it("does NOT open on an upward drag (normal scroll-down intent)", async () => {
    const { scrollEl, wrapper, unmount } = mountHost();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 200 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 100 }));
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 50 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    unmount();
  });

  it("treats pointercancel as an abandon (no open) even past the distance threshold", async () => {
    // iOS Safari can preempt our gesture with a system-level swipe
    const { scrollEl, wrapper, unmount } = mountHost();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 60 }));
    scrollEl.dispatchEvent(pointerEvent("pointermove", { clientY: 90 }));
    scrollEl.dispatchEvent(pointerEvent("pointercancel", { clientY: 90 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);
    unmount();
  });

  it("releases listeners on unmount (no leaks; subsequent gestures don't open)", async () => {
    const { scrollEl, unmount } = mountHost();
    unmount();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 100 }));
    await nextTick();

    expect(document.body.querySelector("[data-testid='spotlight-stub']")).toBeNull();
  });

  it("detaches gesture listeners when scrollContainer flips element → null (M1.4 page swap)", async () => {
    // host's `useGesture` MUST detach its listeners so a subsequent
    const scrollEl = document.createElement("div");
    document.body.appendChild(scrollEl);
    Object.defineProperty(scrollEl, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: () => {},
    });

    const scrollRef = ref<HTMLElement | null>(scrollEl);
    const Harness = defineComponent({
      setup() {
        return () =>
          h(MobileSpotlightHost, {
            scrollContainer: scrollRef.value,
          });
      },
    });
    const wrapper = mount(Harness, {
      attachTo: document.body,
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });

    scrollRef.value = null;
    await nextTick();

    expect(() => {
      scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
      scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 200 }));
    }).not.toThrow();

    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(false);

    wrapper.unmount();
    scrollEl.remove();
  });

  it("re-attaches gesture listeners when scrollContainer prop transitions null → element", async () => {
    const scrollRef = ref<HTMLElement | null>(null);
    const Harness = defineComponent({
      setup() {
        return () =>
          h(MobileSpotlightHost, {
            scrollContainer: scrollRef.value,
          });
      },
    });
    const wrapper = mount(Harness, {
      attachTo: document.body,
      global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
    });

    const scrollEl = document.createElement("div");
    document.body.appendChild(scrollEl);
    scrollRef.value = scrollEl;
    await nextTick();

    scrollEl.dispatchEvent(pointerEvent("pointerdown", { clientY: 0 }));
    scrollEl.dispatchEvent(pointerEvent("pointerup", { clientY: 120 }));
    await nextTick();

    expect(wrapper.find('[data-testid="spotlight-stub"]').exists()).toBe(true);

    wrapper.unmount();
    scrollEl.remove();
  });
});
