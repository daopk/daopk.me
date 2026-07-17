import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick, renderEffect } from "vue";

import { kernel } from "~/core/kernel";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { WidgetManifest } from "~/types/widget";

import DesktopWidgetLayer from "./DesktopWidgetLayer.vue";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

// happy-dom's ResizeObserver doesn't fire callbacks reliably; replace
const observerCallbacks: Array<(entries: Array<{ contentRect: DOMRectReadOnly }>) => void> = [];
function fireResize(width: number, height: number): void {
  const rect = { width, height } as unknown as DOMRectReadOnly;
  for (const cb of observerCallbacks) {
    cb([{ contentRect: rect }]);
  }
}

vi.mock("@vueuse/core", async () => {
  const actual = await vi.importActual<typeof import("@vueuse/core")>("@vueuse/core");
  return {
    ...actual,
    useResizeObserver: (
      _target: unknown,
      callback: (entries: Array<{ contentRect: DOMRectReadOnly }>) => void,
    ) => {
      observerCallbacks.push(callback);
      return { stop: () => observerCallbacks.splice(observerCallbacks.indexOf(callback), 1) };
    },
  };
});

vi.mock("./DesktopWidgetSlot.vue", () => ({
  default: defineVaporComponent({
    name: "DesktopWidgetSlotStub",
    props: {
      manifest: { type: Object, required: true },
      placement: { type: Object, required: true },
      hostSize: { type: Object, required: true },
    },
    emits: ["drop"],
    setup(props, { emit }) {
      const element = document.createElement("div");
      element.className = "slot-stub";
      element.addEventListener("click", () =>
        emit("drop", (props.manifest as WidgetManifest).id, 12, 8),
      );
      renderEffect(() => {
        const placement = props.placement as { gridX: number; gridY: number };
        const hostSize = props.hostSize as { width: number; height: number };
        element.dataset.widgetId = (props.manifest as WidgetManifest).id;
        element.dataset.gridX = String(placement.gridX);
        element.dataset.gridY = String(placement.gridY);
        element.dataset.hostW = String(hostSize.width);
        element.dataset.hostH = String(hostSize.height);
      });
      return element;
    },
  }),
}));

const EmptyWidget = defineVaporComponent(() => document.createElement("div"));

function makeManifest(overrides: Partial<WidgetManifest> = {}): WidgetManifest {
  return {
    id: overrides.id ?? "test:widget",
    title: "Test",
    surface: "desktop:wallpaper",
    size: "sm",
    component: () => Promise.resolve({ default: EmptyWidget }),
    ...overrides,
  };
}

function mountLayer(): ReturnType<typeof mount> {
  return mount(DesktopWidgetLayer, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel as Kernel } },
  });
}

async function setHostSize(
  _wrapper: ReturnType<typeof mount>,
  width: number,
  height: number,
): Promise<void> {
  fireResize(width, height);
  await nextTick();
}

