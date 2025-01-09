import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

function makeFakeKernel(): Kernel {
  const registry = new Map<string, { run: (ctx: unknown) => void | Promise<void> }>();

  return {
    settings: {
      get: vi.fn(() => false),
    },
    commands: {
      register: vi.fn((m: { id: string; run: (ctx: unknown) => void | Promise<void> }) => {
        registry.set(m.id, m);
        return () => {
          registry.delete(m.id);
        };
      }),
      unregister: vi.fn((id: string) => {
        registry.delete(id);
      }),
      dispatch: vi.fn(async (id: string) => {
        const m = registry.get(id);
        if (!m) {
          const err = new Error(`Unknown command id: ${id}`);
          err.name = "CommandNotFoundError";
          throw err;
        }
        await m.run({});
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
}

describe("Terminal App.vue — smoke (M2a.3)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the welcome system line on mount", () => {
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        provide: { [KernelInjectionKey as symbol]: makeFakeKernel() },
      },
    });

    const systemLines = wrapper.findAll(".terminal__line--system");
    expect(systemLines.length).toBeGreaterThanOrEqual(1);
    expect(systemLines[0]?.text()).toContain("Terminal");

    wrapper.unmount();
  });

  it("typing into the input + Enter pushes an input line + dispatches", async () => {
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        provide: { [KernelInjectionKey as symbol]: makeFakeKernel() },
      },
    });

    const inputEl = wrapper.find<HTMLInputElement>(".terminal__input");
    expect(inputEl.exists()).toBe(true);

    await inputEl.setValue("help");
    await wrapper.find("form").trigger("submit.prevent");

    expect(inputEl.element.value).toBe("");
    const inputLines = wrapper.findAll(".terminal__line--input");
    expect(inputLines).toHaveLength(1);
    expect(inputLines[0]?.text()).toContain("help");

    wrapper.unmount();
  });

  it("unknown command renders an error class line", async () => {
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        provide: { [KernelInjectionKey as symbol]: makeFakeKernel() },
      },
    });

    const inputEl = wrapper.find<HTMLInputElement>(".terminal__input");
    await inputEl.setValue("definitely:not:a:real:command");
    await wrapper.find("form").trigger("submit.prevent");

    const errorLines = wrapper.findAll(".terminal__line--error");
    expect(errorLines.length).toBeGreaterThanOrEqual(1);
    expect(errorLines.at(-1)?.text()).toContain("Unknown command id");

    wrapper.unmount();
  });
});
