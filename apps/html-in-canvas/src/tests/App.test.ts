import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../components/App.vue";

const mocks = vi.hoisted(() => ({
  detectSupport: vi.fn(),
}));

vi.mock("../engine/capture/captureSupport", () => ({
  detectHtmlInCanvasCaptureSupport: mocks.detectSupport,
}));

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

function stubClipboard(writeText = vi.fn(async () => undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return writeText;
}

describe("Canvas Demos fallback app", () => {
  beforeEach(() => {
    mocks.detectSupport.mockReturnValue(unsupportedCapture());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("shows the Chrome flag URL and missing feature guidance", () => {
    const wrapper = mount(App, { attachTo: document.body });

    expect(wrapper.text()).toContain("Canvas demos setup required");
    expect(wrapper.text()).toContain("Missing: canvas requestPaint()");
    expect(wrapper.text()).toContain("Set Canvas drawElement to Enabled.");
    expect(
      wrapper.get<HTMLInputElement>('input[aria-label="Canvas demos flag URL"]').element.value,
    ).toBe("chrome://flags/#canvas-draw-element");
    wrapper.unmount();
  });

  it("copies the flag URL", async () => {
    const writeText = stubClipboard();
    const wrapper = mount(App, { attachTo: document.body });

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("chrome://flags/#canvas-draw-element");
    expect(wrapper.text()).toContain("Copied");
    wrapper.unmount();
  });

  it("clears the copy state reset timer on unmount", async () => {
    vi.useFakeTimers();
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    stubClipboard();
    const wrapper = mount(App, { attachTo: document.body });

    await wrapper.get("button").trigger("click");
    await flushPromises();
    wrapper.unmount();

    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });
});
