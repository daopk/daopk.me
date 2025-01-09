import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, nextTick, type Component } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import { AppContextInjectionKey, type AppContext, type AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import AppMount from "./AppMount.vue";
import AppMountError from "./AppMountError.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon = defineComponent({ template: "<svg />" });

const TemplateApp = defineComponent({
  name: "TemplateApp",
  template: '<div class="template-app-stub">template content</div>',
});

/**
 * Real dynamic `import("./App.vue")` calls return ESM-flagged module records.
 * `defineAsyncComponent` only unwraps `.default` when the resolved value sets
 * `__esModule` or `Symbol.toStringTag === "Module"`. Tests must mimic that
 * shape so the inner component renders instead of being passed through as
 * the wrapper itself.
 */
function asEsm(component: Component): { default: Component } {
  return Object.assign(Object.create(null) as { default: Component }, {
    default: component,
    __esModule: true,
  });
}

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "template",
    name: "Template",
    icon: StubIcon as Component,
    category: "dev",
    component: () => Promise.resolve(asEsm(TemplateApp as Component)),
    ...overrides,
  };
}

const lifecycleEmit = vi.fn();
const eventsEmit = vi.fn();

function makeKernel(
  manifests: AppManifest[],
): Pick<Kernel, "apps" | "lifecycleCoordinator" | "events"> {
  return {
    apps: {
      list: () => manifests,
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
    lifecycleCoordinator: {
      register: vi.fn(),
      unregister: vi.fn(),
      emit: lifecycleEmit,
      on: vi.fn(() => () => undefined),
    },
    events: {
      emit: eventsEmit,
      on: vi.fn(() => () => undefined),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  };
}

let currentKernel: Pick<Kernel, "apps" | "lifecycleCoordinator" | "events"> = makeKernel([
  manifest(),
]);

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "lifecycleCoordinator" | "events"> {
    return currentKernel;
  },
}));

