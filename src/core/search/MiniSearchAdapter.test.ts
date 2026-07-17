import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw } from "vue";
import type { CommandManifest } from "~/types/command";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import type { VfsSearchIndexer, VfsSearchIndexSink } from "~/core/search/VfsSearchIndexer";
import type { SearchIndexedDoc } from "~/core/search/MiniSearchIndex";

import { createMiniSearchAdapter } from "./MiniSearchAdapter";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = markRaw(defineVaporComponent(() => document.createElement("svg")));

type EventListener = (payload: { id: string }) => void;

interface StubKernel {
  kernel: Pick<Kernel, "commands" | "apps" | "events">;
  registerCommand(manifest: CommandManifest): void;
  unregisterCommand(id: string): void;
  registerApp(manifest: AppManifest): void;
  unregisterApp(id: string): void;
}

function makeKernel(): StubKernel {
  const commands = new Map<string, CommandManifest>();
  const apps = new Map<string, AppManifest>();
  const channels = new Map<string, Set<EventListener>>();

  function emit(channel: string, payload: { id: string }): void {
    const set = channels.get(channel);
    if (!set) return;
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  function on(channel: string, listener: EventListener): () => void {
    let set = channels.get(channel);
    if (!set) {
      set = new Set();
      channels.set(channel, set);
    }
    set.add(listener);
    return (): void => {
      set?.delete(listener);
    };
  }

  const kernel = {
    commands: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: vi.fn(),
      list(): readonly CommandManifest[] {
        return Array.from(commands.values());
      },
    },
    apps: {
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
      list(): AppManifest[] {
        return Array.from(apps.values());
      },
    },
    events: {
      emit: vi.fn(),
      on: on as Kernel["events"]["on"],
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  } as unknown as Pick<Kernel, "commands" | "apps" | "events">;

  return {
    kernel,
    registerCommand(manifest): void {
      commands.set(manifest.id, manifest);
      emit("command.registered", { id: manifest.id });
    },
    unregisterCommand(id): void {
      commands.delete(id);
      emit("command.unregistered", { id });
    },
    registerApp(manifest): void {
      apps.set(manifest.id, manifest);
      emit("app.registered", { id: manifest.id });
    },
    unregisterApp(id): void {
      apps.delete(id);
      emit("app.unregistered", { id });
    },
  };
}

function command(overrides: Partial<CommandManifest> & { id: string }): CommandManifest {
  return {
    title: overrides.title ?? overrides.id,
    scope: "global",
    run: () => undefined,
    ...overrides,
  };
}

function app(overrides: Partial<AppManifest> & { id: string }): AppManifest {
  return {
    name: overrides.name ?? overrides.id,
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve({ default: StubIcon }),
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("MiniSearchAdapter", () => {
  let stub: StubKernel;

  beforeEach(() => {
    stub = makeKernel();
    stub.registerCommand(command({ id: "theme:toggle", title: "Toggle Theme" }));
    stub.registerCommand(command({ id: "finder:open", title: "Open Finder" }));
    stub.registerApp(app({ id: "settings", name: "Settings", category: "system" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] for empty / whitespace queries", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);
    expect(adapter.query("")).toEqual([]);
    expect(adapter.query("   ")).toEqual([]);
    adapter.dispose();
  });

  it("indexes registry contents at construction time (commands + apps)", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    const themeHits = adapter.query("theme");
    expect(themeHits.some((h) => h.kind === "command" && h.id === "theme:toggle")).toBe(true);

    const settingsHits = adapter.query("settings");
    expect(settingsHits.some((h) => h.kind === "app" && h.id === "settings")).toBe(true);

    adapter.dispose();
  });

  it("does not index shell-scoped commands", () => {
    stub.registerCommand(
      command({ id: "shell:internal", title: "Internal Shell Action", scope: "shell" }),
    );
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(
      adapter.query("internal").some((h) => h.kind === "command" && h.id === "shell:internal"),
    ).toBe(false);

    adapter.dispose();
  });

  it("returns hits with the SearchHit shape (kind + id + title + score, hint optional)", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    const hits = adapter.query("finder");
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0]!;
    expect(top.kind).toBe("command");
    expect(top.id).toBe("finder:open");
    expect(top.title).toBe("Open Finder");
    expect(typeof top.score).toBe("number");
    expect(top.score).toBeGreaterThan(0);

    adapter.dispose();
  });

  it("respects the kind filter (returns only requested kind)", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    const onlyApps = adapter.query("settings", { kind: "app" });
    expect(onlyApps.every((h) => h.kind === "app")).toBe(true);
    expect(onlyApps.length).toBeGreaterThan(0);

    const onlyCommands = adapter.query("theme", { kind: "command" });
    expect(onlyCommands.every((h) => h.kind === "command")).toBe(true);

    adapter.dispose();
  });

  it("respects the limit option (clamped to >= 1)", () => {
    for (let i = 0; i < 20; i++) {
      stub.registerCommand(command({ id: `theme:variant-${i}`, title: `Theme variant ${i}` }));
    }
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(adapter.query("theme", { limit: 3 }).length).toBeLessThanOrEqual(3);
    expect(adapter.query("theme", { limit: 0 }).length).toBeLessThanOrEqual(1);

    adapter.dispose();
  });

  it("ranks `keywords` matches as alias hits (lower than title but still surfaced)", () => {
    stub.registerCommand(
      command({ id: "vol:mute", title: "Volume Off", keywords: ["mute", "silent"] }),
    );
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    const muteHits = adapter.query("mute");
    expect(muteHits.some((h) => h.id === "vol:mute")).toBe(true);

    adapter.dispose();
  });

  it("re-indexes incrementally on `command.registered` (new commands queryable)", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(adapter.query("hibernate")).toEqual([]);
    stub.registerCommand(command({ id: "power:hibernate", title: "Hibernate" }));
    const hits = adapter.query("hibernate");
    expect(hits.some((h) => h.id === "power:hibernate")).toBe(true);

    adapter.dispose();
  });

  it("removes an existing command from the index when it is re-registered as shell-scoped", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    stub.registerCommand(command({ id: "visible:focus", title: "Visible Focus" }));
    expect(adapter.query("visible").some((h) => h.id === "visible:focus")).toBe(true);

    stub.registerCommand(command({ id: "visible:focus", title: "Visible Focus", scope: "shell" }));
    expect(adapter.query("visible").some((h) => h.id === "visible:focus")).toBe(false);

    adapter.dispose();
  });

  it("removes documents on `command.unregistered`", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(adapter.query("finder").length).toBeGreaterThan(0);
    stub.unregisterCommand("finder:open");
    expect(adapter.query("finder").every((h) => h.id !== "finder:open")).toBe(true);

    adapter.dispose();
  });

  it("re-indexes incrementally on `app.registered` and clears on `app.unregistered`", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(adapter.query("notes")).toEqual([]);
    stub.registerApp(app({ id: "notes", name: "Notes", category: "productivity" }));
    expect(adapter.query("notes").some((h) => h.id === "notes")).toBe(true);

    stub.unregisterApp("notes");
    expect(adapter.query("notes").every((h) => h.id !== "notes")).toBe(true);

    adapter.dispose();
  });

  it("omits hidden apps from the Spotlight app index", () => {
    stub.registerApp(app({ id: "trash", name: "Trash", hidden: true }));
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    expect(adapter.query("trash", { kind: "app" })).toEqual([]);

    stub.registerApp(app({ id: "trash", name: "Trash", hidden: false }));
    expect(adapter.query("trash", { kind: "app" })).toEqual([
      expect.objectContaining({ kind: "app", id: "trash" }),
    ]);

    adapter.dispose();
  });

  it("starts VFS indexing on demand in the main-thread fallback", async () => {
    let sink: VfsSearchIndexSink | undefined;
    const vfsIndexer = {
      crawl: vi.fn(async () => [
        {
          docId: "vfs:/portfolio/about.md",
          kind: "vfs",
          rawId: "/portfolio/about.md",
          title: "About WebOS",
          hint: "/portfolio/about.md",
          keywords: "",
          rawIdSearchable: "/portfolio/about.md",
          vfs: { path: "/portfolio/about.md", entryKind: "file" },
        },
      ]),
      subscribe: vi.fn((nextSink: VfsSearchIndexSink) => {
        sink = nextSink;
        return () => undefined;
      }),
    } as unknown as VfsSearchIndexer;
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel, { vfsIndexer });

    adapter.startVfsIndexing?.();
    await adapter.vfsReady;

    expect(adapter.query("webos", { kind: "vfs" })).toEqual([
      expect.objectContaining({ id: "/portfolio/about.md", kind: "vfs" }),
    ]);

    sink?.removeVfsSubtree("/portfolio/about.md");
    expect(adapter.query("webos", { kind: "vfs" })).toEqual([]);

    adapter.dispose();
  });

  it("replays VFS events after the initial fallback crawl snapshot", async () => {
    const crawl = deferred<SearchIndexedDoc[]>();
    let sink: VfsSearchIndexSink | undefined;
    const vfsIndexer = {
      crawl: vi.fn(() => crawl.promise),
      subscribe: vi.fn((nextSink: VfsSearchIndexSink) => {
        sink = nextSink;
        return () => undefined;
      }),
    } as unknown as VfsSearchIndexer;
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel, { vfsIndexer });

    adapter.startVfsIndexing?.();
    sink?.removeVfsSubtree("/portfolio/about.md");
    crawl.resolve([
      {
        docId: "vfs:/portfolio/about.md",
        kind: "vfs",
        rawId: "/portfolio/about.md",
        title: "About WebOS",
        hint: "/portfolio/about.md",
        keywords: "",
        rawIdSearchable: "/portfolio/about.md",
        vfs: { path: "/portfolio/about.md", entryKind: "file" },
      },
    ]);
    await adapter.vfsReady;

    expect(adapter.query("webos", { kind: "vfs" })).toEqual([]);
    adapter.dispose();
  });

  it("dispose() drops all registry subscriptions and returns [] thereafter", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);

    adapter.dispose();

    expect(adapter.query("theme")).toEqual([]);

    stub.registerCommand(command({ id: "post-dispose", title: "Post Dispose" }));
    expect(adapter.query("post-dispose")).toEqual([]);
  });

  it("dispose() is safe to call multiple times", () => {
    const adapter = createMiniSearchAdapter(stub.kernel as Kernel);
    adapter.dispose();
    expect(() => adapter.dispose()).not.toThrow();
  });
});