describe("DesktopWidgetLayer (M3.7)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    observerCallbacks.length = 0;
    await kernel.init();
  });

  afterEach(() => {
    kernel.commands.unregister("desktop:widget.remove");
    useWidgetPlacementStore().dispose();
    kernel.dispose();
    document.body.innerHTML = "";
  });

  describe("widget enumeration", () => {
    it("renders only desktop:wallpaper widgets (skips menubar)", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a", surface: "desktop:wallpaper" }));
      kernel.widgets.register(makeManifest({ id: "mb:a", surface: "desktop:menubar" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slots = w.findAll(".slot-stub");
      expect(slots).toHaveLength(1);
      expect(slots[0]!.attributes("data-widget-id")).toBe("wp:a");

      w.unmount();
    });

    it('includes `surface: "any"` widgets', async () => {
      kernel.widgets.register(makeManifest({ id: "any:a", surface: "any" }));
      kernel.widgets.register(makeManifest({ id: "wp:a", surface: "desktop:wallpaper" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const ids = w.findAll(".slot-stub").map((s) => s.attributes("data-widget-id"));
      expect(ids.sort()).toEqual(["any:a", "wp:a"]);

      w.unmount();
    });

    it("reacts to widget.registered event (slot appears without remount)", async () => {
      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      expect(w.findAll(".slot-stub")).toHaveLength(0);

      kernel.widgets.register(makeManifest({ id: "wp:a", surface: "desktop:wallpaper" }));
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(1);
      w.unmount();
    });

    it("reacts to widget.unregistered event (slot disappears)", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a", surface: "desktop:wallpaper" }));
      const w = mountLayer();
      await setHostSize(w, 1920, 1080);
      expect(w.findAll(".slot-stub")).toHaveLength(1);

      kernel.widgets.unregister("wp:a");
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(0);
      w.unmount();
    });
  });

  describe("effective placement priority", () => {
    it("uses persisted placement when present (wins over defaultPlacement + autoPlace)", async () => {
      kernel.widgets.register(
        makeManifest({
          id: "wp:a",
          surface: "desktop:wallpaper",
          defaultPlacement: { gridX: 4, gridY: 4 },
        }),
      );
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:a", { gridX: 1, gridY: 1 });

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("1");
      expect(slot.attributes("data-grid-y")).toBe("1");

      w.unmount();
    });

    it("uses manifest.defaultPlacement when no persisted placement (wins over autoPlace)", async () => {
      kernel.widgets.register(
        makeManifest({
          id: "wp:a",
          surface: "desktop:wallpaper",
          defaultPlacement: { gridX: 4, gridY: 4 },
        }),
      );

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("4");
      expect(slot.attributes("data-grid-y")).toBe("4");

      w.unmount();
    });

    it("resolves anchored defaultPlacement against the current viewport width", async () => {
      kernel.widgets.register(
        makeManifest({
          id: "wp:a",
          surface: "desktop:wallpaper",
          size: "md",
          defaultPlacement: { anchor: "top-right", insetX: 1, insetY: 1 },
        }),
      );

      const w = mountLayer();
      await setHostSize(w, 1512, 900);

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("54");
      expect(slot.attributes("data-grid-y")).toBe("1");

      w.unmount();
    });

    it("falls through to autoPlace when neither persisted nor defaultPlacement", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a", surface: "desktop:wallpaper" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("76");
      expect(slot.attributes("data-grid-y")).toBe("0");

      w.unmount();
    });
  });

  describe("auto-place collision accumulation", () => {
    it("second auto-placed widget lands left of the first (collision-aware iteration)", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a" }));
      kernel.widgets.register(makeManifest({ id: "wp:b" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slots = w.findAll(".slot-stub");
      const byId: Record<string, { x: string; y: string }> = {};
      for (const s of slots) {
        byId[s.attributes("data-widget-id")!] = {
          x: s.attributes("data-grid-x")!,
          y: s.attributes("data-grid-y")!,
        };
      }

      expect(byId["wp:a"]).toEqual({ x: "76", y: "0" });
      expect(byId["wp:b"]).toEqual({ x: "71", y: "0" });

      w.unmount();
    });

    it("manifest.defaultPlacement seeds the occupied list (autoPlace flows around it)", async () => {
      kernel.widgets.register(
        makeManifest({ id: "wp:a", defaultPlacement: { gridX: 76, gridY: 0 } }),
      );
      kernel.widgets.register(makeManifest({ id: "wp:b" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slots = w.findAll(".slot-stub");
      const byId: Record<string, { x: string; y: string }> = {};
      for (const s of slots) {
        byId[s.attributes("data-widget-id")!] = {
          x: s.attributes("data-grid-x")!,
          y: s.attributes("data-grid-y")!,
        };
      }

      expect(byId["wp:a"]).toEqual({ x: "76", y: "0" });
      expect(byId["wp:b"]).toEqual({ x: "71", y: "0" });

      w.unmount();
    });

    it("colliding defaultPlacement gracefully degrades to autoPlace", async () => {
      kernel.widgets.register(
        makeManifest({ id: "wp:a", defaultPlacement: { gridX: 76, gridY: 0 } }),
      );
      kernel.widgets.register(
        makeManifest({ id: "wp:b", defaultPlacement: { gridX: 76, gridY: 0 } }),
      );

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slots = w.findAll(".slot-stub");
      const byId: Record<string, { x: string; y: string }> = {};
      for (const s of slots) {
        byId[s.attributes("data-widget-id")!] = {
          x: s.attributes("data-grid-x")!,
          y: s.attributes("data-grid-y")!,
        };
      }

      expect(byId["wp:a"]).toEqual({ x: "76", y: "0" });
      expect(byId["wp:b"]).toEqual({ x: "71", y: "0" });

      w.unmount();
    });

    it("off-viewport defaultPlacement is clamped to the nearest legal slot", async () => {
      kernel.widgets.register(
        makeManifest({ id: "wp:a", defaultPlacement: { gridX: 999, gridY: 999 } }),
      );

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("76");
      expect(slot.attributes("data-grid-y")).toBe("41");

      w.unmount();
    });
  });

  describe("viewport-shrink clamp (read-side)", () => {
    it("clamps persisted placement to viewport bounds without mutating the store", async () => {
      // The persisted store value MUST stay at 76 so re-expanding
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:a", { gridX: 76, gridY: 0 });

      kernel.widgets.register(makeManifest({ id: "wp:a" }));
      const w = mountLayer();
      await setHostSize(w, 400, 400); // 16 × 16 cols/rows

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("12");
      expect(slot.attributes("data-grid-y")).toBe("0");

      expect(placements.get("wp:a")).toEqual({ gridX: 76, gridY: 0 });

      await setHostSize(w, 1920, 1080);
      expect(w.find(".slot-stub").attributes("data-grid-x")).toBe("76");

      w.unmount();
    });

    it("moves overlapping persisted placements read-side without mutating the store", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:a", { gridX: 12, gridY: 8 });
      placements.set("wp:b", { gridX: 12, gridY: 8 });

      kernel.widgets.register(makeManifest({ id: "wp:a" }));
      kernel.widgets.register(makeManifest({ id: "wp:b" }));
      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const byId = (id: string) => w.find(`[data-widget-id="${id}"]`);
      expect(byId("wp:a").attributes("data-grid-x")).toBe("12");
      expect(byId("wp:a").attributes("data-grid-y")).toBe("8");
      expect(byId("wp:b").attributes("data-grid-x")).toBe("17");
      expect(byId("wp:b").attributes("data-grid-y")).toBe("8");

      expect(placements.get("wp:a")).toEqual({ gridX: 12, gridY: 8 });
      expect(placements.get("wp:b")).toEqual({ gridX: 12, gridY: 8 });

      w.unmount();
    });

    it("degenerate viewport (smaller than widget) clamps to origin", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:a", { gridX: 5, gridY: 5 });

      kernel.widgets.register(makeManifest({ id: "wp:a", size: "sm" }));
      const w = mountLayer();
      await setHostSize(w, 48, 48); // 2 × 2 cols/rows — sm doesn't fit

      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("0");
      expect(slot.attributes("data-grid-y")).toBe("0");

      w.unmount();
    });
  });

  describe("drop persistence", () => {
    it("slot drop event writes through to WidgetPlacementStore.set", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      await w.find(".slot-stub").trigger("click");
      await nextTick();

      const placements = useWidgetPlacementStore();
      expect(placements.get("wp:a")).toEqual({ gridX: 12, gridY: 8 });

      expect(w.find(".slot-stub").attributes("data-grid-x")).toBe("12");
      expect(w.find(".slot-stub").attributes("data-grid-y")).toBe("8");

      w.unmount();
    });

    it("slot drop onto an occupied slot persists the nearest legal gap-safe placement", async () => {
      kernel.widgets.register(
        makeManifest({ id: "wp:a", defaultPlacement: { gridX: 12, gridY: 8 } }),
      );
      kernel.widgets.register(makeManifest({ id: "wp:b" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      await w.find('[data-widget-id="wp:b"]').trigger("click");
      await nextTick();

      const placements = useWidgetPlacementStore();
      expect(placements.get("wp:b")).toEqual({ gridX: 17, gridY: 8 });
      expect(w.find('[data-widget-id="wp:b"]').attributes("data-grid-x")).toBe("17");
      expect(w.find('[data-widget-id="wp:b"]').attributes("data-grid-y")).toBe("8");

      w.unmount();
    });

    it("slot drop does not persist when no legal slot exists", async () => {
      kernel.widgets.register(
        makeManifest({ id: "wp:a", defaultPlacement: { gridX: 0, gridY: 0 } }),
      );
      kernel.widgets.register(makeManifest({ id: "wp:b" }));

      const w = mountLayer();
      await setHostSize(w, 96, 96); // 4×4 grid cells, enough for only one sm widget.

      await w.find('[data-widget-id="wp:b"]').trigger("click");
      await nextTick();

      expect(useWidgetPlacementStore().get("wp:b")).toBeUndefined();

      w.unmount();
    });
  });

  describe("empty + degenerate states", () => {
    it("renders no slots when zero widgets are registered", async () => {
      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      expect(w.findAll(".slot-stub")).toHaveLength(0);
      expect(w.find(".desktop-widget-layer").exists()).toBe(true);

      w.unmount();
    });

    it("renders no slots until hostSize is non-zero (prevents flash-at-origin)", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a" }));

      const w = mountLayer();
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(0);

      w.unmount();
    });
  });

  describe("M3.8 enabled-flag filter", () => {
    it("disabling a widget unmounts its slot without remounting the host", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      kernel.widgets.register(makeManifest({ id: "wp:a" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);
      expect(w.findAll(".slot-stub")).toHaveLength(1);
      const hostBefore = w.find(".desktop-widget-layer").element;

      placements.setEnabled("desktop", "wp:a", false);
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(0);
      expect(w.find(".desktop-widget-layer").element).toBe(hostBefore);

      w.unmount();
    });

    it("re-enabling restores the slot at its preserved placement", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.set("wp:a", { gridX: 12, gridY: 8 });
      kernel.widgets.register(makeManifest({ id: "wp:a" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);
      expect(w.find(".slot-stub").attributes("data-grid-x")).toBe("12");

      placements.setEnabled("desktop", "wp:a", false);
      await nextTick();
      expect(w.findAll(".slot-stub")).toHaveLength(0);

      expect(placements.get("wp:a")).toEqual({ gridX: 12, gridY: 8 });

      placements.setEnabled("desktop", "wp:a", true);
      await nextTick();
      const slot = w.find(".slot-stub");
      expect(slot.attributes("data-grid-x")).toBe("12");
      expect(slot.attributes("data-grid-y")).toBe("8");

      w.unmount();
    });

    it("optional app widgets stay hidden until explicitly added", async () => {
      const placements = useWidgetPlacementStore();
      placements.hydrate();
      kernel.widgets.register(makeManifest({ id: "app:optional", defaultVisible: false }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);
      expect(w.findAll(".slot-stub")).toHaveLength(0);

      placements.setEnabled("desktop", "app:optional", true, false);
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(1);
      expect(w.find(".slot-stub").attributes("data-widget-id")).toBe("app:optional");

      w.unmount();
    });

    it("auto-place re-flow on disable (M3.8 regression pin for accepted v1 UX)", async () => {
      kernel.widgets.register(makeManifest({ id: "wp:a", size: "sm" }));
      kernel.widgets.register(makeManifest({ id: "wp:b", size: "sm" }));

      const w = mountLayer();
      await setHostSize(w, 1920, 1080);

      const initialBySlotId = (id: string) =>
        w.find(`[data-widget-id="${id}"]`).attributes("data-grid-x");

      expect(initialBySlotId("wp:a")).toBe("76");
      expect(initialBySlotId("wp:b")).toBe("71");

      const placements = useWidgetPlacementStore();
      placements.hydrate();
      placements.setEnabled("desktop", "wp:a", false);
      await nextTick();

      expect(w.findAll(".slot-stub")).toHaveLength(1);
      expect(initialBySlotId("wp:b")).toBe("76");

      w.unmount();
    });
  });
});
