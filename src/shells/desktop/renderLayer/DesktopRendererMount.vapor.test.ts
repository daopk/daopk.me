import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, inject, nextTick } from "vue";

import { AppKeyboardScopeInjectionKey, type AppKeyboardScope } from "~/composables/useAppKeyboard";
import { AppContextInjectionKey, type AppContext } from "~/types/app";
import type { DesktopRendererManifest } from "~/types/desktop";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

import DesktopRendererMount from "./DesktopRendererMount.vue";

function makeKernel() {
  const spawn = vi.fn(() => ({
    id: "renderer-handle",
    manifestId: "notes",
    on: vi.fn(),
    postMessage: vi.fn(),
  }));
  const kill = vi.fn();
  const kernel = {
    processes: {
      spawn,
      kill,
      suspend: vi.fn(),
      resume: vi.fn(),
      list: vi.fn(),
    },
  } as unknown as Kernel;

  return { kernel, spawn, kill };
}

describe("DesktopRendererMount", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a renderer with an app context and kills its process on unmount", async () => {
    const { kernel, spawn, kill } = makeKernel();
    const captured: { ctx: AppContext | null } = { ctx: null };
    const keyboard: { scope: AppKeyboardScope | null } = { scope: null };
    const renderer: DesktopRendererManifest = {
      id: "notes:desktop-layer",
      manifestId: "notes",
      surface: "desktop:wallpaper",
      component: () =>
        Promise.resolve({
          default: defineVaporComponent(() => {
            const context = inject(AppContextInjectionKey);
            captured.ctx = context ?? null;
            keyboard.scope = inject(AppKeyboardScopeInjectionKey) ?? null;
            const renderer = document.createElement("div");
            renderer.className = "probe-renderer";
            renderer.textContent = context?.handleId ?? "";
            return renderer;
          }),
          __esModule: true,
        } as { default: ReturnType<typeof defineVaporComponent> }),
    };

    const wrapper = mount(DesktopRendererMount, {
      attachTo: document.body,
      props: { renderer, stageSize: { width: 800, height: 600 } },
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await flushPromises();
    await nextTick();

    expect(spawn).toHaveBeenCalledWith("notes", {
      contributionId: "notes:desktop-layer",
      surface: "desktop:wallpaper",
    });
    expect(wrapper.text()).toContain("renderer-handle");
    expect(captured.ctx).toEqual({
      manifestId: "notes",
      handleId: "renderer-handle",
      args: {
        contributionId: "notes:desktop-layer",
        surface: "desktop:wallpaper",
      },
      isActive: expect.any(Function),
    });
    expect(captured.ctx?.isActive()).toBe(false);
    expect(keyboard.scope).toEqual({ ownsEvent: expect.any(Function) });
    expect(keyboard.scope?.ownsEvent(new KeyboardEvent("keydown"))).toBe(false);

    wrapper.unmount();
    await nextTick();

    expect(kill).toHaveBeenCalledWith("renderer-handle", "shell");
  });
});
