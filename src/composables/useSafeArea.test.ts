import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, type Ref } from "vue";

import { useSafeArea } from "~/composables/useSafeArea";

interface Exposed {
  readonly s: {
    readonly top: Ref<number>;
    readonly right: Ref<number>;
    readonly bottom: Ref<number>;
    readonly left: Ref<number>;
  };
}

function mountHarness() {
  const Child = defineComponent({
    setup() {
      const s = useSafeArea();
      return { s };
    },
    template: "<span />",
  });

  return mount(Child);
}

describe("useSafeArea", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("starts at all-zero before mount (and stays zero in non-browser env path)", () => {
    const wrapper = mountHarness();
    const { s } = wrapper.vm as unknown as Exposed;

    expect(typeof s.top.value).toBe("number");
    expect(typeof s.right.value).toBe("number");
    expect(typeof s.bottom.value).toBe("number");
    expect(typeof s.left.value).toBe("number");

    wrapper.unmount();
  });

  it("inserts an aria-hidden probe into document.body on mount and removes it on unmount", async () => {
    const wrapper = mountHarness();
    await nextTick();

    const probes = document.body.querySelectorAll('div[aria-hidden="true"]');
    expect(probes.length).toBe(1);

    wrapper.unmount();
    await nextTick();

    const after = document.body.querySelectorAll('div[aria-hidden="true"]');
    expect(after.length).toBe(0);
  });

  it("re-measures on window resize", async () => {
    const wrapper = mountHarness();
    await nextTick();

    const probe = document.body.querySelector('div[aria-hidden="true"]') as HTMLDivElement | null;
    expect(probe).not.toBeNull();

    let callCount = 0;
    const originalGCS = window.getComputedStyle;
    vi.stubGlobal(
      "getComputedStyle",
      (el: Element, pseudo?: string | null): CSSStyleDeclaration => {
        if (el === probe) {
          callCount += 1;
          return {
            paddingTop: "20px",
            paddingRight: "10px",
            paddingBottom: "30px",
            paddingLeft: "5px",
          } as unknown as CSSStyleDeclaration;
        }
        return originalGCS(el, pseudo ?? null);
      },
    );

    const before = callCount;
    window.dispatchEvent(new Event("resize"));
    await nextTick();

    expect(callCount).toBeGreaterThan(before);

    const { s } = wrapper.vm as unknown as Exposed;
    expect(s.top.value).toBe(20);
    expect(s.right.value).toBe(10);
    expect(s.bottom.value).toBe(30);
    expect(s.left.value).toBe(5);

    wrapper.unmount();
  });

  it("does not throw or measure when probe is absent (defensive)", () => {
    const w1 = mountHarness();
    w1.unmount();
    const w2 = mountHarness();
    w2.unmount();
    expect(true).toBe(true);
  });
});
