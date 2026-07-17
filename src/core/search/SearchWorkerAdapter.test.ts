import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw } from "vue";

import { debugWarn } from "~/core/debug";
import { wrapRpcMethod } from "~/core/ipc/rpc";
import { MiniSearchIndex, type SearchIndexedDoc } from "~/core/search/MiniSearchIndex";
import {
  createSearchWorkerAdapter,
  type SearchWorkerApi,
  type SearchWorkerClient,
} from "~/core/search/SearchWorkerAdapter";
import type { AppManifest } from "~/types/app";
import type { CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";
import type { SearchHit, SearchQueryOptions } from "~/types/search";
import type { VfsSearchIndexer, VfsSearchIndexSink } from "~/core/search/VfsSearchIndexer";

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
    if (!set) {
      return;
    }

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

function createFakeClient() {
  const index = new MiniSearchIndex();
  const terminate = vi.fn(() => index.dispose());
  const api: SearchWorkerApi = {
    ready: wrapRpcMethod(() => undefined),
    rebuild: wrapRpcMethod((docs: SearchIndexedDoc[]) => index.rebuild(docs)),
    replace: wrapRpcMethod((doc: SearchIndexedDoc) => index.replace(doc)),
    replaceMany: wrapRpcMethod((docs: SearchIndexedDoc[]) => index.replaceMany(docs)),
    remove: wrapRpcMethod((docId: string) => index.remove(docId)),
    removeVfsSubtree: wrapRpcMethod((path: string) => index.removeVfsSubtree(path)),
    query: wrapRpcMethod((text: string, options?: SearchQueryOptions): SearchHit[] =>
      index.query(text, options),
    ),
  } satisfies SearchWorkerApi;

  return {
    client: { api, terminate } satisfies SearchWorkerClient,
    terminate,
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

describe("SearchWorkerAdapter", () => {
  let stub: StubKernel;

  beforeEach(() => {
    stub = makeKernel();
    stub.registerCommand(command({ id: "theme:toggle", title: "Toggle Theme" }));
    stub.registerApp(app({ id: "settings", name: "Settings", category: "system" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rebuilds the worker index from the initial registry snapshot", async () => {
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    const themeHits = await adapter.query("theme");
    expect(themeHits.some((hit) => hit.kind === "command" && hit.id === "theme:toggle")).toBe(true);

    const settingsHits = await adapter.query("settings");
    expect(settingsHits.some((hit) => hit.kind === "app" && hit.id === "settings")).toBe(true);

    adapter.dispose();
  });

  it("does not index shell-scoped commands", async () => {
    stub.registerCommand(
      command({ id: "shell:internal", title: "Internal Shell Action", scope: "shell" }),
    );
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    const hits = await adapter.query("internal");
    expect(hits.some((hit) => hit.kind === "command" && hit.id === "shell:internal")).toBe(false);

    adapter.dispose();
  });

  it("serializes registry updates ahead of subsequent queries", async () => {
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    await expect(adapter.query("hibernate")).resolves.toEqual([]);

    stub.registerCommand(command({ id: "power:hibernate", title: "Hibernate" }));
    const hits = await adapter.query("hibernate");
    expect(hits.some((hit) => hit.id === "power:hibernate")).toBe(true);

    stub.unregisterCommand("power:hibernate");
    const afterRemove = await adapter.query("hibernate");
    expect(afterRemove.every((hit) => hit.id !== "power:hibernate")).toBe(true);

    adapter.dispose();
  });

  it("removes an existing command from the worker index when it becomes shell-scoped", async () => {
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    stub.registerCommand(command({ id: "visible:focus", title: "Visible Focus" }));
    expect((await adapter.query("visible")).some((hit) => hit.id === "visible:focus")).toBe(true);

    stub.registerCommand(command({ id: "visible:focus", title: "Visible Focus", scope: "shell" }));
    expect((await adapter.query("visible")).some((hit) => hit.id === "visible:focus")).toBe(false);

    adapter.dispose();
  });

  it("syncs app register/unregister events through the worker queue", async () => {
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    await expect(adapter.query("notes")).resolves.toEqual([]);

    stub.registerApp(app({ id: "notes", name: "Notes", category: "productivity" }));
    const hits = await adapter.query("notes");
    expect(hits.some((hit) => hit.kind === "app" && hit.id === "notes")).toBe(true);

    stub.unregisterApp("notes");
    const afterRemove = await adapter.query("notes");
    expect(afterRemove.every((hit) => hit.id !== "notes")).toBe(true);

    adapter.dispose();
  });

  it("omits hidden apps from the worker app index", async () => {
    stub.registerApp(app({ id: "trash", name: "Trash", hidden: true }));
    const { client } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    await expect(adapter.query("trash", { kind: "app" })).resolves.toEqual([]);

    stub.registerApp(app({ id: "trash", name: "Trash", hidden: false }));
    await expect(adapter.query("trash", { kind: "app" })).resolves.toEqual([
      expect.objectContaining({ kind: "app", id: "trash" }),
    ]);

    adapter.dispose();
  });

  it("starts VFS indexing on demand and serializes VFS updates", async () => {
    const { client } = createFakeClient();
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
        } satisfies SearchIndexedDoc,
      ]),
      subscribe: vi.fn((nextSink: VfsSearchIndexSink) => {
        sink = nextSink;
        return () => undefined;
      }),
    } as unknown as VfsSearchIndexer;
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
      vfsIndexer,
    });

    adapter.startVfsIndexing();
    await adapter.vfsReady;

    await expect(adapter.query("webos", { kind: "vfs" })).resolves.toEqual([
      expect.objectContaining({ id: "/portfolio/about.md", kind: "vfs" }),
    ]);

    sink?.removeVfsSubtree("/portfolio/about.md");
    await expect(adapter.query("webos", { kind: "vfs" })).resolves.toEqual([]);

    adapter.dispose();
  });

  it("does not block command/app queries behind the initial VFS crawl", async () => {
    const { client } = createFakeClient();
    const crawl = deferred<SearchIndexedDoc[]>();
    const vfsIndexer = {
      crawl: vi.fn(() => crawl.promise),
      subscribe: vi.fn(() => () => undefined),
    } as unknown as VfsSearchIndexer;
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
      vfsIndexer,
    });

    adapter.startVfsIndexing();

    const themeHits = await adapter.query("theme");
    expect(themeHits.some((hit) => hit.kind === "command" && hit.id === "theme:toggle")).toBe(true);

    crawl.resolve([]);
    await adapter.vfsReady;
    adapter.dispose();
  });

  it("replays VFS events after the initial crawl snapshot", async () => {
    const { client } = createFakeClient();
    const crawl = deferred<SearchIndexedDoc[]>();
    let sink: VfsSearchIndexSink | undefined;
    const vfsIndexer = {
      crawl: vi.fn(() => crawl.promise),
      subscribe: vi.fn((nextSink: VfsSearchIndexSink) => {
        sink = nextSink;
        return () => undefined;
      }),
    } as unknown as VfsSearchIndexer;
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
      vfsIndexer,
    });

    adapter.startVfsIndexing();
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

    await expect(adapter.query("webos", { kind: "vfs" })).resolves.toEqual([]);
    adapter.dispose();
  });

  it("returns [] and warns when the worker query envelope is an error", async () => {
    const terminate = vi.fn();
    const client: SearchWorkerClient = {
      api: {
        ready: wrapRpcMethod(() => undefined),
        rebuild: wrapRpcMethod(() => undefined),
        replace: wrapRpcMethod(() => undefined),
        replaceMany: wrapRpcMethod(() => undefined),
        remove: wrapRpcMethod(() => undefined),
        removeVfsSubtree: wrapRpcMethod(() => undefined),
        query: async () => ({
          version: 1,
          ok: false,
          error: { name: "WorkerSearchError", message: "boom" },
        }),
      },
      terminate,
    };
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    await expect(adapter.query("theme")).resolves.toEqual([]);
    expect(debugWarn).toHaveBeenCalledWith(
      "[search-worker]",
      "query failed",
      expect.objectContaining({ name: "WorkerSearchError" }),
    );

    adapter.dispose();
  });

  it("dispose unsubscribes, terminates the client, and makes future queries empty", async () => {
    const { client, terminate } = createFakeClient();
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
    });

    adapter.dispose();
    adapter.dispose();

    expect(terminate).toHaveBeenCalledTimes(1);
    await expect(adapter.query("theme")).resolves.toEqual([]);

    stub.registerCommand(command({ id: "post-dispose", title: "Post Dispose" }));
    await expect(adapter.query("post-dispose")).resolves.toEqual([]);
  });

  it("exposes a ready promise that rejects when the worker never responds", async () => {
    const terminate = vi.fn();
    const client: SearchWorkerClient = {
      api: {
        ready: () => new Promise<never>(() => undefined),
        rebuild: wrapRpcMethod(() => undefined),
        replace: wrapRpcMethod(() => undefined),
        replaceMany: wrapRpcMethod(() => undefined),
        remove: wrapRpcMethod(() => undefined),
        removeVfsSubtree: wrapRpcMethod(() => undefined),
        query: wrapRpcMethod((): SearchHit[] => []),
      },
      terminate,
    };
    const adapter = createSearchWorkerAdapter(stub.kernel as Kernel, {
      createClient: () => client,
      readyTimeoutMs: 1,
    });

    await expect(adapter.ready).rejects.toMatchObject({ name: "JobTimeoutError" });

    adapter.dispose();
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
