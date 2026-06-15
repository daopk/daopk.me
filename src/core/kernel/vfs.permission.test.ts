import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, markRaw, type Component } from "vue";

import "fake-indexeddb/auto";

import { usePermissionStore } from "~/core/permissions/PermissionStore";
import type { VfsStat } from "~/core/vfs";
import type { AppManifest, AppPermission } from "~/types/app";
import type { AppRegistrationSource } from "~/types/kernel";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(defineComponent({ template: "<svg />" }));
let pathCounter = 0;

function makeManifest(
  id: string,
  category: AppManifest["category"],
  permissions?: readonly AppPermission[],
): AppManifest {
  const manifest: AppManifest = {
    id,
    name: id,
    icon: StubIcon,
    category,
    component: () => Promise.resolve({ default: StubIcon }),
  };
  if (permissions !== undefined) {
    manifest.permissions = [...permissions];
  }
  return manifest;
}

function uniquePath(name: string): string {
  pathCounter += 1;
  return `/home/vfs-permission-${Date.now()}-${pathCounter}-${name}`;
}

async function launchApp(
  id: string,
  category: AppManifest["category"],
  options: { source?: AppRegistrationSource; permissions?: readonly AppPermission[] } = {},
): Promise<string> {
  const source = options.source ?? (category === "system" ? "system" : undefined);
  kernel.apps.register(
    makeManifest(id, category, options.permissions),
    source === undefined ? undefined : { source },
  );
  return (await kernel.apps.launch(id)).id;
}

async function seedText(path: string, text: string): Promise<void> {
  const handleId = await launchApp("system-vfs-seeder", "system");
  await expect(kernel.vfs.writeText(path, text, { handleId })).resolves.toEqual(
    expect.objectContaining({ path }),
  );
}

