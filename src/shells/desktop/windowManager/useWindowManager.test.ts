import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_H,
  DEFAULT_W,
  MIN_H,
  MIN_W,
  WINDOW_Z_BASE,
  WINDOW_Z_MAX,
  __resetWindowManagerForTests,
  snapEdgeToBounds,
  useWindowManager,
} from "./useWindowManager";

describe("useWindowManager", () => {
  beforeEach(() => {
    __resetWindowManagerForTests();
  });

  it("F1 — open() with args stores a frozen snapshot on the record", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const input: Record<string, unknown> = { cwd: "/foo", verbose: true };
    wm.open({
      manifestId: "terminal",
      handleId: "h-args-1",
      title: "Terminal",
      args: input,
    });

    const record = wm.windows[0]!;
    expect(record.args).toEqual({ cwd: "/foo", verbose: true });
    expect(Object.isFrozen(record.args)).toBe(true);

    input.cwd = "/changed";
    expect(record.args).toEqual({ cwd: "/foo", verbose: true });
  });

  it("F1 — open() without args leaves record.args undefined (no sentinel object)", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    wm.open({ manifestId: "about", handleId: "h-args-2", title: "About" });

    const record = wm.windows[0]!;
    expect(record.args).toBeUndefined();
  });

  it("tracks a live document path by manifest and handle id", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    wm.open({ manifestId: "editor", handleId: "h-editor", title: "Editor" });

    expect(wm.setDocumentPath("h-editor", "editor", "/home/a.md")).toBe(true);
    expect(wm.windows[0]!.documentPath).toBe("/home/a.md");
    expect(wm.setDocumentPath("h-editor", "notes", "/home/b.md")).toBe(false);
    expect(wm.windows[0]!.documentPath).toBe("/home/a.md");
    expect(wm.setDocumentPath("h-editor", "editor", null)).toBe(true);
    expect(wm.windows[0]!.documentPath).toBeNull();
  });

  it("opens a window with monotonic z above the base and flags it focused", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const id = wm.open({
      manifestId: "about",
      handleId: "h-1",
      title: "About",
    });

    expect(wm.windows).toHaveLength(1);
    const record = wm.windows[0]!;
    expect(record.id).toBe(id);
    expect(record.z).toBeGreaterThan(WINDOW_Z_BASE);
    expect(record.focused).toBe(true);
    expect(record.handleId).toBe("h-1");
  });

  it("subsequent opens get higher z; focus(id) promotes target above siblings", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    const ra = wm.windows.find((w) => w.id === a)!;
    const rb = wm.windows.find((w) => w.id === b)!;
    expect(rb.z).toBeGreaterThan(ra.z);
    expect(rb.focused).toBe(true);
    expect(ra.focused).toBe(false);

    wm.focus(a);

    const raAfter = wm.windows.find((w) => w.id === a)!;
    const rbAfter = wm.windows.find((w) => w.id === b)!;
    expect(raAfter.z).toBeGreaterThan(rbAfter.z);
    expect(raAfter.focused).toBe(true);
    expect(rbAfter.focused).toBe(false);
  });

  it("close removes the record and calls killProcess with the handle id", () => {
    const killProcess = vi.fn();
    const wm = useWindowManager({ killProcess });

    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    wm.close(id);

    expect(wm.windows).toHaveLength(0);
    expect(killProcess).toHaveBeenCalledTimes(1);
    expect(killProcess).toHaveBeenCalledWith("h-a");
  });

  it("close promotes the surviving highest-z window to focused", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    wm.close(b);

    const survivor = wm.windows.find((w) => w.id === a)!;
    expect(wm.windows).toHaveLength(1);
    expect(survivor.focused).toBe(true);
  });

  it("singleton manifest reuses the existing window and focuses it instead of duplicating", () => {
    const killProcess = vi.fn();
    const wm = useWindowManager({ killProcess });

    const first = wm.open({
      manifestId: "settings",
      handleId: "h-s1",
      title: "Settings",
      singleton: true,
    });

    const otherId = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const otherZ = wm.windows.find((w) => w.id === otherId)!.z;

    const second = wm.open({
      manifestId: "settings",
      handleId: "h-s2",
      title: "Settings",
      singleton: true,
    });

    expect(second).toBe(first);
    expect(wm.windows.filter((w) => w.manifestId === "settings")).toHaveLength(1);
    const reused = wm.windows.find((w) => w.id === first)!;
    expect(reused.handleId).toBe("h-s1");
    expect(reused.z).toBeGreaterThan(otherZ);
    expect(reused.focused).toBe(true);
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("reflows z-values when nextZ approaches WINDOW_Z_MAX so windows never breach the dock band", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    for (let i = 0; i < WINDOW_Z_MAX - WINDOW_Z_BASE - 1; i += 1) {
      wm.focus(i % 2 === 0 ? a : b);
    }

    // One more focus must trigger the reflow rather than crossing into the dock band.
    wm.focus(a);

    for (const w of wm.windows) {
      expect(w.z).toBeLessThanOrEqual(WINDOW_Z_MAX);
      expect(w.z).toBeGreaterThanOrEqual(WINDOW_Z_BASE);
    }

    // After reflow the focused window must still be on top.
    const ra = wm.windows.find((w) => w.id === a)!;
    const rb = wm.windows.find((w) => w.id === b)!;
    expect(ra.z).toBeGreaterThan(rb.z);
    expect(ra.focused).toBe(true);
  });

  it("move updates window position without disturbing z or focus", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const before = wm.windows.find((w) => w.id === id)!;
    const beforeZ = before.z;

    wm.move(id, 320, 200);

    const after = wm.windows.find((w) => w.id === id)!;
    expect(after.x).toBe(320);
    expect(after.y).toBe(200);
    expect(after.z).toBe(beforeZ);
    expect(after.focused).toBe(true);
  });

  it("open seeds the default size and respects the minimum on custom sizes", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const defaultId = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const defaultRec = wm.windows.find((w) => w.id === defaultId)!;
    expect(defaultRec.width).toBe(DEFAULT_W);
    expect(defaultRec.height).toBe(DEFAULT_H);
    expect(defaultRec.maximized).toBe(false);
    expect(defaultRec.snap).toBeUndefined();

    const tinyId = wm.open({
      manifestId: "terminal",
      handleId: "h-b",
      title: "Terminal",
      size: { width: 10, height: 10 },
    });
    const tinyRec = wm.windows.find((w) => w.id === tinyId)!;
    expect(tinyRec.width).toBe(MIN_W);
    expect(tinyRec.height).toBe(MIN_H);
  });

  it("resize clamps width and height to the minimum size", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });

    wm.resize(id, 50, 40);

    const rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.width).toBe(MIN_W);
    expect(rec.height).toBe(MIN_H);
  });

  it("honors per-window minimum sizes for open, resize, setBounds, and restore", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({
      manifestId: "calendar",
      handleId: "h-calendar",
      title: "Calendar",
      size: { width: 320, height: 240 },
      minSize: { width: 520, height: 520 },
    });

    let rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.width).toBe(520);
    expect(rec.height).toBe(520);
    expect(rec.minWidth).toBe(520);
    expect(rec.minHeight).toBe(520);

    wm.resize(id, 400, 300);
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.width).toBe(520);
    expect(rec.height).toBe(520);

    wm.setBounds(id, 20, 30, 400, 400);
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.x).toBe(20);
    expect(rec.y).toBe(30);
    expect(rec.width).toBe(520);
    expect(rec.height).toBe(520);

    wm.toggleMaximize(id, { width: 1200, height: 800 });
    wm.toggleMaximize(id, { width: 1200, height: 800 });
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.width).toBe(520);
    expect(rec.height).toBe(520);
  });

  it("setBounds updates x/y/width/height atomically and clamps size", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });

    wm.setBounds(id, 200, 150, 50, 1000);

    const rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.x).toBe(200);
    expect(rec.y).toBe(150);
    expect(rec.width).toBe(MIN_W);
    expect(rec.height).toBe(1000);
  });

  it("toggleMaximize captures preMaximize then restores it on the second call", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    wm.setBounds(id, 120, 80, 400, 280);

    wm.toggleMaximize(id, { width: 1000, height: 600 });

    const maxed = wm.windows.find((w) => w.id === id)!;
    expect(maxed.maximized).toBe(true);
    expect(maxed.snap).toBe("max");
    expect(maxed.x).toBe(0);
    expect(maxed.y).toBe(0);
    expect(maxed.width).toBe(1000);
    expect(maxed.height).toBe(600);
    expect(maxed.preMaximize).toEqual({ x: 120, y: 80, width: 400, height: 280 });

    wm.toggleMaximize(id, { width: 1000, height: 600 });

    const restored = wm.windows.find((w) => w.id === id)!;
    expect(restored.maximized).toBe(false);
    expect(restored.snap).toBeUndefined();
    expect(restored.preMaximize).toBeUndefined();
    expect(restored.x).toBe(120);
    expect(restored.y).toBe(80);
    expect(restored.width).toBe(400);
    expect(restored.height).toBe(280);
  });

  it("snapTo left/right halve the stage and snapTo max behaves like maximize", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const stage = { width: 1000, height: 600 };

    wm.snapTo(id, "left", stage);
    let rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.snap).toBe("left");
    expect(rec.x).toBe(0);
    expect(rec.y).toBe(0);
    expect(rec.width).toBe(500);
    expect(rec.height).toBe(600);
    expect(rec.preMaximize).toBeDefined();

    wm.snapTo(id, "right", stage);
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.snap).toBe("right");
    expect(rec.x).toBe(500);
    expect(rec.width).toBe(500);

    wm.snapTo(id, "max", stage);
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.maximized).toBe(true);
    expect(rec.snap).toBe("max");
    expect(rec.width).toBe(1000);
    expect(rec.height).toBe(600);
  });

  it("rebindToStage re-applies new stage size to maximized and snapped windows only", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });

    const maxId = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const leftId = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });
    const idleId = wm.open({ manifestId: "settings", handleId: "h-c", title: "Settings" });

    const stage0 = { width: 1000, height: 600 };
    wm.toggleMaximize(maxId, stage0);
    wm.snapTo(leftId, "left", stage0);

    const idleBeforeBounds = (() => {
      const r = wm.windows.find((w) => w.id === idleId)!;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })();

    wm.rebindToStage({ width: 1400, height: 800 });

    const maxRec = wm.windows.find((w) => w.id === maxId)!;
    expect(maxRec.width).toBe(1400);
    expect(maxRec.height).toBe(800);
    expect(maxRec.maximized).toBe(true);

    const leftRec = wm.windows.find((w) => w.id === leftId)!;
    expect(leftRec.x).toBe(0);
    expect(leftRec.width).toBe(700);
    expect(leftRec.height).toBe(800);
    expect(leftRec.snap).toBe("left");

    const idleRec = wm.windows.find((w) => w.id === idleId)!;
    expect(idleRec.x).toBe(idleBeforeBounds.x);
    expect(idleRec.y).toBe(idleBeforeBounds.y);
    expect(idleRec.width).toBe(idleBeforeBounds.width);
    expect(idleRec.height).toBe(idleBeforeBounds.height);
  });

  it("maximize after snap preserves the user's pre-snap free bounds in preMaximize", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    wm.setBounds(id, 120, 80, 400, 280);

    const stage = { width: 1000, height: 600 };
    wm.snapTo(id, "left", stage);

    const afterSnap = wm.windows.find((w) => w.id === id)!;
    expect(afterSnap.preMaximize).toEqual({ x: 120, y: 80, width: 400, height: 280 });

    wm.toggleMaximize(id, stage);

    const maxed = wm.windows.find((w) => w.id === id)!;
    expect(maxed.maximized).toBe(true);
    expect(maxed.preMaximize).toEqual({ x: 120, y: 80, width: 400, height: 280 });

    wm.toggleMaximize(id, stage);

    const restored = wm.windows.find((w) => w.id === id)!;
    expect(restored.x).toBe(120);
    expect(restored.y).toBe(80);
    expect(restored.width).toBe(400);
    expect(restored.height).toBe(280);
  });

  it("snapTo right after snapTo left keeps the original pre-snap preMaximize", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    wm.setBounds(id, 150, 60, 380, 260);

    const stage = { width: 1000, height: 600 };
    wm.snapTo(id, "left", stage);
    wm.snapTo(id, "right", stage);

    const rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.snap).toBe("right");
    expect(rec.preMaximize).toEqual({ x: 150, y: 60, width: 380, height: 260 });
  });

  it("snapTo halves a narrow stage without overlapping (drops MIN_W floor)", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const left = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const right = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    const narrow = { width: 380, height: 600 };
    wm.snapTo(left, "left", narrow);
    wm.snapTo(right, "right", narrow);

    const l = wm.windows.find((w) => w.id === left)!;
    const r = wm.windows.find((w) => w.id === right)!;

    expect(l.width).toBe(190);
    expect(r.width).toBe(190);
    expect(l.x + l.width).toBeLessThanOrEqual(r.x);
  });

  it("minimize hides the window without disturbing bounds or z, and promotes next visible to focus", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    const before = wm.windows.find((w) => w.id === b)!;
    const beforeBounds = {
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
      z: before.z,
    };

    wm.minimize(b);

    const minimized = wm.windows.find((w) => w.id === b)!;
    expect(minimized.minimized).toBe(true);
    expect(minimized.focused).toBe(false);
    expect(minimized.x).toBe(beforeBounds.x);
    expect(minimized.y).toBe(beforeBounds.y);
    expect(minimized.width).toBe(beforeBounds.width);
    expect(minimized.height).toBe(beforeBounds.height);
    expect(minimized.z).toBe(beforeBounds.z);

    const promoted = wm.windows.find((w) => w.id === a)!;
    expect(promoted.focused).toBe(true);
  });

  it("restore clears minimized, bumps z above siblings, and focuses the record", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    wm.minimize(b);
    wm.restore(b);

    const ra = wm.windows.find((w) => w.id === a)!;
    const rb = wm.windows.find((w) => w.id === b)!;
    expect(rb.minimized).toBe(false);
    expect(rb.focused).toBe(true);
    expect(rb.z).toBeGreaterThan(ra.z);
    expect(ra.focused).toBe(false);
  });

  it("restoreAllForManifest restores every matching minimized record; originally-topmost stays on top", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "about", handleId: "h-b", title: "About 2" });
    const c = wm.open({ manifestId: "terminal", handleId: "h-c", title: "Terminal" });

    wm.minimize(a);
    wm.minimize(b);

    const restored = wm.restoreAllForManifest("about");

    expect(restored).toBe(true);

    const ra = wm.windows.find((w) => w.id === a)!;
    const rb = wm.windows.find((w) => w.id === b)!;
    const rc = wm.windows.find((w) => w.id === c)!;

    expect(ra.minimized).toBe(false);
    expect(rb.minimized).toBe(false);
    expect(rb.z).toBeGreaterThan(ra.z);
    expect(rb.z).toBeGreaterThan(rc.z);
    expect(rb.focused).toBe(true);
    expect(ra.focused).toBe(false);
  });

  it("restoreAllForManifest returns false when nothing to restore", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "about", handleId: "h-a", title: "About" });

    expect(wm.restoreAllForManifest("about")).toBe(false);
    expect(wm.restoreAllForManifest("missing")).toBe(false);
  });

  it("focusTopOfManifest focuses the topmost visible record and ignores minimized siblings", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "about", handleId: "h-b", title: "About 2" });
    wm.open({ manifestId: "terminal", handleId: "h-c", title: "Terminal" });

    // b is currently topmost-about. Minimize b → focusTopOfManifest must pick a.
    wm.minimize(b);

    const ok = wm.focusTopOfManifest("about");

    expect(ok).toBe(true);
    const ra = wm.windows.find((w) => w.id === a)!;
    expect(ra.focused).toBe(true);
  });

  it("focusTopOfManifest returns false when no visible record matches", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    wm.minimize(a);

    expect(wm.focusTopOfManifest("about")).toBe(false);
    expect(wm.focusTopOfManifest("missing")).toBe(false);
  });

  it("hasWindowsForManifest is true for visible and minimized records, false after close", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    expect(wm.hasWindowsForManifest("about")).toBe(false);

    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    expect(wm.hasWindowsForManifest("about")).toBe(true);

    wm.minimize(id);
    expect(wm.hasWindowsForManifest("about")).toBe(true);

    wm.close(id);
    expect(wm.hasWindowsForManifest("about")).toBe(false);
  });

  it("focus(id) on a minimized record auto-resurfaces it so focused never lies about visibility", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    wm.minimize(b);
    wm.focus(b);

    const rb = wm.windows.find((w) => w.id === b)!;
    const ra = wm.windows.find((w) => w.id === a)!;
    expect(rb.minimized).toBe(false);
    expect(rb.focused).toBe(true);
    expect(rb.z).toBeGreaterThan(ra.z);
  });

  it("closing a sibling leaves a minimized window intact", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const a = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const b = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });

    wm.minimize(a);
    wm.close(b);

    expect(wm.windows).toHaveLength(1);
    const survivor = wm.windows.find((w) => w.id === a)!;
    expect(survivor.minimized).toBe(true);
    expect(survivor.focused).toBe(false);
  });

  it("snapEdgeToBounds returns deterministic geometry for left/right/max edges", () => {
    const stage = { width: 1000, height: 600 };

    expect(snapEdgeToBounds("left", stage)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 600,
    });

    expect(snapEdgeToBounds("right", stage)).toEqual({
      x: 500,
      y: 0,
      width: 500,
      height: 600,
    });

    expect(snapEdgeToBounds("max", stage)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 600,
    });
  });

  it("snapEdgeToBounds halves a narrow stage without MIN_W floor (parity with snapTo)", () => {
    const narrow = { width: 380, height: 600 };

    const left = snapEdgeToBounds("left", narrow);
    const right = snapEdgeToBounds("right", narrow);

    expect(left.width).toBe(190);
    expect(right.width).toBe(190);
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  });

  it("rebindToStage uses snapEdgeToBounds for left/right/max records (zero-drift across stage resize)", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const maxId = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const leftId = wm.open({ manifestId: "terminal", handleId: "h-b", title: "Terminal" });
    const rightId = wm.open({ manifestId: "files", handleId: "h-c", title: "Files" });

    const stage0 = { width: 1000, height: 600 };
    wm.toggleMaximize(maxId, stage0);
    wm.snapTo(leftId, "left", stage0);
    wm.snapTo(rightId, "right", stage0);

    const newStage = { width: 1600, height: 900 };
    wm.rebindToStage(newStage);

    const maxRec = wm.windows.find((w) => w.id === maxId)!;
    expect({ x: maxRec.x, y: maxRec.y, width: maxRec.width, height: maxRec.height }).toEqual(
      snapEdgeToBounds("max", newStage),
    );

    const leftRec = wm.windows.find((w) => w.id === leftId)!;
    expect({ x: leftRec.x, y: leftRec.y, width: leftRec.width, height: leftRec.height }).toEqual(
      snapEdgeToBounds("left", newStage),
    );

    const rightRec = wm.windows.find((w) => w.id === rightId)!;
    expect({
      x: rightRec.x,
      y: rightRec.y,
      width: rightRec.width,
      height: rightRec.height,
    }).toEqual(snapEdgeToBounds("right", newStage));
  });

  it("snapEdgeToBounds output matches snapTo commit geometry (zero-drift guarantee)", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const stage = { width: 1200, height: 720 };

    wm.snapTo(id, "left", stage);
    const left = wm.windows.find((w) => w.id === id)!;
    const leftPreview = snapEdgeToBounds("left", stage);
    expect({ x: left.x, y: left.y, width: left.width, height: left.height }).toEqual(leftPreview);

    wm.snapTo(id, "right", stage);
    const right = wm.windows.find((w) => w.id === id)!;
    const rightPreview = snapEdgeToBounds("right", stage);
    expect({ x: right.x, y: right.y, width: right.width, height: right.height }).toEqual(
      rightPreview,
    );
  });

  it("user-driven move/resize clears maximize and snap state", () => {
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "about", handleId: "h-a", title: "About" });
    const stage = { width: 1000, height: 600 };

    wm.snapTo(id, "left", stage);
    wm.move(id, 100, 100);
    let rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.snap).toBeUndefined();
    expect(rec.maximized).toBe(false);
    expect(rec.preMaximize).toBeUndefined();

    wm.toggleMaximize(id, stage);
    wm.resize(id, 400, 300);
    rec = wm.windows.find((w) => w.id === id)!;
    expect(rec.maximized).toBe(false);
    expect(rec.snap).toBeUndefined();
    expect(rec.preMaximize).toBeUndefined();
    expect(rec.width).toBe(400);
    expect(rec.height).toBe(300);
  });
});