describe("AppMount", () => {
  beforeEach(() => {
    lifecycleEmit.mockClear();
    eventsEmit.mockClear();
    currentKernel = makeKernel([manifest()]);
  });

  it("renders the resolved component for a registered manifest", async () => {
    const wrapper = mount(AppMount, {
      props: { manifestId: "template", handleId: "h-1", focused: false },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find(".template-app-stub").exists()).toBe(true);
  });

  it("renders the error fallback when the manifestId is unknown", async () => {
    const wrapper = mount(AppMount, {
      props: { manifestId: "nope", handleId: "h-2", focused: false },
    });

    await flushPromises();

    expect(wrapper.findComponent(AppMountError).exists()).toBe(true);
  });

  it("renders the error fallback when the component loader rejects", async () => {
    currentKernel = makeKernel([manifest({ component: () => Promise.reject(new Error("boom")) })]);

    const wrapper = mount(AppMount, {
      props: { manifestId: "template", handleId: "h-3", focused: false },
      global: {
        config: { errorHandler: () => undefined },
      },
    });

    await flushPromises();
    await nextTick();
    await nextTick();

    expect(wrapper.findComponent(AppMountError).exists()).toBe(true);
  });

  it("emits `mounted` via lifecycleCoordinator on Vue onMounted (not setup)", async () => {
    mount(AppMount, {
      props: { manifestId: "template", handleId: "h-4", focused: false },
    });

    await nextTick();

    expect(lifecycleEmit).toHaveBeenCalledWith("mounted", "h-4");
  });

  it("emits `mounted` then `activated` when starting focused", async () => {
    mount(AppMount, {
      props: { manifestId: "template", handleId: "h-5", focused: true },
    });

    await nextTick();

    const phases = lifecycleEmit.mock.calls.map((c) => c[0]);
    expect(phases.slice(0, 2)).toEqual(["mounted", "activated"]);
  });

  it("emits `activated`/`deactivated` on focused-prop transitions", async () => {
    const wrapper = mount(AppMount, {
      props: { manifestId: "template", handleId: "h-6", focused: false },
    });

    await nextTick();
    lifecycleEmit.mockClear();

    await wrapper.setProps({ focused: true });
    expect(lifecycleEmit).toHaveBeenLastCalledWith("activated", "h-6");

    await wrapper.setProps({ focused: false });
    expect(lifecycleEmit).toHaveBeenLastCalledWith("deactivated", "h-6");
  });

  it("does NOT emit `destroyed` on its own unmount (kernel owns that path)", async () => {
    const wrapper = mount(AppMount, {
      props: { manifestId: "template", handleId: "h-7", focused: false },
    });

    await nextTick();
    lifecycleEmit.mockClear();

    wrapper.unmount();
    await nextTick();

    const phases = lifecycleEmit.mock.calls.map((c) => c[0]);
    expect(phases).not.toContain("destroyed");
  });

  // manifest, async loader rejection) must funnel through the same
  it("emits `process.errored` with the manifestId in the message when the manifest is unknown", async () => {
    mount(AppMount, {
      props: { manifestId: "nope", handleId: "h-err-1", focused: false },
    });

    await flushPromises();

    const errorEmits = eventsEmit.mock.calls.filter((c) => c[0] === "process.errored");
    expect(errorEmits).toHaveLength(1);
    expect(errorEmits[0]?.[1]).toEqual({
      handleId: "h-err-1",
      manifestId: "nope",
      error: { name: "Error", message: "Unknown manifest: nope" },
    });
    expect(errorEmits[0]?.[1]?.error).not.toHaveProperty("stack");
  });

  it("emits `process.errored` with the loader error name+message when the async loader rejects", async () => {
    currentKernel = makeKernel([
      manifest({
        component: () => {
          const err = new TypeError("network glitch");
          return Promise.reject(err);
        },
      }),
    ]);

    mount(AppMount, {
      props: { manifestId: "template", handleId: "h-err-2", focused: false },
      global: {
        config: { errorHandler: () => undefined },
      },
    });

    await flushPromises();
    await nextTick();
    await nextTick();

    const errorEmits = eventsEmit.mock.calls.filter((c) => c[0] === "process.errored");
    expect(errorEmits).toHaveLength(1);
    expect(errorEmits[0]?.[1]).toEqual({
      handleId: "h-err-2",
      manifestId: "template",
      error: { name: "TypeError", message: "network glitch" },
    });
    // PII guard parity — loader rejection path must not leak `stack`
    expect(errorEmits[0]?.[1]?.error).not.toHaveProperty("stack");
    expect(errorEmits[0]?.[1]?.error).not.toHaveProperty("cause");
  });

  it("does NOT emit `process.errored` on a successful render", async () => {
    mount(AppMount, {
      props: { manifestId: "template", handleId: "h-ok", focused: false },
    });

    await flushPromises();
    await nextTick();

    const errorEmits = eventsEmit.mock.calls.filter((c) => c[0] === "process.errored");
    expect(errorEmits).toHaveLength(0);
  });

  it("provides AppContext (manifestId, handleId, args) to descendants", async () => {
    const captured: { ctx: AppContext | null } = { ctx: null };

    const Probe = defineComponent({
      name: "Probe",
      setup() {
        const ctx = inject(AppContextInjectionKey) ?? null;
        captured.ctx = ctx;
        return () => h("div", { class: "probe" });
      },
    });

    currentKernel = makeKernel([
      manifest({ component: () => Promise.resolve(asEsm(Probe as Component)) }),
    ]);

    mount(AppMount, {
      props: {
        manifestId: "template",
        handleId: "h-8",
        focused: false,
        args: { greeting: "hi" },
      },
    });

    await flushPromises();
    await nextTick();

    expect(captured.ctx).toEqual({
      manifestId: "template",
      handleId: "h-8",
      args: { greeting: "hi" },
    });
  });
});
