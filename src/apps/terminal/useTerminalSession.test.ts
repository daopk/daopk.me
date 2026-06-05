import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInstanceAliases, resolveCommandId, useTerminalSession } from "./useTerminalSession";

import { KernelInjectionKey } from "~/types/kernel";
import type { Kernel } from "~/types/kernel";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { VfsDirEntry, VfsStat } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";

const TEST_HANDLE = "test-handle";

interface FakeKernel {
  kernel: Kernel;
  dispatchCalls: Array<{ id: string; source: string | undefined }>;
  vfsListResult: { value: readonly VfsDirEntry[] | null };
  vfsStats: Map<string, VfsStat | null>;
}

function makeFakeKernel(): FakeKernel {
  const vfsStats = new Map<string, VfsStat | null>([
    [
      "/",
      {
        path: normalizeVfsPath("/"),
        kind: "directory",
        size: 0,
        createdAt: 0,
        updatedAt: 0,
        readonly: false,
      },
    ],
    [
      "/home",
      {
        path: normalizeVfsPath("/home"),
        kind: "directory",
        size: 0,
        createdAt: 0,
        updatedAt: 0,
        readonly: false,
      },
    ],
    [
      "/readme.txt",
      {
        path: normalizeVfsPath("/readme.txt"),
        kind: "file",
        size: 12,
        createdAt: 0,
        updatedAt: 0,
        readonly: false,
      },
    ],
  ]);
  const vfsListResult: { value: readonly VfsDirEntry[] | null } = {
    value: [
      {
        name: "home",
        path: normalizeVfsPath("/home"),
        kind: "directory",
        size: 0,
        updatedAt: 0,
        readonly: false,
      },
      {
        name: "readme.txt",
        path: normalizeVfsPath("/readme.txt"),
        kind: "file",
        size: 12,
        updatedAt: 0,
        readonly: false,
      },
    ],
  };
  const dispatchCalls: FakeKernel["dispatchCalls"] = [];
  const registry = new Map<string, CommandManifest>();

  const fake = {
    vfs: {
      list: vi.fn(async () => vfsListResult.value),
      stat: vi.fn(async (path: string) => vfsStats.get(path) ?? null),
    },
    commands: {
      register: vi.fn<Kernel["commands"]["register"]>((manifest) => {
        registry.set(manifest.id, manifest);
        return vi.fn(() => {
          registry.delete(manifest.id);
        });
      }),
      unregister: vi.fn((id: string) => {
        registry.delete(id);
      }),
      dispatch: vi.fn(async (id: string, options?: { source?: string }) => {
        dispatchCalls.push({ id, source: options?.source });
        const manifest = registry.get(id);
        if (!manifest) {
          const err = new Error(`Unknown command id: ${id}`);
          err.name = "CommandNotFoundError";
          throw err;
        }
        const context: CommandContext = {
          activeHandle: null,
          kernel: fake,
          payload: {},
          signal: new AbortController().signal,
          source: "terminal",
        };
        await manifest.run(context);
      }),
      list: () => Array.from(registry.values()) as never,
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => {}),
      once: vi.fn(() => () => {}),
      off: vi.fn(),
    },
  } as unknown as Kernel;

  return { kernel: fake, dispatchCalls, vfsListResult, vfsStats };
}

interface HarnessHandles {
  bindings: ReturnType<typeof useTerminalSession>;
  unmount: () => void;
  fake: FakeKernel;
}

function mountSession(): HarnessHandles {
  const fake = makeFakeKernel();
  let bindings: ReturnType<typeof useTerminalSession> | undefined;

  const wrapper = mount(
    defineComponent({
      setup() {
        bindings = useTerminalSession(TEST_HANDLE);
        return () => null;
      },
    }),
    {
      global: {
        provide: { [KernelInjectionKey as symbol]: fake.kernel },
      },
    },
  );

  if (!bindings) {
    throw new Error("useTerminalSession harness failed to capture bindings");
  }

  return { bindings, unmount: () => wrapper.unmount(), fake };
}

describe("resolveCommandId — alias resolution (M2a.3)", () => {
  const testAliases = getInstanceAliases("test-id");

  it("maps every short alias to its canonical command id", () => {
    for (const [alias, target] of Object.entries(testAliases)) {
      expect(resolveCommandId(alias, testAliases)).toBe(target);
    }
  });

  it("ignores arguments after the head token", () => {
    expect(resolveCommandId("ls /home", testAliases)).toBe("terminal:test-id:ls");
    expect(resolveCommandId("  help   ", testAliases)).toBe("terminal:test-id:help");
  });

  it("returns the raw head unchanged when no alias matches (power-user path)", () => {
    expect(resolveCommandId("theme:setDark", testAliases)).toBe("theme:setDark");
    expect(resolveCommandId("custom:thing", testAliases)).toBe("custom:thing");
  });

  it("returns empty string for blank input", () => {
    expect(resolveCommandId("   ", testAliases)).toBe("");
  });
});

