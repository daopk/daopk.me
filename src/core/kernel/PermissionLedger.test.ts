import { describe, expect, it, vi } from "vitest";

import { PermissionLedger, type PermissionLedgerStore } from "./PermissionLedger";
import type { AppManifest, AppPermission } from "~/types/app";
import type { PersistedPermissionDecision } from "~/types/permissions";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function makeStore(): PermissionLedgerStore & {
  __raw: Map<string, Map<AppPermission, PersistedPermissionDecision>>;
} {
  const raw = new Map<string, Map<AppPermission, PersistedPermissionDecision>>();
  return {
    __raw: raw,
    get(manifestId, permission) {
      return raw.get(manifestId)?.get(permission);
    },
    set(manifestId, permission, granted) {
      const inner = raw.get(manifestId) ?? new Map();
      inner.set(permission, { granted, decidedAt: Date.now() });
      raw.set(manifestId, inner);
    },
    remove(manifestId, permission) {
      const inner = raw.get(manifestId);
      if (!inner) return false;
      const had = inner.delete(permission);
      if (inner.size === 0) raw.delete(manifestId);
      return had;
    },
    list(filter) {
      const out = [];
      for (const [manifestId, inner] of raw) {
        if (filter?.manifestId !== undefined && filter.manifestId !== manifestId) continue;
        for (const [permission, decision] of inner) {
          out.push({
            manifestId,
            permission,
            granted: decision.granted,
            decidedAt: decision.decidedAt,
          });
        }
      }
      return out;
    },
  };
}

function makeEmitter(): {
  emit: ReturnType<typeof vi.fn>;
  events: Array<{ channel: string; payload: unknown }>;
} {
  const events: Array<{ channel: string; payload: unknown }> = [];
  const emit = vi.fn((channel: string, payload: unknown) => {
    events.push({ channel, payload });
  });
  return { emit: emit as never, events };
}

function makeManifest(id: string, category: AppManifest["category"]): AppManifest {
  return {
    id,
    name: id,
    icon: "icon-default",
    category,
    permissions: [],
    surfaces: ["desktop"],
    entry: () => Promise.resolve({ default: { template: "<div />" } }) as never,
  } as unknown as AppManifest;
}

