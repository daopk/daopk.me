import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShellHost from "./ShellHost.vue";

import { KernelInjectionKey } from "~/types/kernel";
import type { Kernel } from "~/types/kernel";

vi.mock("~/core/boot/autorun", () => ({
  runAutorunManifests: vi.fn(async () => undefined),
  resetAutorunLatch: vi.fn(),
}));

vi.mock("~/core/routing/appUrlIntents", () => ({
  consumeInitialAppUrlIntent: vi.fn(() => false),
  resetInitialAppUrlIntentLatch: vi.fn(),
}));

vi.mock("~/composables/useBreakpoint", () => ({
  useBreakpoint: () => ({
    profile: {
      value: {
        shellPreference: "desktop",
        pointer: "fine",
        hover: "hover",
        widthBucket: "wide",
        heightBucket: "tall",
        viewportWidth: 1440,
        viewportHeight: 900,
      },
    },
  }),
}));

vi.mock("~/shells/shellRegistry", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    peekShellStickyOverride: () => undefined,
    pickShell: () => ({
      shellId: "desktop",
      component: defineComponent({
        name: "FakeDesktopShell",
        setup: () => () => h("main", { class: "fake-shell" }, "shell"),
      }),
    }),
  };
});

interface FakeKernelHandles {
  kernel: Kernel;
  scheduleIdle: ReturnType<typeof vi.fn>;
  eventsEmit: ReturnType<typeof vi.fn>;
}

function makeFakeKernel(): FakeKernelHandles {
  const scheduleIdle = vi.fn((cb: () => void): (() => void) => {
    queueMicrotask(cb);
    return (): void => {};
  });
  const eventsEmit = vi.fn();

  const kernel = {
    events: { emit: eventsEmit },
    boot: { scheduleIdleAfterShellReady: scheduleIdle },
  } as unknown as Kernel;

  return { kernel, scheduleIdle, eventsEmit };
}

describe("ShellHost — shell-ready wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("schedules URL intent + autorun when the shell first becomes ready", async () => {
    const { runAutorunManifests } = await import("~/core/boot/autorun");
    const { consumeInitialAppUrlIntent } = await import("~/core/routing/appUrlIntents");
    const { kernel, scheduleIdle, eventsEmit } = makeFakeKernel();

    const wrapper = mount(ShellHost, {
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
        stubs: {
          SessionLockOverlay: { template: "<div data-session-lock-overlay />" },
        },
      },
    });

    const transition = wrapper.findComponent({ name: "Transition" });
    expect(transition.exists()).toBe(true);

    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(eventsEmit).toHaveBeenCalledWith("shell.changed", expect.any(Object));
    expect(scheduleIdle).toHaveBeenCalledTimes(1);
    expect(scheduleIdle).toHaveBeenCalledWith(expect.any(Function));
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledTimes(1);
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledWith(kernel);
    expect(runAutorunManifests).toHaveBeenCalledTimes(1);
    expect(runAutorunManifests).toHaveBeenCalledWith(kernel);

    transition.vm.$emit("after-enter", wrapper.element);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
    expect(scheduleIdle).toHaveBeenCalledTimes(1);
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledTimes(1);
    expect(runAutorunManifests).toHaveBeenCalledTimes(1);
  });
});
