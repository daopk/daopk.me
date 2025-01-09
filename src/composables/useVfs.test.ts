import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { useVfs } from "~/composables/useVfs";

import { AppContextInjectionKey, type AppContext } from "~/types/app";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";

function makeContext(handleId = "handle-1"): AppContext {
  return Object.freeze({
    manifestId: "finder",
    handleId,
    args: Object.freeze({}),
  });
}

function makeKernel(): Kernel {
  return {
    vfs: {
      stat: vi.fn(async () => null),
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      readText: vi.fn(async () => null),
      write: vi.fn(async () => null),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
  } as unknown as Kernel;
}

function mountHarness(kernel: Kernel, context?: AppContext): ReturnType<typeof useVfs> {
  let bindings: ReturnType<typeof useVfs> | undefined;

  const provide: Record<symbol, unknown> = {
    [KernelInjectionKey as symbol]: kernel,
  };
  if (context !== undefined) {
    provide[AppContextInjectionKey as symbol] = context;
  }

  mount(
    defineComponent({
      setup() {
        bindings = useVfs();
        return () => null;
      },
    }),
    {
      global: { provide },
    },
  );

  if (bindings === undefined) {
    throw new Error("useVfs harness failed to capture bindings");
  }

  return bindings;
}

describe("useVfs", () => {
  it("binds VFS calls to the current app handle", async () => {
    const kernel = makeKernel();
    const vfs = mountHarness(kernel, makeContext("app-handle"));

    await vfs.list("/home");
    await vfs.writeText("/home/a.md", "hello", { overwrite: false, mimeType: "text/markdown" });
    await vfs.mkdir("/home/docs", { recursive: true });
    await vfs.remove("/home/a.md");

    expect(kernel.vfs.list).toHaveBeenCalledWith("/home", { handleId: "app-handle" });
    expect(kernel.vfs.writeText).toHaveBeenCalledWith("/home/a.md", "hello", {
      handleId: "app-handle",
      overwrite: false,
      mimeType: "text/markdown",
    });
    expect(kernel.vfs.mkdir).toHaveBeenCalledWith("/home/docs", {
      handleId: "app-handle",
      recursive: true,
    });
    expect(kernel.vfs.remove).toHaveBeenCalledWith("/home/a.md", { handleId: "app-handle" });
  });

  it("requires app context so callers cannot forge identity manually", () => {
    const kernel = makeKernel();

    expect(() => mountHarness(kernel)).toThrow(/AppContextInjectionKey missing/);
  });
});