describe("useTerminalSession — scrollback + dispatch (M2a.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seeds scrollback with the system welcome line", () => {
    const h = mountSession();
    expect(h.bindings.scrollback.value).toHaveLength(1);
    expect(h.bindings.scrollback.value[0]?.kind).toBe("system");
    expect(h.bindings.scrollback.value[0]?.text).toContain("Terminal");
    h.unmount();
  });

  it("registers the terminal-native commands at mount, scoped to the instance id", () => {
    const h = mountSession();
    const registerMock = h.fake.kernel.commands.register as ReturnType<
      typeof vi.fn<Kernel["commands"]["register"]>
    >;
    const registeredIds = registerMock.mock.calls.map(([manifest]) => manifest.id);

    expect(registeredIds).toEqual([
      `terminal:${TEST_HANDLE}:help`,
      `terminal:${TEST_HANDLE}:clear`,
      `terminal:${TEST_HANDLE}:cd`,
      `terminal:${TEST_HANDLE}:ls`,
      `terminal:${TEST_HANDLE}:new`,
    ]);

    h.unmount();
  });

  it("unregisters terminal:* commands on scope dispose", () => {
    const h = mountSession();
    const registerMock = h.fake.kernel.commands.register as ReturnType<
      typeof vi.fn<Kernel["commands"]["register"]>
    >;
    const disposers = registerMock.mock.results.map((result) => result.value);

    h.unmount();

    for (const d of disposers) {
      expect(d).toHaveBeenCalledTimes(1);
    }
  });

  it("submit pushes the input line + dispatches via kernel.commands", async () => {
    const h = mountSession();

    await h.bindings.submit("help");

    expect(h.fake.dispatchCalls).toEqual([
      { id: `terminal:${TEST_HANDLE}:help`, source: "terminal" },
    ]);
    const kinds = h.bindings.scrollback.value.map((e) => e.kind);
    expect(kinds[0]).toBe("system");
    expect(kinds[1]).toBe("input");
    expect(kinds.slice(2).every((k) => k === "output")).toBe(true);

    h.unmount();
  });

  it("submit('clear') empties scrollback", async () => {
    const h = mountSession();
    await h.bindings.submit("help");
    expect(h.bindings.scrollback.value.length).toBeGreaterThan(2);

    await h.bindings.submit("clear");

    expect(h.bindings.scrollback.value).toEqual([]);

    h.unmount();
  });

  it("submit on unknown command id surfaces error: line", async () => {
    const h = mountSession();

    await h.bindings.submit("nonexistent:command");

    const last = h.bindings.scrollback.value.at(-1);
    expect(last?.kind).toBe("error");
    expect(last?.text).toContain("Unknown command id");

    h.unmount();
  });

  it("submit('theme:toggle') is blocked in Terminal", async () => {
    const h = mountSession();

    await h.bindings.submit("theme:toggle");

    expect(h.fake.dispatchCalls).toEqual([]);
    const last = h.bindings.scrollback.value.at(-1);
    expect(last?.kind).toBe("error");
    expect(last?.text).toContain("Unknown command id: theme:toggle");

    h.unmount();
  });

  it("terminal:help lists only commands from the current Terminal instance", async () => {
    const h = mountSession();
    const registerMock = h.fake.kernel.commands.register as ReturnType<
      typeof vi.fn<Kernel["commands"]["register"]>
    >;

    registerMock({
      id: "theme:toggle",
      title: "Toggle Theme",
      run: vi.fn(),
    });
    registerMock({
      id: "settings:openSection",
      title: "Open Settings Section",
      run: vi.fn(),
    });
    registerMock({
      id: "terminal:other:clear",
      title: "Clear another terminal",
      run: vi.fn(),
    });

    await h.bindings.submit("help");

    const output = h.bindings.scrollback.value.map((entry) => entry.text).join("\n");
    expect(output).toContain("terminal:help");
    expect(output).toContain("terminal:clear");
    expect(output).not.toContain("theme:toggle");
    expect(output).not.toContain("settings:openSection");
    expect(output).not.toContain("terminal:other:clear");

    h.unmount();
  });

  it("submit('ls') lists VFS root entries", async () => {
    const h = mountSession();

    await h.bindings.submit("ls");

    expect(h.fake.dispatchCalls).toEqual([
      { id: `terminal:${TEST_HANDLE}:ls`, source: "terminal" },
    ]);
    expect(h.fake.kernel.vfs.list).toHaveBeenCalledWith("/", { handleId: TEST_HANDLE });
    const last = h.bindings.scrollback.value.at(-1);
    expect(last?.kind).toBe("output");
    expect(last?.text).toBe("home/  readme.txt");

    h.unmount();
  });

  it("submit('ls <path>') passes the path to VFS", async () => {
    const h = mountSession();

    await h.bindings.submit("ls home");

    expect(h.fake.kernel.vfs.list).toHaveBeenCalledWith("/home", { handleId: TEST_HANDLE });

    h.unmount();
  });

  it("submit('cd <path>') changes cwd and makes bare ls use it", async () => {
    const h = mountSession();

    await h.bindings.submit("cd home");
    await h.bindings.submit("ls");

    expect(h.bindings.cwd.value).toBe("/home");
    expect(h.fake.kernel.vfs.stat).toHaveBeenCalledWith("/home", { handleId: TEST_HANDLE });
    expect(h.fake.kernel.vfs.list).toHaveBeenCalledWith("/home", { handleId: TEST_HANDLE });

    h.unmount();
  });

  it("submit('cd') returns to home", async () => {
    const h = mountSession();

    await h.bindings.submit("cd /");
    await h.bindings.submit("cd");

    expect(h.bindings.cwd.value).toBe("/home");

    h.unmount();
  });

  it("submit('cd <file>') rejects non-directory targets", async () => {
    const h = mountSession();

    await h.bindings.submit("cd readme.txt");

    const last = h.bindings.scrollback.value.at(-1);
    expect(last?.kind).toBe("error");
    expect(last?.text).toBe("cd: not a directory: /readme.txt");
    expect(h.bindings.cwd.value).toBe("/");

    h.unmount();
  });

  it("submit('ls') surfaces VFS permission denial", async () => {
    const h = mountSession();
    h.fake.vfsListResult.value = null;

    await h.bindings.submit("ls");

    const last = h.bindings.scrollback.value.at(-1);
    expect(last?.kind).toBe("error");
    expect(last?.text).toBe("ls: permission denied");

    h.unmount();
  });

  it("blank submit is a no-op (no scrollback push, no dispatch)", async () => {
    const h = mountSession();
    const before = h.bindings.scrollback.value.length;

    await h.bindings.submit("   ");

    expect(h.bindings.scrollback.value.length).toBe(before);
    expect(h.fake.dispatchCalls).toEqual([]);

    h.unmount();
  });

  it("submit('new') dispatches terminal:new and emits app.spawn.new via kernel.events", async () => {
    const h = mountSession();

    await h.bindings.submit("new");

    expect(h.fake.dispatchCalls).toEqual([
      { id: `terminal:${TEST_HANDLE}:new`, source: "terminal" },
    ]);
    const emitMock = h.fake.kernel.events.emit as ReturnType<typeof vi.fn>;
    expect(emitMock).toHaveBeenCalledWith("app.spawn.new", {
      manifestId: "terminal",
      source: "terminal",
      args: { parentInstanceId: TEST_HANDLE },
    });

    h.unmount();
  });
});

