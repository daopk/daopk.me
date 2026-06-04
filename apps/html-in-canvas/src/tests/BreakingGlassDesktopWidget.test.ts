import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KernelInjectionKey, type Kernel } from "@daopk/sdk";

import BreakingGlassDesktopWidget from "../widgets/BreakingGlassDesktopWidget.vue";

const mocks = vi.hoisted(() => ({
  detectSupport: vi.fn(),
  runShardOverlay: vi.fn(),
  transition: {
    phase: { value: "idle" },
    busy: { value: false },
    error: { value: null },
    snapshotUrl: { value: null },
    start: vi.fn(async () => undefined),
    dispose: vi.fn(),
  },
}));

vi.mock("../engine/capture/captureSupport", () => ({
  detectHtmlInCanvasCaptureSupport: mocks.detectSupport,
}));

vi.mock("../engine/cinematics/shards", () => ({
  runHtmlInCanvasShardOverlay: mocks.runShardOverlay,
}));

vi.mock("../composables/useHtmlInCanvasTransition", () => ({
  useHtmlInCanvasTransition: () => mocks.transition,
}));

function supportedCapture() {
  return {
    supported: true,
    preferredMode: "html-in-canvas",
    htmlInCanvas: { supported: true, missingFeatures: [] },
    desktopShellSupported: true,
    webGlSupported: true,
    missingFeatures: [],
  };
}

function unsupportedCapture() {
  return {
    supported: false,
    preferredMode: null,
    htmlInCanvas: { supported: false, missingFeatures: ["canvas requestPaint()"] },
    desktopShellSupported: true,
    webGlSupported: true,
    missingFeatures: ["canvas requestPaint()"],
  };
}

function makeKernel(): Kernel {
  return {
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  } as unknown as Kernel;
}

function mountWidget(kernel = makeKernel()) {
  return {
    kernel,
    wrapper: mount(BreakingGlassDesktopWidget, {
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    }),
  };
}

describe("BreakingGlassDesktopWidget", () => {
  beforeEach(() => {
    mocks.detectSupport.mockReturnValue(supportedCapture());
    mocks.transition.busy.value = false;
    mocks.transition.start.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("starts the full-screen transition from the click origin when supported", async () => {
    const { kernel, wrapper } = mountWidget();

    await wrapper.get("button").trigger("click", { clientX: 42, clientY: 84, detail: 1 });
    await flushPromises();

    expect(mocks.transition.start).toHaveBeenCalledWith(expect.any(Function), {
      origin: { x: 42, y: 84 },
    });
    expect(kernel.events.emit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("opens the hidden fallback app window when unsupported", async () => {
    mocks.detectSupport.mockReturnValue(unsupportedCapture());
    const { kernel, wrapper } = mountWidget();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(mocks.transition.start).not.toHaveBeenCalled();
    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "html-in-canvas",
      source: "api",
    });
    wrapper.unmount();
  });
});
