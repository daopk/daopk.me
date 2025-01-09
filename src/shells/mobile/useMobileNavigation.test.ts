import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type ComputedRef, type DeepReadonly, type Ref } from "vue";

import type { AppHandle } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { __resetNavigationForTest } from "./navigation";
import { useMobileNavigation } from "./useMobileNavigation";
import type { NavigationFrame } from "./navigation";

let launchCounter = 0;

function makeKernelMock(): Pick<Kernel, "apps" | "processes"> {
  return {
    apps: {
      list: () => [],
      register: vi.fn(),
      async launch(manifestId: string): Promise<AppHandle> {
        launchCounter += 1;
        return {
          id: `h-${launchCounter}`,
          manifestId,
          on: () => () => undefined,
          postMessage: () => undefined,
        };
      },
      unregister: vi.fn(),
    },
    processes: {
      spawn: vi.fn(),
      kill: vi.fn(),
      suspend: vi.fn(),
      resume: vi.fn(),
      list: () =>
        [][Symbol.iterator]() as IterableIterator<[string, { state: string; manifestId: string }]>,
    },
  };
}

let currentKernel: Pick<Kernel, "apps" | "processes">;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "processes"> {
    return currentKernel;
  },
}));

interface Exposed {
  readonly nav: {
    readonly currentFrame: ComputedRef<NavigationFrame | null>;
    readonly foreground: Readonly<Ref<string | null>>;
    readonly stack: DeepReadonly<NavigationFrame[]>;
    readonly depth: ComputedRef<number>;
    launch(manifestId: string): Promise<void>;
    goHome(): void;
    focusFrame(frameId: string): void;
    dismiss(frameId: string): void;
    dismissAll(): void;
  };
}

function mountHarness() {
  const Comp = defineComponent({
    setup() {
      const nav = useMobileNavigation();
      return { nav };
    },
    template: "<span />",
  });
  return mount(Comp);
}

describe("useMobileNavigation (v2 — back-as-suspend)", () => {
  beforeEach(() => {
    launchCounter = 0;
    __resetNavigationForTest();
    window.history.replaceState(null, "", "/");
    currentKernel = makeKernelMock();
  });

  afterEach(() => {
    __resetNavigationForTest();
  });

  it("exposes currentFrame=null, foreground=null, depth=0 when stack is empty", () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    expect(nav.currentFrame.value).toBeNull();
    expect(nav.foreground.value).toBeNull();
    expect(nav.depth.value).toBe(0);

    wrapper.unmount();
  });

  it("reactively tracks launches and goHome (back-as-suspend keeps frame alive)", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");

    expect(nav.depth.value).toBe(1);
    expect(nav.currentFrame.value?.manifestId).toBe("about");
    expect(nav.foreground.value).not.toBeNull();

    nav.goHome();

    expect(nav.depth.value).toBe(1);
    expect(nav.foreground.value).toBeNull();
    expect(nav.currentFrame.value).toBeNull();

    wrapper.unmount();
  });

  it("currentFrame is foreground-derived, not stack[last]", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");
    await nav.launch("_template");

    const a = nav.stack[0];
    const b = nav.stack[1];

    expect(nav.currentFrame.value?.frameId).toBe(b.frameId);

    nav.focusFrame(a.frameId);

    expect(nav.currentFrame.value?.frameId).toBe(a.frameId);
    expect(nav.stack[1].frameId).toBe(b.frameId);

    wrapper.unmount();
  });

  it("forwards focusFrame to the orchestrator (M1.3.4 select wiring)", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");
    const a = nav.stack[0];
    await nav.launch("_template");

    nav.focusFrame(a.frameId);

    expect(nav.foreground.value).toBe(a.frameId);

    wrapper.unmount();
  });

  it("forwards dismiss(frameId) to the orchestrator (mid-stack splice + kill)", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");
    await nav.launch("_template");
    await nav.launch("third");

    expect(nav.depth.value).toBe(3);
    const midFrame = nav.stack[1];

    nav.dismiss(midFrame.frameId);

    expect(nav.depth.value).toBe(2);
    expect(nav.stack.map((f) => f.frameId)).not.toContain(midFrame.frameId);
    expect(currentKernel.processes.kill).toHaveBeenCalledWith(midFrame.handleId, "user");

    wrapper.unmount();
  });

  it("forwards dismissAll() to the orchestrator", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");
    await nav.launch("_template");

    const handles = nav.stack.map((frame) => frame.handleId);

    nav.dismissAll();

    expect(nav.depth.value).toBe(0);
    expect(nav.foreground.value).toBeNull();
    expect(currentKernel.processes.kill).toHaveBeenCalledTimes(2);
    expect(currentKernel.processes.kill).toHaveBeenNthCalledWith(1, handles[0], "user");
    expect(currentKernel.processes.kill).toHaveBeenNthCalledWith(2, handles[1], "user");

    wrapper.unmount();
  });

  it("relaunching a manifest already alive resumes the existing frame (no duplicate)", async () => {
    const wrapper = mountHarness();
    const { nav } = wrapper.vm as unknown as Exposed;

    await nav.launch("about");
    const first = nav.stack[0];

    nav.goHome();
    expect(nav.foreground.value).toBeNull();

    await nav.launch("about");

    expect(nav.depth.value).toBe(1);
    expect(nav.stack[0].frameId).toBe(first.frameId);
    expect(nav.foreground.value).toBe(first.frameId);

    wrapper.unmount();
  });
});