describe("PermissionLedger (M3.5)", () => {
  describe("system auto-grant", () => {
    it("resolves synchronously without consulting the store", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("system-toasts", "system")],
        store,
        events: emitter,
      });

      const decision = await ledger.request("system-toasts", "notifications.post");

      expect(decision).toEqual({
        granted: true,
        persisted: false,
        reason: "system-auto-grant",
      });
      expect(store.__raw.size).toBe(0);
      expect(emitter.events).toEqual([
        {
          channel: "permission.granted",
          payload: {
            manifestId: "system-toasts",
            permission: "notifications.post",
            persisted: false,
          },
        },
      ]);
    });

    it("does NOT auto-grant non-system apps even if they're built-in-looking", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
      });

      const pending = ledger.request("rss-reader", "notifications.post");
      await Promise.resolve();

      expect(emitter.events.map((e) => e.channel)).toEqual(["permission.requested"]);
      const reqId = (emitter.events[0].payload as { requestId: string }).requestId;
      ledger.respond(reqId, { granted: false, persist: false });
      await pending;
    });
  });

  describe("persisted cache", () => {
    it("returns the cached grant without prompting", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      store.set("rss-reader", "notifications.post", true);

      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
      });

      const decision = await ledger.request("rss-reader", "notifications.post");
      expect(decision.granted).toBe(true);
      expect(decision.persisted).toBe(true);
      expect(decision.reason).toBe("cached");
      expect(emitter.events.map((e) => e.channel)).toEqual(["permission.granted"]);
    });

    it("returns the cached denial without prompting", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      store.set("rss-reader", "notifications.post", false);

      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
      });

      const decision = await ledger.request("rss-reader", "notifications.post");
      expect(decision.granted).toBe(false);
      expect(decision.persisted).toBe(true);
      expect(emitter.events.map((e) => e.channel)).toEqual(["permission.denied"]);
    });
  });

  describe("fresh prompt + respond", () => {
    it("emits permission.requested, parks the promise, resolves on respond (persist)", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      let nextId = 0;
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
        mintRequestId: () => `req-${++nextId}`,
      });

      const pending = ledger.request("rss-reader", "notifications.post", { source: "app" });

      expect(ledger._pendingCountForTests).toBe(1);
      expect(emitter.events).toEqual([
        {
          channel: "permission.requested",
          payload: {
            requestId: "req-1",
            manifestId: "rss-reader",
            permission: "notifications.post",
            source: "app",
          },
        },
      ]);

      const handled = ledger.respond("req-1", { granted: true, persist: true });
      expect(handled).toBe(true);

      const decision = await pending;
      expect(decision).toEqual({
        granted: true,
        persisted: true,
        reason: "user-remembered",
      });
      expect(store.get("rss-reader", "notifications.post")).toBeDefined();
      expect(emitter.events.map((e) => e.channel)).toEqual([
        "permission.requested",
        "permission.granted",
      ]);
    });

    it("'Allow once' (persist: false) resolves but does NOT touch the store", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
        mintRequestId: () => "req-1",
      });

      const pending = ledger.request("rss-reader", "notifications.post");
      ledger.respond("req-1", { granted: true, persist: false });
      const decision = await pending;

      expect(decision.persisted).toBe(false);
      expect(decision.reason).toBe("user");
      expect(store.__raw.size).toBe(0);

      expect(emitter.events.map((e) => e.channel)).toEqual([
        "permission.requested",
        "permission.granted",
      ]);
    });

    it("respond() with unknown requestId returns false and is a no-op", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
      });

      expect(ledger.respond("stale-id", { granted: true, persist: true })).toBe(false);
      expect(store.__raw.size).toBe(0);
      expect(emitter.events).toEqual([]);
    });

    it("two concurrent requests get distinct ids — stale respond cannot resolve a later one", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      let nextId = 0;
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
        mintRequestId: () => `req-${++nextId}`,
      });

      const a = ledger.request("rss-reader", "notifications.post");
      const b = ledger.request("rss-reader", "notifications.post");

      expect(ledger._pendingCountForTests).toBe(2);

      const requestIds = emitter.events
        .filter((e) => e.channel === "permission.requested")
        .map((e) => (e.payload as { requestId: string }).requestId);
      expect(new Set(requestIds).size).toBe(2);

      // Respond to first; second must still be pending.
      ledger.respond("req-1", { granted: true, persist: false });
      expect(await a).toMatchObject({ granted: true });
      expect(ledger._pendingCountForTests).toBe(1);

      // Re-responding to req-1 must NOT accidentally resolve req-2.
      expect(ledger.respond("req-1", { granted: false, persist: false })).toBe(false);
      expect(ledger._pendingCountForTests).toBe(1);

      ledger.respond("req-2", { granted: false, persist: false });
      expect(await b).toMatchObject({ granted: false });
    });
  });

  describe("revoke", () => {
    it("removes the row + emits permission.revoked when an entry existed", () => {
      const store = makeStore();
      const emitter = makeEmitter();
      store.set("rss-reader", "notifications.post", true);

      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
      });

      expect(ledger.revoke("rss-reader", "notifications.post")).toBe(true);
      expect(store.get("rss-reader", "notifications.post")).toBeUndefined();
      expect(emitter.events).toEqual([
        {
          channel: "permission.revoked",
          payload: { manifestId: "rss-reader", permission: "notifications.post" },
        },
      ]);
    });

    it("returns false + emits nothing when there was no entry to revoke", () => {
      const store = makeStore();
      const emitter = makeEmitter();
      const ledger = new PermissionLedger({
        listApps: () => [],
        store,
        events: emitter,
      });

      expect(ledger.revoke("never-existed", "notifications.post")).toBe(false);
      expect(emitter.events).toEqual([]);
    });

    it("after revoke, a follow-up request re-prompts (no longer cached)", async () => {
      const store = makeStore();
      const emitter = makeEmitter();
      store.set("rss-reader", "notifications.post", true);

      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: emitter,
        mintRequestId: () => "req-1",
      });

      const first = await ledger.request("rss-reader", "notifications.post");
      expect(first.reason).toBe("cached");

      ledger.revoke("rss-reader", "notifications.post");

      const second = ledger.request("rss-reader", "notifications.post");
      await Promise.resolve();
      expect(ledger._pendingCountForTests).toBe(1);
      ledger.respond("req-1", { granted: false, persist: false });
      const decision = await second;
      expect(decision.reason).toBe("user");
    });
  });

  describe("list", () => {
    it("delegates to store.list (single-manifest filter)", () => {
      const store = makeStore();
      const ledger = new PermissionLedger({
        listApps: () => [],
        store,
        events: makeEmitter(),
      });
      store.set("a", "notifications.post", true);
      store.set("b", "network.fetch", false);

      expect(ledger.list()).toHaveLength(2);
      expect(ledger.list({ manifestId: "a" })).toHaveLength(1);
    });
  });

  describe("__resetForTests", () => {
    it("resolves every pending request as a one-shot deny and clears the map", async () => {
      const store = makeStore();
      const ledger = new PermissionLedger({
        listApps: () => [makeManifest("rss-reader", "user")],
        store,
        events: makeEmitter(),
        mintRequestId: () => "req-1",
      });

      const pending = ledger.request("rss-reader", "notifications.post");
      expect(ledger._pendingCountForTests).toBe(1);

      ledger.__resetForTests();
      expect(ledger._pendingCountForTests).toBe(0);

      const decision = await pending;
      expect(decision).toEqual({ granted: false, persisted: false, reason: "user" });
    });
  });
});
