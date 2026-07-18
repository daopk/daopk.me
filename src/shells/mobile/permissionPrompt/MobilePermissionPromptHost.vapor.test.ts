import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw, nextTick } from "vue";

import { kernel } from "~/core/kernel";
import { usePermissionStore } from "~/core/permissions/PermissionStore";
import type { AppManifest } from "~/types/app";
import { KernelInjectionKey } from "~/types/kernel";
import { finishLeavingModals, queryActiveModalDialog } from "~/test/ropavModal";

import MobilePermissionPromptHost from "./MobilePermissionPromptHost.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = markRaw(defineVaporComponent(() => document.createElement("svg")));

function makeManifest(id: string, name: string, category: AppManifest["category"]): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category,
    component: () => Promise.resolve({ default: StubIcon }),
  };
}

function activeDialogButton(text: string): HTMLButtonElement {
  const button = Array.from(
    queryActiveModalDialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((candidate) => candidate.textContent?.trim() === text);
  expect(button).toBeDefined();
  return button!;
}

async function flushAndPaint(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("MobilePermissionPromptHost (M3.5)", () => {
  let activeWrapper: ReturnType<typeof mount> | null = null;

  function mountHost() {
    activeWrapper = mount(MobilePermissionPromptHost, {
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    return activeWrapper;
  }

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(async () => {
    await finishLeavingModals();
    activeWrapper?.unmount();
    activeWrapper = null;
    kernel.dispose();
    localStorage.clear();
  });

  it("renders nothing when the queue is empty", () => {
    mountHost();
    expect(queryActiveModalDialog()).toBeNull();
  });

  it("renders the Ropav Modal sheet preset on open", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    const dialog = queryActiveModalDialog();
    const overlay = document.body.querySelector(".ds-permission-prompt__overlay");
    expect(dialog).not.toBeNull();
    expect(dialog?.className).toContain("ds-permission-prompt__panel--sheet");
    expect(dialog?.className).toContain("ds-permission-prompt__panel--system");
    expect(overlay?.className).toContain("ds-permission-prompt__overlay--system");

    activeDialogButton("Don't allow").click();
    await expect(pending).resolves.toBeNull();
  });

  it("Allow and remember persists granted=true and resolves with id", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Allow and remember").click();

    await expect(pending).resolves.toEqual(expect.any(String));
    expect(usePermissionStore().get("rss", "notifications.post")?.granted).toBe(true);
  });

  it("Don't allow persists granted=false and resolves with null", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Don't allow").click();

    await expect(pending).resolves.toBeNull();
    expect(usePermissionStore().get("rss", "notifications.post")?.granted).toBe(false);
  });

  it("Allow once does NOT persist", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Allow once").click();

    await expect(pending).resolves.toEqual(expect.any(String));
    expect(usePermissionStore().get("rss", "notifications.post")).toBeUndefined();
  });
});
