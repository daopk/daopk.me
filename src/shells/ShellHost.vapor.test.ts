import {
  mountVaporTest,
  type VaporTestComponent,
  type VaporTestMountOptions,
} from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShellHost from "./ShellHost.vue";

import { KernelInjectionKey } from "~/types/kernel";
import type { Kernel } from "~/types/kernel";
import type { DeviceProfile, ShellId } from "~/types/shell";

function mount(component: VaporTestComponent, options: VaporTestMountOptions = {}) {
  return mountVaporTest(component, { ...options, toastProvider: true });
}

const shellHostMocks = vi.hoisted(() => ({
  breakpointProfile: null as unknown as { value: DeviceProfile },
  pickShell: vi.fn(),
}));

function profileFor(formFactor: DeviceProfile["formFactor"]): DeviceProfile {
  const isMobile = formFactor === "mobile";
  return {
    formFactor,
    prefersReducedMotion: false,
    prefersColorScheme: "light",
    hasHover: !isMobile,
    hasTouch: isMobile,
    pointerCoarse: isMobile ? "coarse" : "fine",
    viewportWidth: isMobile ? 390 : 1440,
    viewportHeight: isMobile ? 844 : 900,
  };
}

vi.mock("~/core/boot/autorun", () => ({
  runAutorunManifests: vi.fn(async () => undefined),
  resetAutorunLatch: vi.fn(),
}));

vi.mock("~/core/routing/appUrlIntents", () => ({
  consumeInitialAppUrlIntent: vi.fn(() => false),
  isFirstPartyAppProtocolUrl: vi.fn((href: string) => href.startsWith("youtube-player://")),
  parseAppProtocolIntent: vi.fn((href: string) => {
    const url = new URL(href);
    const videoId = url.hostname === "video" ? url.pathname.slice(1).replace(/\/$/, "") : "";
    return videoId.length > 0
      ? {
          kind: "app",
          manifestId: "youtube-player",
          args: { videoId },
        }
      : { kind: "none" };
  }),
  resetInitialAppUrlIntentLatch: vi.fn(),
}));

vi.mock("~/composables/useBreakpoint", async () => {
  const { ref } = await import("vue");
  shellHostMocks.breakpointProfile = ref(profileFor("desktop"));

  return {
    useBreakpoint: () => ({
      profile: shellHostMocks.breakpointProfile,
    }),
  };
});

vi.mock("~/components/auth/SessionLockOverlay.vue", async () => {
  const { defineVaporComponent } = await import("vue");
  return {
    default: defineVaporComponent(() => {
      const overlay = document.createElement("div");
      overlay.dataset.sessionLockOverlay = "";
      return overlay;
    }),
  };
});

vi.mock("~/shells/shellRegistry", async () => {
  const { defineVaporComponent } = await import("vue");
  const fakeShell = (className: string, text: string) =>
    defineVaporComponent(() => {
      const shell = document.createElement("main");
      shell.className = `fake-shell ${className}`;
      shell.textContent = text;
      return shell;
    });
  const components = {
    desktop: fakeShell("fake-desktop-shell", "desktop shell"),
    mobile: fakeShell("fake-mobile-shell", "mobile shell"),
  };

  shellHostMocks.pickShell.mockImplementation((profile: DeviceProfile, sticky?: ShellId) => {
    const shellId = sticky ?? (profile.formFactor === "mobile" ? "mobile" : "desktop");
    return {
      shellId,
      component: components[shellId],
    };
  });

  return {
    peekShellStickyOverride: () => undefined,
    pickShell: shellHostMocks.pickShell,
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
    shellHostMocks.breakpointProfile.value = profileFor("desktop");
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete document.documentElement.dataset.shell;
    delete document.documentElement.dataset.pointer;
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
      },
    });

    expect(wrapper.find(".fake-desktop-shell").exists()).toBe(true);

    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await Promise.resolve();

    expect(eventsEmit).toHaveBeenCalledWith("shell.changed", expect.any(Object));
    expect(scheduleIdle).toHaveBeenCalledTimes(1);
    expect(scheduleIdle).toHaveBeenCalledWith(expect.any(Function));
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledTimes(1);
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledWith(kernel, undefined, {
      onUnknownApp: expect.any(Function),
    });
    expect(runAutorunManifests).toHaveBeenCalledTimes(1);
    expect(runAutorunManifests).toHaveBeenCalledWith(kernel);

    expect(eventsEmit).toHaveBeenCalledTimes(1);
    expect(scheduleIdle).toHaveBeenCalledTimes(1);
    expect(consumeInitialAppUrlIntent).toHaveBeenCalledTimes(1);
    expect(runAutorunManifests).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("keeps the boot-selected shell when the viewport profile later changes", async () => {
    const { kernel } = makeFakeKernel();

    const wrapper = mount(ShellHost, {
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });

    await wrapper.vm.$nextTick();
    await Promise.resolve();

    expect(shellHostMocks.pickShell).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".fake-desktop-shell").exists()).toBe(true);
    expect(document.documentElement.dataset.shell).toBe("desktop");

    shellHostMocks.breakpointProfile.value = profileFor("mobile");
    await wrapper.vm.$nextTick();

    expect(shellHostMocks.pickShell).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".fake-desktop-shell").exists()).toBe(true);
    expect(wrapper.find(".fake-mobile-shell").exists()).toBe(false);
    expect(document.documentElement.dataset.shell).toBe("desktop");
    expect(document.documentElement.dataset.pointer).toBe("coarse");

    wrapper.unmount();
  });

  it("captures first-party app protocol links and routes them through the shell", async () => {
    const { kernel, eventsEmit } = makeFakeKernel();

    const wrapper = mount(ShellHost, {
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await wrapper.vm.$nextTick();

    eventsEmit.mockClear();

    const link = document.createElement("a");
    link.setAttribute("href", "youtube-player://video/M7lc1UVf-VE");
    wrapper.element.appendChild(link);

    const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { videoId: "M7lc1UVf-VE" },
    });

    wrapper.unmount();
  });
});
