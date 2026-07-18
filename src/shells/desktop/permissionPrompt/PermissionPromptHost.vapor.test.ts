import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw, nextTick } from "vue";

/**
 * Helper: flush microtasks AND a paint frame. The teleported dialog
 * mounts asynchronously via `Teleport` after the parent renders, so
 * `flushPromises()` alone (which only drains microtasks) is not
 * enough — we need at least one extra `nextTick` for the portal to
 * land in `document.body`.
 */
async function flushAndPaint(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

import { kernel } from "~/core/kernel";
import { usePermissionStore } from "~/core/permissions/PermissionStore";
import type { AppManifest } from "~/types/app";
import { KernelInjectionKey } from "~/types/kernel";
import {
  ACTIVE_MODAL_DIALOG_SELECTOR,
  finishLeavingModals,
  queryActiveModalDialog,
} from "~/test/ropavModal";

import PermissionPromptHost from "./PermissionPromptHost.vue";

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

describe("PermissionPromptHost (desktop, M3.5)", () => {
  // body underneath it causes a `null insertBefore` race when the
  let activeWrapper: ReturnType<typeof mount> | null = null;

  function mountHost() {
    activeWrapper = mount(PermissionPromptHost, {
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

  it("does not render any dialog when no permission is pending", () => {
    mountHost();
    expect(queryActiveModalDialog()).toBeNull();
  });

  it("renders the dialog when a non-system enqueue fires + shows the app name + permission copy", async () => {
    kernel.apps.register(makeManifest("rss-reader", "RSS Reader", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss-reader" });

    await flushAndPaint();

    const dialog = queryActiveModalDialog();
    const overlay = document.body.querySelector(".ds-permission-prompt__overlay");
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("ds-permission-prompt__panel--system")).toBe(true);
    expect(overlay?.classList.contains("ds-permission-prompt__overlay--system")).toBe(true);
    expect(dialog?.textContent).toContain("RSS Reader");
    expect(dialog?.textContent).toContain("send you notifications");
    expect(dialog?.textContent).toContain("Don't allow");
    expect(dialog?.textContent).toContain("Allow once");
    expect(dialog?.textContent).toContain("Allow and remember");

    activeDialogButton("Don't allow").click();
    await expect(pending).resolves.toBeNull();
  });

  it("Allow once → resolves with id, does NOT persist to KV", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Allow once").click();

    const id = await pending;
    expect(typeof id).toBe("string");

    // Allow once must NOT write to the store — next enqueue should re-prompt.
    expect(usePermissionStore().get("rss", "notifications.post")).toBeUndefined();
  });

  it("Allow and remember → resolves with id AND persists granted: true", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Allow and remember").click();

    await expect(pending).resolves.toEqual(expect.any(String));
    expect(usePermissionStore().get("rss", "notifications.post")?.granted).toBe(true);
  });

  it("Don't allow → resolves with null AND persists granted: false", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    activeDialogButton("Don't allow").click();

    await expect(pending).resolves.toBeNull();
    expect(usePermissionStore().get("rss", "notifications.post")?.granted).toBe(false);
  });

  it("queues concurrent requests — second one renders after first resolves", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    kernel.apps.register(makeManifest("weather", "Weather", "productivity"));
    mountHost();

    const pendingA = kernel.notifications.enqueue({ title: "a" }, { manifestId: "rss" });
    const pendingB = kernel.notifications.enqueue({ title: "b" }, { manifestId: "weather" });
    await flushAndPaint();

    expect(document.body.querySelectorAll(ACTIVE_MODAL_DIALOG_SELECTOR)).toHaveLength(1);
    expect(queryActiveModalDialog()?.textContent).toContain("RSS");

    activeDialogButton("Allow once").click();
    await pendingA;
    await flushAndPaint();

    expect(queryActiveModalDialog()?.textContent).toContain("Weather");

    activeDialogButton("Allow once").click();
    await pendingB;
    await flushAndPaint();

    expect(queryActiveModalDialog()).toBeNull();
  });

  it("shows a 'N more pending' hint in the description while the queue is non-empty", async () => {
    kernel.apps.register(makeManifest("a", "App A", "productivity"));
    kernel.apps.register(makeManifest("b", "App B", "productivity"));
    mountHost();

    const pendingA = kernel.notifications.enqueue({ title: "a" }, { manifestId: "a" });
    const pendingB = kernel.notifications.enqueue({ title: "b" }, { manifestId: "b" });
    await flushAndPaint();

    const dialog = queryActiveModalDialog();
    expect(dialog?.textContent).toContain("1 more pending");

    activeDialogButton("Don't allow").click();
    await pendingA;
    await flushAndPaint();
    activeDialogButton("Don't allow").click();
    await pendingB;
  });
});
