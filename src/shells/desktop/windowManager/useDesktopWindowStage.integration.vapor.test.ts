import { mountVaporTest } from "~/test/mountVapor";
import { computed } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDockReveal, setDockReveal } from "../dock/dockReveal";
import WindowHost from "./WindowHost.vue";
import type { DesktopWindowStageAdapter } from "./useDesktopWindowSession";
import { DEFAULT_H, DEFAULT_W } from "./useWindowManager";

const stageMocks = vi.hoisted(() => ({
  stage: null as DesktopWindowStageAdapter | null,
}));

vi.mock("~/components/ui", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

vi.mock("~/composables/useKernel", () => ({
  useKernel: () => ({ id: "kernel-fixture" }),
}));

vi.mock("./useDesktopWindowSession", () => ({
  useDesktopWindowSession: (adapters: { stage: DesktopWindowStageAdapter }) => {
    stageMocks.stage = adapters.stage;
    return {
      state: computed(() => ({
        windows: [],
        snapPreview: null,
        browserPath: "/",
        browserTitle: "WebOS",
      })),
      send: vi.fn(),
    };
  },
}));

function rect({
  top,
  left,
  width,
  height,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function stage(): DesktopWindowStageAdapter {
  if (stageMocks.stage === null) {
    throw new Error("WindowHost did not provide its desktop stage to the session");
  }
  return stageMocks.stage;
}

describe("WindowHost desktop stage integration", () => {
  beforeEach(() => {
    stageMocks.stage = null;
    clearDockReveal();
  });

  afterEach(() => {
    clearDockReveal();
    vi.restoreAllMocks();
  });

  it("centers deeplinks from the real host geometry", () => {
    const wrapper = mountVaporTest(WindowHost, { attachTo: document.body });
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 28, left: 12, width: 1000, height: 700 }),
    );

    expect(stage().measuredStageSize()).toEqual({ width: 1000, height: 700 });
    expect(stage().centeredInitialPosition("deeplink")).toEqual({
      x: Math.floor((1000 - DEFAULT_W) / 2),
      y: Math.floor((700 - DEFAULT_H) / 2),
    });
    expect(
      stage().centeredInitialPosition("deeplink", {
        width: 400,
        height: 300,
      }),
    ).toEqual({ x: 300, y: 200 });
    expect(
      stage().centeredInitialPosition("dock", {
        width: 400,
        height: 300,
      }),
    ).toBeUndefined();

    wrapper.unmount();
  });

  it("uses the visible dock boundary and the full stage while the dock is concealed", () => {
    const wrapper = mountVaporTest(WindowHost, { attachTo: document.body });
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      rect({ top: 28, left: 0, width: 1000, height: 872 }),
    );
    const measureDock = vi.fn(() => ({ top: 820, height: 58 }));

    setDockReveal({
      occupiesStage: true,
      measure: measureDock,
    });
    expect(stage().maximizeStageSize()).toEqual({ width: 1000, height: 792 });
    expect(measureDock).toHaveBeenCalledTimes(1);

    measureDock.mockClear();
    setDockReveal({
      occupiesStage: false,
      measure: measureDock,
    });
    expect(stage().maximizeStageSize()).toEqual({ width: 1000, height: 872 });
    expect(measureDock).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
