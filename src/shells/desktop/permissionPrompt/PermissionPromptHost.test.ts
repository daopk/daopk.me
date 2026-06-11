import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, markRaw, nextTick, type Component } from "vue";

/**
 * Helper: flush microtasks AND a paint frame. reka-ui's DialogPortal
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

import PermissionPromptHost from "./PermissionPromptHost.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(defineComponent({ template: "<svg />" }));

function makeManifest(id: string, name: string, category: AppManifest["category"]): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category,
    component: () => Promise.resolve({ default: StubIcon }),
  };
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

  afterEach(() => {
    activeWrapper?.unmount();
    activeWrapper = null;
    kernel.dispose();
    localStorage.clear();
  });

  it("does not render any dialog when no permission is pending", () => {
    mountHost();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the dialog when a non-system enqueue fires + shows the app name + permission copy", async () => {
    kernel.apps.register(makeManifest("rss-reader", "RSS Reader", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss-reader" });

    await flushAndPaint();

    const dialog = document.body.querySelector('[role="dialog"]');
    const overlay = document.body.querySelector(".ds-dialog__overlay");
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("ds-dialog__content--system")).toBe(true);
    expect(overlay?.classList.contains("ds-dialog__overlay--system")).toBe(true);
    expect(dialog?.textContent).toContain("RSS Reader");
    expect(dialog?.textContent).toContain("send you notifications");
    expect(dialog?.textContent).toContain("Don't allow");
    expect(dialog?.textContent).toContain("Allow once");
    expect(dialog?.textContent).toContain("Allow and remember");

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    const dontAllow = buttons.find((b) => b.textContent?.trim() === "Don't allow");
    expect(dontAllow).toBeDefined();
    dontAllow!.click();
    await expect(pending).resolves.toBeNull();
  });

  it("Allow once → resolves with id, does NOT persist to KV", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    const allowOnce = buttons.find((b) => b.textContent?.trim() === "Allow once");
    allowOnce!.click();

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

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    const allowRemember = buttons.find((b) => b.textContent?.trim() === "Allow and remember");
    allowRemember!.click();

    await expect(pending).resolves.toEqual(expect.any(String));
    expect(usePermissionStore().get("rss", "notifications.post")?.granted).toBe(true);
  });

  it("Don't allow → resolves with null AND persists granted: false", async () => {
    kernel.apps.register(makeManifest("rss", "RSS", "productivity"));
    mountHost();

    const pending = kernel.notifications.enqueue({ title: "x" }, { manifestId: "rss" });
    await flushAndPaint();

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    const deny = buttons.find((b) => b.textContent?.trim() === "Don't allow");
    deny!.click();

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

    expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("RSS");

    const buttonsA = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    buttonsA.find((b) => b.textContent?.trim() === "Allow once")!.click();
    await pendingA;
    await flushAndPaint();

    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Weather");

    const buttonsB = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    buttonsB.find((b) => b.textContent?.trim() === "Allow once")!.click();
    await pendingB;
    await flushAndPaint();

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows a 'N more pending' hint in the description while the queue is non-empty", async () => {
    kernel.apps.register(makeManifest("a", "App A", "productivity"));
    kernel.apps.register(makeManifest("b", "App B", "productivity"));
    mountHost();

    const pendingA = kernel.notifications.enqueue({ title: "a" }, { manifestId: "a" });
    const pendingB = kernel.notifications.enqueue({ title: "b" }, { manifestId: "b" });
    await flushAndPaint();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("1 more pending");

    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    buttons.find((b) => b.textContent?.trim() === "Don't allow")!.click();
    await pendingA;
    await flushAndPaint();
    const buttons2 = [...document.body.querySelectorAll<HTMLButtonElement>("button")];
    buttons2.find((b) => b.textContent?.trim() === "Don't allow")!.click();
    await pendingB;
  });
});
