import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, type Ref } from "vue";

import { useSpotlight } from "~/composables/useSpotlight";
import { useSpotlightRecentsStore } from "~/core/spotlight/SpotlightRecentsStore";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type { SearchHit, SearchQueryOptions } from "~/types/search";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

interface FakeKernelHandle {
  kernel: Kernel;
  queryCalls: {
    text: string;
    options: SearchQueryOptions | undefined;
    resolve: (hits: SearchHit[]) => void;
  }[];
  dispatchSpy: ReturnType<typeof vi.fn>;
  emitSpy: ReturnType<typeof vi.fn>;
}

function makeFakeKernel(opts?: { dispatchError?: Error }): FakeKernelHandle {
  const queryCalls: FakeKernelHandle["queryCalls"] = [];

  const dispatchSpy = vi.fn(async () => {
    if (opts?.dispatchError) throw opts.dispatchError;
  });

  const emitSpy = vi.fn();

  const kernel = {
    search: {
      query: vi.fn((text: string, options?: SearchQueryOptions) => {
        return new Promise<SearchHit[]>((resolve) => {
          queryCalls.push({ text, options, resolve });
        });
      }),
    },
    commands: { dispatch: dispatchSpy },
    events: {
      emit: emitSpy,
      on: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;

  return { kernel, queryCalls, dispatchSpy, emitSpy };
}

interface Harness {
  bindings: ReturnType<typeof useSpotlight>;
  unmount: () => void;
}

function harness(kernel: Kernel): Harness {
  let bindings: ReturnType<typeof useSpotlight> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        bindings = useSpotlight();
        return () => null;
      },
    }),
    { global: { provide: { [KernelInjectionKey as symbol]: kernel } } },
  );
  if (!bindings) throw new Error("useSpotlight harness failed to capture bindings");
  return { bindings, unmount: () => wrapper.unmount() };
}

