import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { CommandRegistry } from "./CommandRegistry";
import { CommandDuplicateError, CommandNotFoundError } from "./errors";
import { kernel } from "./index";
import type {
  CommandContext,
  CommandManifest,
  CommandSource,
  KernelCommandsFacade,
} from "~/types/command";

function makeCtx(overrides?: Partial<CommandContext>): CommandContext {
  return {
    kernel,
    source: "api",
    activeHandle: null,
    payload: Object.freeze({}),
    signal: new AbortController().signal,
    ...overrides,
  };
}

function makeManifest(id: string, run: CommandManifest["run"] = vi.fn()): CommandManifest {
  return {
    id,
    title: id,
    run,
  };
}

describe("CommandRegistry — class (M2a.1)", () => {
  describe("register", () => {
    it("adds the manifest to list() in registration order", () => {
      const registry = new CommandRegistry();

      registry.register(makeManifest("a:one"));
      registry.register(makeManifest("a:two"));
      registry.register(makeManifest("a:three"));

      expect(registry.list().map((m) => m.id)).toEqual(["a:one", "a:two", "a:three"]);
    });

    it("throws CommandDuplicateError on re-register of same id", () => {
      const registry = new CommandRegistry();

      registry.register(makeManifest("dup"));

      expect(() => {
        registry.register(makeManifest("dup"));
      }).toThrow(CommandDuplicateError);

      expect(registry.list()).toHaveLength(1);
    });

    it("returns a disposer that removes the manifest", () => {
      const registry = new CommandRegistry();
      const dispose = registry.register(makeManifest("disposable"));

      expect(registry.has("disposable")).toBe(true);

      dispose();

      expect(registry.has("disposable")).toBe(false);
    });

    it("disposer is idempotent — calling twice is safe", () => {
      const registry = new CommandRegistry();
      const dispose = registry.register(makeManifest("idem"));

      dispose();
      expect(() => {
        dispose();
      }).not.toThrow();

      expect(registry.has("idem")).toBe(false);
    });

    it("stale disposer does NOT remove a re-registered replacement", () => {
      // The stale disposer must not nuke the freshly-registered entry.
      const registry = new CommandRegistry();
      const original = makeManifest("revival");
      const staleDisposer = registry.register(original);

      registry.unregister("revival");

      const replacement = makeManifest("revival");
      registry.register(replacement);

      staleDisposer();

      expect(registry.get("revival")).toBe(replacement);
    });
  });

  describe("unregister", () => {
    it("removes the manifest by id", () => {
      const registry = new CommandRegistry();
      registry.register(makeManifest("removeme"));

      registry.unregister("removeme");

      expect(registry.has("removeme")).toBe(false);
      expect(registry.list()).toEqual([]);
    });

    it("is silent on unknown id (no throw)", () => {
      const registry = new CommandRegistry();

      expect(() => {
        registry.unregister("never-registered");
      }).not.toThrow();
    });
  });

  describe("dispatch", () => {
    it("invokes manifest.run with the supplied context", async () => {
      const registry = new CommandRegistry();
      const run = vi.fn();
      registry.register(makeManifest("d:sync", run));

      const ctx = makeCtx();
      await registry.dispatch("d:sync", ctx);

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(ctx);
    });

    it("awaits async run bodies", async () => {
      const registry = new CommandRegistry();
      let resolved = false;
      registry.register(
        makeManifest("d:async", async () => {
          await new Promise<void>((r) => {
            setTimeout(r, 5);
          });
          resolved = true;
        }),
      );

      await registry.dispatch("d:async", makeCtx());

      expect(resolved).toBe(true);
    });

    it("propagates errors thrown inside run", async () => {
      const registry = new CommandRegistry();
      registry.register(
        makeManifest("d:throw", () => {
          throw new Error("boom");
        }),
      );

      await expect(registry.dispatch("d:throw", makeCtx())).rejects.toThrow("boom");
    });

    it("throws CommandNotFoundError when id is unknown", async () => {
      const registry = new CommandRegistry();

      await expect(registry.dispatch("d:missing", makeCtx())).rejects.toBeInstanceOf(
        CommandNotFoundError,
      );
    });
  });
});