describe("useTerminalSession — history navigation (M2a.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submit appends to history; prevHistory walks back oldest", async () => {
    const h = mountSession();

    await h.bindings.submit("help");
    await h.bindings.submit("clear");
    await h.bindings.submit("ls");

    expect(h.bindings.history.value).toEqual(["help", "clear", "ls"]);

    expect(h.bindings.prevHistory()).toBe("ls");
    expect(h.bindings.prevHistory()).toBe("clear");
    expect(h.bindings.prevHistory()).toBe("help");
    expect(h.bindings.prevHistory()).toBe("help"); // clamped at oldest

    h.unmount();
  });

  it("nextHistory walks forward and returns empty string when off the end", async () => {
    const h = mountSession();

    await h.bindings.submit("help");
    await h.bindings.submit("clear");

    h.bindings.prevHistory(); // "clear"
    h.bindings.prevHistory(); // "help"

    expect(h.bindings.nextHistory()).toBe("clear");
    expect(h.bindings.nextHistory()).toBe(""); // off the end → empty input
    expect(h.bindings.nextHistory()).toBeUndefined(); // cursor reset, no further

    h.unmount();
  });

  it("resetHistoryCursor restarts navigation from the newest entry", async () => {
    const h = mountSession();
    await h.bindings.submit("help");
    await h.bindings.submit("clear");

    h.bindings.prevHistory(); // "clear"
    h.bindings.prevHistory(); // "help"
    h.bindings.resetHistoryCursor();

    expect(h.bindings.prevHistory()).toBe("clear");

    h.unmount();
  });

  it("prevHistory returns undefined when no history exists", () => {
    const h = mountSession();
    expect(h.bindings.prevHistory()).toBeUndefined();
    expect(h.bindings.nextHistory()).toBeUndefined();
    h.unmount();
  });
});