describe("kernel.vfs permission gate", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    localStorage.clear();
  });

  it("system apps auto-grant read and write without prompting", async () => {
    const handleId = await launchApp("system-files", "system");
    const requests: unknown[] = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      requests.push(payload);
    });
    const path = uniquePath("system.txt");

    await expect(kernel.vfs.writeText(path, "hello", { handleId })).resolves.toEqual(
      expect.objectContaining({ path }),
    );
    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBe("hello");
    expect(requests).toEqual([]);
    stop();
  });

  it("first-party external apps auto-grant declared read and write without prompting", async () => {
    const handleId = await launchApp("notes", "productivity", {
      source: "external",
      permissions: ["vfs.read", "vfs.write"],
    });
    const requests: unknown[] = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      requests.push(payload);
    });
    const path = uniquePath("first-party.txt");

    await expect(kernel.vfs.writeText(path, "trusted", { handleId })).resolves.toEqual(
      expect.objectContaining({ path }),
    );
    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBe("trusted");

    expect(requests).toEqual([]);
    expect(usePermissionStore().list({ manifestId: "notes" })).toEqual([]);
    stop();
  });

  it("persisted denial blocks a first-party external default grant", async () => {
    const path = uniquePath("first-party-denied.txt");
    await seedText(path, "blocked");
    const handleId = await launchApp("notes", "productivity", {
      source: "external",
      permissions: ["vfs.read"],
    });
    usePermissionStore().set("notes", "vfs.read", false);

    const requests: unknown[] = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      requests.push(payload);
    });

    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBeNull();
    expect(requests).toEqual([]);
    stop();
  });

  it("an allowlisted app id still prompts when it is not registered as external", async () => {
    const path = uniquePath("not-external.txt");
    await seedText(path, "needs prompt");
    const handleId = await launchApp("notes", "productivity", {
      permissions: ["vfs.read"],
    });

    const seen: Array<{ requestId: string; permission: AppPermission }> = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      seen.push({ requestId: payload.requestId, permission: payload.permission });
    });

    const pending = kernel.vfs.readText(path, { handleId });
    await Promise.resolve();
    expect(seen).toEqual([{ requestId: expect.any(String), permission: "vfs.read" }]);

    kernel.permissions.respond(seen[0].requestId, { granted: true, persist: false });
    await expect(pending).resolves.toBe("needs prompt");
    stop();
  });

  it("non-system reads park until the prompt denies", async () => {
    const path = uniquePath("deny-read.txt");
    await seedText(path, "secret");
    const handleId = await launchApp("notes", "productivity");

    const seen: Array<{ requestId: string; permission: AppPermission }> = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      seen.push({ requestId: payload.requestId, permission: payload.permission });
    });

    const pending = kernel.vfs.readText(path, { handleId });
    await Promise.resolve();
    expect(seen).toEqual([{ requestId: expect.any(String), permission: "vfs.read" }]);

    kernel.permissions.respond(seen[0].requestId, { granted: false, persist: true });
    await expect(pending).resolves.toBeNull();
    stop();
  });

  it("non-system reads resolve after a transient grant", async () => {
    const path = uniquePath("grant-read.txt");
    await seedText(path, "visible");
    const handleId = await launchApp("reader", "productivity");

    const seen: Array<{ requestId: string }> = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      seen.push({ requestId: payload.requestId });
    });

    const pending = kernel.vfs.readText(path, { handleId });
    await Promise.resolve();
    kernel.permissions.respond(seen[0].requestId, { granted: true, persist: false });

    await expect(pending).resolves.toBe("visible");
    stop();
  });

  it("persisted grant and denial are honored without re-prompting", async () => {
    const path = uniquePath("cached.txt");
    await seedText(path, "cached");
    const handleId = await launchApp("cached-reader", "productivity");
    usePermissionStore().set("cached-reader", "vfs.read", true);

    const requests: unknown[] = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      requests.push(payload);
    });

    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBe("cached");

    usePermissionStore().set("cached-reader", "vfs.write", false);
    await expect(
      kernel.vfs.writeText(uniquePath("blocked.txt"), "nope", { handleId }),
    ).resolves.toBeNull();
    expect(requests).toEqual([]);
    stop();
  });

  it("revoking a persisted read decision causes the next read to re-prompt", async () => {
    const path = uniquePath("revoke.txt");
    await seedText(path, "again");
    const handleId = await launchApp("revoked-reader", "productivity");
    usePermissionStore().set("revoked-reader", "vfs.read", true);

    await expect(kernel.vfs.readText(path, { handleId })).resolves.toBe("again");

    kernel.permissions.revoke("revoked-reader", "vfs.read");
    const seen: Array<{ requestId: string }> = [];
    const stop = kernel.events.on("permission.requested", (payload) => {
      seen.push({ requestId: payload.requestId });
    });

    const pending = kernel.vfs.readText(path, { handleId });
    await Promise.resolve();
    expect(seen).toHaveLength(1);

    kernel.permissions.respond(seen[0].requestId, { granted: true, persist: false });
    await expect(pending).resolves.toBe("again");
    stop();
  });

  it("emits vfs.changed only after successful mutations", async () => {
    const handleId = await launchApp("system-vfs-events", "system");
    const events: Array<{ path: string; operation: string }> = [];
    const stop = kernel.events.on("vfs.changed", (payload) => {
      events.push({ path: payload.path, operation: payload.operation });
    });
    const dir = uniquePath("events");
    const file = `${dir}/file.txt`;

    await kernel.vfs.mkdir(dir, { handleId, recursive: true });
    await kernel.vfs.writeText(file, "event", { handleId });
    await kernel.vfs.remove(file, { handleId });

    expect(events).toEqual([
      { path: dir, operation: "mkdir" },
      { path: file, operation: "write" },
      { path: file, operation: "remove" },
    ]);
    stop();
  });

  it("lets app.will-kill listeners start a final handle-scoped VFS write", async () => {
    const handleId = await launchApp("system-vfs-close-save", "system");
    const path = uniquePath("close-save.md");
    const writes: Array<Promise<VfsStat | null>> = [];
    const stop = kernel.events.on("app.will-kill", (payload) => {
      if (payload.handleId !== handleId) {
        return;
      }

      writes.push(
        kernel.vfs.writeText(path, "# Close save\n\nStill here", {
          handleId,
          mimeType: "text/markdown;charset=utf-8",
        }),
      );
    });

    kernel.processes.kill(handleId);
    stop();

    await expect(Promise.all(writes)).resolves.toEqual([expect.objectContaining({ path })]);

    const readerHandleId = await launchApp("system-vfs-close-reader", "system");
    await expect(kernel.vfs.readText(path, { handleId: readerHandleId })).resolves.toBe(
      "# Close save\n\nStill here",
    );
  });

  it("rejects manifest-id spoofing because VFS access is handle-scoped", async () => {
    const path = uniquePath("spoof.txt");
    await seedText(path, "nope");

    await expect(
      kernel.vfs.readText(path, { handleId: "system-vfs-seeder" }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