describe("kernel.commands façade — wiring (M2a.1)", () => {
  // and cleans up explicitly so leftover commands do not bleed across tests.
  const REGISTERED_IDS: string[] = [];

  function track(manifest: CommandManifest): CommandManifest {
    REGISTERED_IDS.push(manifest.id);
    return manifest;
  }

  afterEach(() => {
    while (REGISTERED_IDS.length > 0) {
      const id = REGISTERED_IDS.pop();
      if (id) {
        kernel.commands.unregister(id);
      }
    }
    vi.restoreAllMocks();
  });

  it("emits command.registered with the manifest id after register", () => {
    const onRegistered = vi.fn();
    const dispose = kernel.events.on("command.registered", onRegistered);

    kernel.commands.register(track(makeManifest("facade:reg")));

    expect(onRegistered).toHaveBeenCalledWith({ id: "facade:reg" });

    dispose();
  });

  it("emits command.unregistered when an existing command is removed", () => {
    kernel.commands.register(track(makeManifest("facade:unreg")));

    const onUnregistered = vi.fn();
    const dispose = kernel.events.on("command.unregistered", onUnregistered);

    kernel.commands.unregister("facade:unreg");

    expect(onUnregistered).toHaveBeenCalledWith({ id: "facade:unreg" });

    dispose();
  });

  it("unregister of unknown id does NOT emit command.unregistered", () => {
    const onUnregistered = vi.fn();
    const dispose = kernel.events.on("command.unregistered", onUnregistered);

    kernel.commands.unregister("facade:never");

    expect(onUnregistered).not.toHaveBeenCalled();

    dispose();
  });

  it("disposer returned from register emits command.unregistered exactly once", () => {
    const onUnregistered = vi.fn();
    const dispose = kernel.events.on("command.unregistered", onUnregistered);

    const disposeCommand = kernel.commands.register(makeManifest("facade:disp"));

    disposeCommand();
    disposeCommand(); // idempotent — second call is a no-op

    expect(onUnregistered).toHaveBeenCalledTimes(1);
    expect(onUnregistered).toHaveBeenCalledWith({ id: "facade:disp" });

    dispose();
  });

  it("dispatch defaults source to 'api' when caller omits options", async () => {
    const run = vi.fn();
    kernel.commands.register(track(makeManifest("facade:src-default", run)));

    await kernel.commands.dispatch("facade:src-default");

    expect(run).toHaveBeenCalledTimes(1);
    const ctx = run.mock.calls[0]?.[0] as CommandContext;
    expect(ctx.source).toBe("api");
    expect(ctx.activeHandle).toBeNull();
    expect(ctx.kernel).toBe(kernel);
    expect(ctx.payload).toEqual({});
    expect(Object.isFrozen(ctx.payload)).toBe(true);
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
  });

  it("dispatch threads caller-supplied source / activeHandle / payload / signal", async () => {
    const run = vi.fn();
    kernel.commands.register(track(makeManifest("facade:src-custom", run)));

    const ac = new AbortController();
    await kernel.commands.dispatch("facade:src-custom", {
      source: "spotlight",
      payload: { foo: "bar" },
      signal: ac.signal,
    });

    const ctx = run.mock.calls[0]?.[0] as CommandContext;
    expect(ctx.source).toBe("spotlight");
    expect(ctx.payload).toEqual({ foo: "bar" });
    expect(Object.isFrozen(ctx.payload)).toBe(true);
    expect(ctx.signal).toBe(ac.signal);
  });

  it("dispatch propagates CommandNotFoundError for unknown ids", async () => {
    await expect(kernel.commands.dispatch("facade:missing")).rejects.toBeInstanceOf(
      CommandNotFoundError,
    );
  });

  it("list returns a snapshot containing registered commands", () => {
    kernel.commands.register(track(makeManifest("facade:list-a")));
    kernel.commands.register(track(makeManifest("facade:list-b")));

    const ids = kernel.commands.list().map((m) => m.id);
    expect(ids).toContain("facade:list-a");
    expect(ids).toContain("facade:list-b");
  });
});

describe("CommandContext + CommandManifest — type contract (M2a.1)", () => {
  it("CommandContext matches §4.1 spec shape", () => {
    expectTypeOf<CommandContext>().toHaveProperty("kernel");
    expectTypeOf<CommandContext>().toHaveProperty("source");
    expectTypeOf<CommandContext>().toHaveProperty("activeHandle");
    expectTypeOf<CommandContext>().toHaveProperty("payload");
    expectTypeOf<CommandContext>().toHaveProperty("signal");

    expectTypeOf<CommandContext["source"]>().toEqualTypeOf<CommandSource>();
    expectTypeOf<CommandContext["payload"]>().toEqualTypeOf<Readonly<Record<string, unknown>>>();
    expectTypeOf<CommandContext["signal"]>().toEqualTypeOf<AbortSignal>();
  });

  it("CommandManifest.run accepts CommandContext and returns void | Promise<void>", () => {
    expectTypeOf<CommandManifest["run"]>().parameters.toEqualTypeOf<[CommandContext]>();
    expectTypeOf<CommandManifest["run"]>().returns.toEqualTypeOf<void | Promise<void>>();
  });

  it("KernelCommandsFacade.dispatch always returns Promise<void>", () => {
    expectTypeOf<KernelCommandsFacade["dispatch"]>().returns.toEqualTypeOf<Promise<void>>();
  });
});
