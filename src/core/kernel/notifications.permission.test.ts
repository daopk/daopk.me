import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, markRaw, type Component } from "vue";

import { usePermissionStore } from "~/core/permissions/PermissionStore";
import type { AppManifest } from "~/types/app";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(defineComponent({ template: "<svg />" }));

function makeManifest(id: string, category: AppManifest["category"]): AppManifest {
  return {
    id,
    name: id,
    icon: StubIcon,
    category,
    component: () => Promise.resolve({ default: StubIcon }),
  };
}

describe("kernel.notifications.enqueue permission gate (M3.5 contract)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    localStorage.clear();
  });

  it("non-system app with no grant: enqueue parks until respond denies", async () => {
    kernel.apps.register(makeManifest("rss-reader", "productivity"));

    const seen: Array<{ requestId: string; manifestId: string }> = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      seen.push({ requestId: payload.requestId, manifestId: payload.manifestId });
    });

    const pending = kernel.notifications.enqueue({ title: "hello" }, { manifestId: "rss-reader" });

    // The gate must have parked the promise + emitted the event.
    await Promise.resolve();
    expect(seen).toHaveLength(1);
    expect(seen[0].manifestId).toBe("rss-reader");

    kernel.permissions.respond(seen[0].requestId, { granted: false, persist: true });

    await expect(pending).resolves.toBeNull();
    stop();
  });

  it("non-system app with no grant: skipping respond never resolves enqueue", async () => {
    kernel.apps.register(makeManifest("rss-reader", "productivity"));

    let resolved = false;
    const pending = kernel.notifications
      .enqueue({ title: "hello" }, { manifestId: "rss-reader" })
      .then((id) => {
        resolved = true;
        return id;
      });

    // Race against a microtask burst — the promise must NOT resolve.
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    // teardown, so we just `await pending` after dispose finishes.
    kernel.dispose();
    setActivePinia(createPinia());
    await kernel.init();
    await expect(pending).resolves.toBeNull();
  });

  it("system app: auto-grants without prompting", async () => {
    kernel.apps.register(makeManifest("system-toasts", "system"), { source: "system" });

    const requests: unknown[] = [];
    const stopReq = kernel.events.on("permission.requested", (p) => {
      requests.push(p);
    });

    const id = await kernel.notifications.enqueue(
      { title: "boot complete" },
      { manifestId: "system-toasts" },
    );

    expect(requests).toEqual([]);
    expect(typeof id).toBe("string");
    stopReq();
  });

  it("persisted grant: enqueue resolves immediately without re-prompting", async () => {
    usePermissionStore().set("rss-reader", "notifications.post", true);
    kernel.apps.register(makeManifest("rss-reader", "productivity"));

    const requests: unknown[] = [];
    const stopReq = kernel.events.on("permission.requested", (p) => {
      requests.push(p);
    });

    const id = await kernel.notifications.enqueue(
      { title: "weather update" },
      { manifestId: "rss-reader" },
    );

    expect(requests).toEqual([]);
    expect(typeof id).toBe("string");
    stopReq();
  });

  it("persisted denial: enqueue resolves to null without re-prompting", async () => {
    usePermissionStore().set("rss-reader", "notifications.post", false);
    kernel.apps.register(makeManifest("rss-reader", "productivity"));

    const requests: unknown[] = [];
    const stopReq = kernel.events.on("permission.requested", (p) => {
      requests.push(p);
    });

    const id = await kernel.notifications.enqueue(
      { title: "weather update" },
      { manifestId: "rss-reader" },
    );

    expect(requests).toEqual([]);
    expect(id).toBeNull();
    stopReq();
  });

  it("revoking a persisted decision causes the NEXT enqueue to re-prompt", async () => {
    usePermissionStore().set("rss-reader", "notifications.post", true);
    kernel.apps.register(makeManifest("rss-reader", "productivity"));

    await expect(
      kernel.notifications.enqueue({ title: "a" }, { manifestId: "rss-reader" }),
    ).resolves.toEqual(expect.any(String));

    kernel.permissions.revoke("rss-reader", "notifications.post");

    // Second enqueue MUST prompt.
    const seen: Array<{ requestId: string }> = [];
    const stop = kernel.events.on("permission.requested", (p) => {
      seen.push({ requestId: p.requestId });
    });

    const pending = kernel.notifications.enqueue({ title: "b" }, { manifestId: "rss-reader" });
    await Promise.resolve();
    expect(seen).toHaveLength(1);

    kernel.permissions.respond(seen[0].requestId, { granted: true, persist: false });
    await expect(pending).resolves.toEqual(expect.any(String));
    stop();
  });
});