describe("useSpotlight() composable", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
  });

  afterEach(() => {
    useSpotlightRecentsStore().dispose();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe("open / close lifecycle", () => {
    it("starts closed with empty transient state", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      expect(bindings.open.value).toBe(false);
      expect(bindings.query.value).toBe("");
      expect(bindings.hits.value).toEqual([]);
      expect(bindings.pending.value).toBe(false);

      unmount();
    });

    it("openSpotlight() sets open=true and N instances share the same recents source", async () => {
      const fake = makeFakeKernel();
      const { bindings: a, unmount: unmountA } = harness(fake.kernel);
      const { bindings: b, unmount: unmountB } = harness(fake.kernel);

      a.openSpotlight();
      b.openSpotlight();

      expect(a.open.value).toBe(true);
      expect(b.open.value).toBe(true);

      await a.dispatch("command", "shared");
      expect(a.recents.value[0]?.id).toBe("shared");
      expect(b.recents.value[0]?.id).toBe("shared");

      unmountA();
      unmountB();
    });

    it("ensureRecentsHydrated respects store.isHydrated() — no double-hydrate", () => {
      const fake = makeFakeKernel();
      const store = useSpotlightRecentsStore();
      const hydrateSpy = vi.spyOn(store, "hydrate");

      const { bindings: a, unmount: unmountA } = harness(fake.kernel);
      const { bindings: b, unmount: unmountB } = harness(fake.kernel);

      a.openSpotlight();
      a.closeSpotlight();
      a.openSpotlight();
      b.openSpotlight();

      expect(hydrateSpy).toHaveBeenCalledTimes(1);
      expect(store.isHydrated()).toBe(true);

      unmountA();
      unmountB();
    });

    it("toggle() flips between open and closed", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.toggle();
      expect(bindings.open.value).toBe(true);
      bindings.toggle();
      expect(bindings.open.value).toBe(false);

      unmount();
    });

    it("closeSpotlight() resets transient state but recents persist", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("foo");
      vi.advanceTimersByTime(80);
      fake.queryCalls[0]?.resolve([{ kind: "command", id: "cmd", title: "Cmd", score: 1 }]);
      return Promise.resolve().then(() => {
        bindings.closeSpotlight();
        expect(bindings.open.value).toBe(false);
        expect(bindings.query.value).toBe("");
        expect(bindings.hits.value).toEqual([]);
        expect(bindings.pending.value).toBe(false);
        unmount();
      });
    });
  });

  describe("debounced query → search", () => {
    it("waits 80ms before calling kernel.search.query", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("about");
      expect(fake.queryCalls.length).toBe(0);
      expect(bindings.pending.value).toBe(false);

      vi.advanceTimersByTime(79);
      expect(fake.queryCalls.length).toBe(0);

      vi.advanceTimersByTime(1);
      expect(fake.queryCalls.length).toBe(1);
      expect(fake.queryCalls[0]?.text).toBe("about");
      expect(fake.queryCalls[0]?.options).toEqual({
        limit: 20,
        include: ["app", "vfs", "command"],
        perKindLimit: { app: 6, vfs: 8, command: 6 },
      });
      expect(bindings.pending.value).toBe(true);

      unmount();
    });

    it("coalesces rapid keystrokes into one search call", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("a");
      vi.advanceTimersByTime(20);
      bindings.setQuery("ab");
      vi.advanceTimersByTime(20);
      bindings.setQuery("abc");
      vi.advanceTimersByTime(80);

      expect(fake.queryCalls.length).toBe(1);
      expect(fake.queryCalls[0]?.text).toBe("abc");

      unmount();
    });

    it("empty query takes the recents fast path (no kernel call, no debounce)", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("foo");
      vi.advanceTimersByTime(80);
      fake.queryCalls[0]?.resolve([{ kind: "app", id: "a", title: "A", score: 1 }]);

      return Promise.resolve().then(() => {
        bindings.setQuery("");
        expect(bindings.hits.value).toEqual([]);
        expect(bindings.pending.value).toBe(false);
        vi.advanceTimersByTime(200);
        expect(fake.queryCalls.length).toBe(1);
        unmount();
      });
    });

    it("whitespace-only query is treated as empty", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("   \t   ");
      vi.advanceTimersByTime(200);
      expect(fake.queryCalls.length).toBe(0);

      unmount();
    });
  });

  describe("stale-resolve drop (runId race)", () => {
    it("ignores an older in-flight resolve when a newer query started", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("alpha");
      vi.advanceTimersByTime(80);
      bindings.setQuery("beta");
      vi.advanceTimersByTime(80);

      expect(fake.queryCalls.length).toBe(2);

      fake.queryCalls[1]?.resolve([{ kind: "app", id: "beta", title: "Beta", score: 1 }]);
      await Promise.resolve();
      expect(bindings.hits.value).toEqual([{ kind: "app", id: "beta", title: "Beta", score: 1 }]);

      // Resolve older call AFTER — must NOT clobber.
      fake.queryCalls[0]?.resolve([{ kind: "app", id: "alpha", title: "Alpha", score: 1 }]);
      await Promise.resolve();
      expect(bindings.hits.value).toEqual([{ kind: "app", id: "beta", title: "Beta", score: 1 }]);

      unmount();
    });

    it("late resolve after closeSpotlight() does not repopulate hits", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("alpha");
      vi.advanceTimersByTime(80);
      bindings.closeSpotlight();

      fake.queryCalls[0]?.resolve([{ kind: "app", id: "alpha", title: "A", score: 1 }]);
      await Promise.resolve();

      expect(bindings.hits.value).toEqual([]);
      expect(bindings.pending.value).toBe(false);

      unmount();
    });

    it("late resolve after onScopeDispose does not throw or mutate", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("ghost");
      vi.advanceTimersByTime(80);
      unmount();

      // Resolve after teardown — assertion is that nothing throws.
      fake.queryCalls[0]?.resolve([{ kind: "command", id: "c", title: "C", score: 1 }]);
      await Promise.resolve();

      expect(bindings.hits.value).toEqual([]);
    });
  });

  describe("dispatch", () => {
    it("calls kernel.commands.dispatch for kind=command and pushes recents", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      await bindings.dispatch("command", "finder:open");

      expect(fake.dispatchSpy).toHaveBeenCalledWith("finder:open");
      expect(bindings.open.value).toBe(false);
      expect(bindings.recents.value[0]).toEqual({
        kind: "command",
        id: "finder:open",
        usedAt: 1_700_000_000_000,
      });

      unmount();
    });

    it("emits app.launch.requested for kind=app and pushes recents", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      await bindings.dispatch("app", "settings");

      expect(fake.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
        manifestId: "settings",
        source: "spotlight",
      });
      expect(bindings.recents.value[0]).toEqual({
        kind: "app",
        id: "settings",
        usedAt: 1_700_000_000_000,
      });

      unmount();
    });

    it("pushes recents BEFORE awaiting kernel — even when dispatch throws", async () => {
      const fake = makeFakeKernel({ dispatchError: new Error("boom") });
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      const callOrder: string[] = [];
      await expect(
        (async () => {
          callOrder.push("dispatch:start");
          await bindings.dispatch("command", "broken:cmd");
        })(),
      ).rejects.toThrow("boom");

      expect(bindings.recents.value[0]).toEqual({
        kind: "command",
        id: "broken:cmd",
        usedAt: 1_700_000_000_000,
      });
      expect(bindings.open.value).toBe(false);

      unmount();
    });

    it("emits Finder launch and reveal events for kind=vfs without pushing recents", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.hits.value = [
        {
          kind: "vfs",
          id: "/portfolio/posts/field-notes.md",
          title: "Field Notes",
          hint: "/portfolio/posts/field-notes.md",
          score: 1,
          vfs: {
            path: "/portfolio/posts/field-notes.md",
            entryKind: "file",
            mimeType: "text/markdown",
          },
        },
      ];

      await bindings.dispatch("vfs", "/portfolio/posts/field-notes.md");

      expect(fake.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
        manifestId: "finder",
        source: "spotlight",
        args: { path: "/portfolio/posts", reveal: "/portfolio/posts/field-notes.md" },
      });
      expect(fake.emitSpy).toHaveBeenCalledWith("finder.reveal.requested", {
        path: "/portfolio/posts",
        reveal: "/portfolio/posts/field-notes.md",
        source: "spotlight",
      });
      expect(bindings.recents.value).toEqual([]);

      unmount();
    });

    it("opens PDF VFS hits directly in PDF Viewer", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.hits.value = [
        {
          kind: "vfs",
          id: "/home/manual.pdf",
          title: "manual.pdf",
          hint: "/home/manual.pdf",
          score: 1,
          vfs: {
            path: "/home/manual.pdf",
            entryKind: "file",
            mimeType: "application/pdf",
          },
        },
      ];

      await bindings.dispatch("vfs", "/home/manual.pdf");

      expect(fake.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
        manifestId: "pdf-viewer",
        source: "spotlight",
        args: { path: "/home/manual.pdf" },
      });
      expect(fake.emitSpy).not.toHaveBeenCalledWith("finder.reveal.requested", expect.anything());
      expect(bindings.recents.value).toEqual([]);

      unmount();
    });

    it("opens Slidev deck VFS hits directly in Slides", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.hits.value = [
        {
          kind: "vfs",
          id: "/home/slides/demo/slides.md",
          title: "slides.md",
          hint: "/home/slides/demo/slides.md",
          score: 1,
          vfs: {
            path: "/home/slides/demo/slides.md",
            entryKind: "file",
            mimeType: "text/markdown",
          },
        },
      ];

      await bindings.dispatch("vfs", "/home/slides/demo/slides.md");

      expect(fake.emitSpy).toHaveBeenCalledWith("app.launch.requested", {
        manifestId: "slides",
        source: "spotlight",
        args: { path: "/home/slides/demo/slides.md" },
      });
      expect(fake.emitSpy).toHaveBeenCalledWith("slides.open.requested", {
        source: "spotlight",
        path: "/home/slides/demo/slides.md",
      });
      expect(fake.emitSpy).not.toHaveBeenCalledWith("finder.reveal.requested", expect.anything());
      expect(bindings.recents.value).toEqual([]);

      unmount();
    });

    it("dedupes recents: re-dispatching same (kind,id) promotes to head", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      await bindings.dispatch("command", "a");
      bindings.openSpotlight();
      await bindings.dispatch("command", "b");
      bindings.openSpotlight();
      await bindings.dispatch("command", "a");

      const ids = (bindings.recents as Ref<readonly { id: string }[]>).value.map((r) => r.id);
      expect(ids).toEqual(["a", "b"]);

      unmount();
    });
  });

  describe("teardown", () => {
    it("onScopeDispose clears pending debounce timers", () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      bindings.setQuery("queued");
      unmount();

      // Advancing past the debounce window must NOT trigger a search.
      vi.advanceTimersByTime(500);
      expect(fake.queryCalls.length).toBe(0);
    });

    it("dispatched updates after unmount stay in the singleton recents store", async () => {
      const fake = makeFakeKernel();
      const { bindings, unmount } = harness(fake.kernel);

      bindings.openSpotlight();
      await bindings.dispatch("command", "persisted");
      unmount();

      const { bindings: bindings2, unmount: unmount2 } = harness(fake.kernel);
      bindings2.openSpotlight();
      await nextTick();
      expect(bindings2.recents.value[0]?.id).toBe("persisted");

      unmount2();
    });
  });
});
