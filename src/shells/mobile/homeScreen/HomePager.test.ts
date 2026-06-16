import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";

import HomePager from "./HomePager.vue";

vi.mock("~/composables/useReducedMotion", () => ({
  useReducedMotion: () => ({ reduced: { value: false } }),
}));

interface PagerExposed {
  currentPageIndex: number;
  seek: (index: number) => void;
}

function mountPager(props: Record<string, unknown> = {}): {
  wrapper: ReturnType<typeof mount>;
  scrollEl: HTMLElement;
  pagerVm: PagerExposed;
} {
  const wrapper = mount(HomePager, {
    attachTo: document.body,
    props: { pageCount: 2, storageKey: null, ...props },
    slots: {
      "page-0": () => h("div", { class: "test-page", "data-page": "0" }, "Icons"),
      "page-1": () => h("div", { class: "test-page", "data-page": "1" }, "Widgets"),
    },
  });

  const scrollEl = wrapper.find(".home-pager").element as HTMLElement;

  Object.defineProperty(scrollEl, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 320,
      height: 600,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 600,
    }),
  });

  let scrollLeft = 0;
  Object.defineProperty(scrollEl, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = v;
    },
  });

  Object.defineProperty(scrollEl, "scrollTo", {
    configurable: true,
    value: (opts: { left: number }): void => {
      scrollLeft = opts.left;
    },
  });

  return {
    wrapper,
    scrollEl,
    pagerVm: wrapper.vm as unknown as PagerExposed,
  };
}

describe("HomePager (M1.4)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("renders one slot per pageCount", () => {
    const { wrapper } = mountPager({ pageCount: 2 });
    const pages = wrapper.findAll(".home-pager__page");
    expect(pages.length).toBe(2);
    expect(pages[0].text()).toBe("Icons");
    expect(pages[1].text()).toBe("Widgets");
  });

  it("derives currentPageIndex from scrollLeft after a scroll event", async () => {
    const { scrollEl, pagerVm } = mountPager();

    expect(pagerVm.currentPageIndex).toBe(0);

    scrollEl.scrollLeft = 320;
    scrollEl.dispatchEvent(new Event("scroll"));

    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect(pagerVm.currentPageIndex).toBe(1);
  });

  it("emits page-change exactly once per real index transition", async () => {
    const { wrapper, scrollEl } = mountPager();

    scrollEl.scrollLeft = 320;
    scrollEl.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    scrollEl.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const events = wrapper.emitted("page-change");
    expect(events).toBeTruthy();
    expect(events?.length).toBe(1);
    expect(events?.[0]).toEqual([1]);
  });

  it("ArrowRight / ArrowLeft seek within bounds", async () => {
    const { wrapper, pagerVm } = mountPager({ pageCount: 3 });

    const root = wrapper.find(".home-pager");

    await root.trigger("keydown", { key: "ArrowRight" });
    expect(pagerVm.currentPageIndex).toBe(1);

    await root.trigger("keydown", { key: "ArrowRight" });
    expect(pagerVm.currentPageIndex).toBe(2);

    await root.trigger("keydown", { key: "ArrowRight" });
    expect(pagerVm.currentPageIndex).toBe(2);

    await root.trigger("keydown", { key: "ArrowLeft" });
    expect(pagerVm.currentPageIndex).toBe(1);

    await root.trigger("keydown", { key: "ArrowLeft" });
    expect(pagerVm.currentPageIndex).toBe(0);

    await root.trigger("keydown", { key: "ArrowLeft" });
    expect(pagerVm.currentPageIndex).toBe(0);
  });

  it("seek(index) navigates to the given page", () => {
    const { pagerVm, scrollEl } = mountPager();

    pagerVm.seek(1);
    expect(pagerVm.currentPageIndex).toBe(1);
    expect(scrollEl.scrollLeft).toBe(320);
  });

  it("persists currentPageIndex to sessionStorage and restores on mount", async () => {
    const STORAGE_KEY = "test:pager-storage";

    const first = mountPager({ pageCount: 2, storageKey: STORAGE_KEY });
    first.pagerVm.seek(1);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("1");
    first.wrapper.unmount();

    const second = mountPager({ pageCount: 2, storageKey: STORAGE_KEY });
    expect(second.pagerVm.currentPageIndex).toBe(1);
    expect(second.wrapper.emitted("page-change")).toEqual([[1]]);
  });

  it("clamps out-of-range persisted indices", () => {
    const STORAGE_KEY = "test:pager-clamp";
    sessionStorage.setItem(STORAGE_KEY, "99");

    const { pagerVm } = mountPager({ pageCount: 2, storageKey: STORAGE_KEY });
    expect(pagerVm.currentPageIndex).toBe(1);
  });

  it("handles NaN persisted values without throwing", () => {
    const STORAGE_KEY = "test:pager-nan";
    sessionStorage.setItem(STORAGE_KEY, "not-a-number");

    const { pagerVm } = mountPager({ pageCount: 2, storageKey: STORAGE_KEY });
    expect(pagerVm.currentPageIndex).toBe(0);
  });

  it("clamps currentPageIndex when pageCount shrinks at runtime", async () => {
    const { wrapper, pagerVm } = mountPager({ pageCount: 3 });
    pagerVm.seek(2);
    expect(pagerVm.currentPageIndex).toBe(2);

    await wrapper.setProps({ pageCount: 1, storageKey: null });
    expect(pagerVm.currentPageIndex).toBe(0);
  });

  it("applies pageLabels prop to aria-label of each page region", () => {
    const { wrapper } = mountPager({
      pageCount: 2,
      pageLabels: ["Apps", "Widgets"],
    });

    const regions = wrapper.findAll('[role="region"]');
    expect(regions[0].attributes("aria-label")).toBe("Apps");
    expect(regions[1].attributes("aria-label")).toBe("Widgets");
  });
});
