import {
  mountVaporTest,
  type VaporTestComponent,
  type VaporTestMountOptions,
} from "~/test/mountVapor";
import { defineVaporComponent, nextTick, onMounted, type Component } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppManifest } from "~/types/app";

import WindowHost from "./WindowHost.vue";
import type { WindowRecord } from "./useWindowManager";

const hostMocks = vi.hoisted(() => ({
  adapters: null as null | {
    notifyLaunchFailed: (manifest: AppManifest) => void;
    notifyUnavailable: (manifestId: string) => void;
  },
  reactiveState: null as null | {
    windows: WindowRecord[];
    snapPreview: null | {
      edge: "left" | "right" | "max";
      stage: { width: number; height: number };
    };
    browserPath: string;
    browserTitle: string;
  },
  send: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("~/components/ui", () => ({
  useToast: () => ({ error: hostMocks.toastError }),
}));

vi.mock("~/composables/useKernel", () => ({
  useKernel: () => ({ id: "kernel-fixture" }),
}));

vi.mock("./useDesktopWindowStage", async () => {
  const { computed, reactive } = await import("vue");

  return {
    useDesktopWindowStage: () => {
      const stageBounds = reactive({ width: 1200, height: 800 });
      return {
        stageBounds,
        stageOffset: computed(() => ({ x: 12, y: 28 })),
        centeredInitialPosition: vi.fn(),
        maximizeStageSize: () => stageBounds,
        measuredStageSize: () => stageBounds,
        stageForSnap: () => stageBounds,
      };
    },
  };
});

vi.mock("./useDesktopWindowSession", async () => {
  const { computed, reactive } = await import("vue");
  const reactiveState = reactive({
    windows: [] as WindowRecord[],
    snapPreview: null as null | {
      edge: "left" | "right" | "max";
      stage: { width: number; height: number };
    },
    browserPath: "/",
    browserTitle: "WebOS",
  });
  hostMocks.reactiveState = reactiveState;

  return {
    useDesktopWindowSession: (adapters: NonNullable<typeof hostMocks.adapters>) => {
      hostMocks.adapters = adapters;
      return {
        state: computed(() => reactiveState),
        send: hostMocks.send,
      };
    },
  };
});

vi.mock("./Window.vue", () => ({
  default: defineVaporComponent(
    (props: { record: WindowRecord }, { emit }) => {
      onMounted(() => {
        const windowId = props.record.id;
        emit("frame:outcome", { type: "focus-window", windowId });
        emit("close:window", windowId);
        emit("frame:outcome", { type: "move-window", windowId, x: 10, y: 20 });
        emit("frame:outcome", {
          type: "resize-window",
          windowId,
          x: 10,
          y: 20,
          width: 640,
          height: 480,
        });
        emit("maximize:window", windowId);
        emit("minimize:window", windowId);
        emit("frame:outcome", { type: "snap-window", windowId, edge: "left" });
        emit("frame:outcome", { type: "preview-snap", windowId, edge: "right" });
        emit("title:window", windowId, "Updated");
        emit("content-size:window", windowId, { width: 600, height: 400 });
      });

      const root = document.createElement("div");
      root.dataset.windowFixture = props.record.id;
      root.dataset.stage = "received";
      return root;
    },
    {
      props: ["record", "stageBounds", "stageOffset"] as never,
      emits: [
        "frame:outcome",
        "close:window",
        "maximize:window",
        "minimize:window",
        "title:window",
        "content-size:window",
      ],
    },
  ),
}));

vi.mock("./SnapPreview.vue", () => ({
  default: defineVaporComponent(() => {
    const root = document.createElement("div");
    root.dataset.snapPreviewFixture = "";
    return root;
  }),
}));

const StubIcon = defineVaporComponent(() =>
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
);
const StubApp = defineVaporComponent(() => document.createElement("div"));

function asEsm(component: Component): { default: Component } {
  return Object.assign(Object.create(null) as { default: Component }, {
    default: component,
    __esModule: true,
  });
}

function manifest(id = "alpha", name = "Alpha"): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve(asEsm(StubApp)),
  };
}

function record(overrides: Partial<WindowRecord> = {}): WindowRecord {
  return {
    id: "window-alpha",
    manifestId: "alpha",
    handleId: "handle-alpha",
    title: "Alpha",
    x: 80,
    y: 80,
    width: 640,
    height: 480,
    minWidth: 240,
    minHeight: 160,
    z: 101,
    focused: true,
    singleton: false,
    maximized: false,
    minimized: false,
    argsRevision: 0,
    ...overrides,
  };
}

function mount(component: VaporTestComponent, options: VaporTestMountOptions = {}) {
  return mountVaporTest(component, options);
}

describe("WindowHost render adapter", () => {
  beforeEach(() => {
    hostMocks.send.mockReset();
    hostMocks.toastError.mockReset();
    hostMocks.reactiveState!.windows.splice(0);
    hostMocks.reactiveState!.snapPreview = null;
    hostMocks.reactiveState!.browserPath = "/";
    hostMocks.reactiveState!.browserTitle = "WebOS";
    window.history.replaceState(null, "", "/");
    document.title = "WebOS";
  });

  it("renders session state and translates every window event into one intent", async () => {
    hostMocks.reactiveState!.windows.push(record());
    hostMocks.reactiveState!.snapPreview = {
      edge: "max",
      stage: { width: 1200, height: 742 },
    };

    const wrapper = mount(WindowHost);
    await nextTick();

    expect(wrapper.element.querySelector("[data-window-fixture='window-alpha']")).not.toBeNull();
    expect(wrapper.element.querySelector("[data-snap-preview-fixture]")).not.toBeNull();
    expect(hostMocks.send.mock.calls.map(([intent]) => intent)).toEqual([
      { type: "focus-window", windowId: "window-alpha" },
      { type: "close-window", windowId: "window-alpha" },
      { type: "move-window", windowId: "window-alpha", x: 10, y: 20 },
      {
        type: "resize-window",
        windowId: "window-alpha",
        x: 10,
        y: 20,
        width: 640,
        height: 480,
      },
      { type: "toggle-maximize", windowId: "window-alpha" },
      { type: "minimize-window", windowId: "window-alpha" },
      { type: "snap-window", windowId: "window-alpha", edge: "left" },
      { type: "preview-snap", windowId: "window-alpha", edge: "right" },
      { type: "set-title", windowId: "window-alpha", title: "Updated" },
      {
        type: "report-content-size",
        windowId: "window-alpha",
        size: { width: 600, height: 400 },
      },
    ]);

    wrapper.unmount();
  });

  it("mirrors session browser state into host chrome", async () => {
    const wrapper = mount(WindowHost);

    hostMocks.reactiveState!.browserPath = "/apps/alpha";
    hostMocks.reactiveState!.browserTitle = "Alpha - WebOS";
    await nextTick();

    expect(window.location.pathname).toBe("/apps/alpha");
    expect(document.title).toBe("Alpha - WebOS");

    wrapper.unmount();
  });

  it("adapts session notifications to desktop toasts", () => {
    const wrapper = mount(WindowHost);

    hostMocks.adapters!.notifyUnavailable("ghost");
    hostMocks.adapters!.notifyLaunchFailed(manifest("alpha", "Alpha"));

    expect(hostMocks.toastError).toHaveBeenNthCalledWith(1, {
      title: "App unavailable",
      description: `"ghost" isn't installed.`,
    });
    expect(hostMocks.toastError).toHaveBeenNthCalledWith(2, {
      title: "Couldn't open app",
      description: "Alpha failed to start. Please try again.",
    });

    wrapper.unmount();
  });
});
