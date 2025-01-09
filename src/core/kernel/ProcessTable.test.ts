import { describe, expect, it } from "vitest";

import { ProcessTable } from "./ProcessTable";

describe("ProcessTable", () => {
  describe("spawn / kill", () => {
    it("spawn returns an `AppHandle` with a stable id and tracks `state: 'running'`", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");

      expect(handle.id).toMatch(/.+/);
      expect(handle.manifestId).toBe("about");

      const list = Array.from(table.list());
      expect(list).toHaveLength(1);
      expect(list[0]?.[1].state).toBe("running");
      expect(list[0]?.[1].manifestId).toBe("about");
    });

    it("kill returns the removed record and drops it from list()", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");

      const removed = table.kill(handle.id);
      expect(removed?.manifestId).toBe("about");
      expect(Array.from(table.list())).toHaveLength(0);
    });

    it("kill on an unknown handle returns undefined and is a no-op", () => {
      const table = new ProcessTable();
      table.spawn("about");

      expect(table.kill("never-existed")).toBeUndefined();
      expect(Array.from(table.list())).toHaveLength(1);
    });
  });

  describe("suspend (M3.1)", () => {
    it("flips `running → suspended` and returns true on first call", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");

      expect(table.suspend(handle.id)).toBe(true);

      const record = Array.from(table.list()).find(([id]) => id === handle.id)?.[1];
      expect(record?.state).toBe("suspended");
    });

    it("returns false (no-op) when already suspended — guards duplicate `lifecycle.suspended` emits", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");
      table.suspend(handle.id);

      expect(table.suspend(handle.id)).toBe(false);
    });

    it("returns false when the handle is unknown", () => {
      const table = new ProcessTable();
      expect(table.suspend("never-existed")).toBe(false);
    });
  });

  describe("resume (M3.1)", () => {
    it("flips `suspended → running` and returns true", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");
      table.suspend(handle.id);

      expect(table.resume(handle.id)).toBe(true);

      const record = Array.from(table.list()).find(([id]) => id === handle.id)?.[1];
      expect(record?.state).toBe("running");
    });

    it("returns false when already running — freshly-spawned handles need no resume", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");

      expect(table.resume(handle.id)).toBe(false);
    });

    it("returns false when the handle is unknown", () => {
      const table = new ProcessTable();
      expect(table.resume("never-existed")).toBe(false);
    });
  });

  describe("launch args (F1)", () => {
    it("spawn without args leaves record.args === undefined (NOT empty object)", () => {
      const table = new ProcessTable();
      const handle = table.spawn("about");

      const record = table.get(handle.id);
      expect(record).toBeDefined();
      expect(record?.args).toBeUndefined();
    });

    it("spawn with args stores a frozen snapshot retrievable via get()", () => {
      const table = new ProcessTable();
      const handle = table.spawn("terminal", { cwd: "/foo", verbose: true });

      const record = table.get(handle.id);
      expect(record?.args).toEqual({ cwd: "/foo", verbose: true });
      expect(Object.isFrozen(record?.args)).toBe(true);
    });

    it("mutating the input post-spawn does not leak into the stored snapshot", () => {
      const table = new ProcessTable();
      const input: Record<string, unknown> = { cwd: "/foo" };
      const handle = table.spawn("terminal", input);

      input.cwd = "/changed";
      input.added = true;

      const stored = table.get(handle.id)?.args;
      expect(stored).toEqual({ cwd: "/foo" });
      expect(stored).not.toHaveProperty("added");
    });

    it("get() returns undefined for unknown handles", () => {
      const table = new ProcessTable();
      expect(table.get("never-existed")).toBeUndefined();
    });
  });

  describe("integration with singleton bridge", () => {
    it("singleton bridge does not interfere with state transitions on the bridged handle", () => {
      const table = new ProcessTable();
      const handle = table.spawn("settings");
      table.registerSingletonBridge("settings", handle);

      expect(table.suspend(handle.id)).toBe(true);
      expect(table.getSingletonFromManifest("settings")?.id).toBe(handle.id);

      expect(table.resume(handle.id)).toBe(true);
      expect(table.getSingletonFromManifest("settings")?.id).toBe(handle.id);
    });
  });
});
