import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref, type Component, type Ref } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";

import { debugLog } from "~/core/debug";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

import {
  __resetWindowManagerForTests,
  useWindowManager,
} from "~/shells/desktop/windowManager/useWindowManager";

import { SPOTLIGHT_DOCK_ITEM_KEY, TRASH_DOCK_ITEM_KEY, type DockItemModel } from "./types";
import { useDock } from "./useDock";

const Stub = defineComponent({ template: "<span />" });
const StubIcon = defineComponent({ template: "<svg />" });

let fakeManifests: AppManifest[];
let pinnedAppIds: Ref<string[]>;

function makeManifest(id: string, category: AppManifest["category"] = "system"): AppManifest {
  return {
    id,
    name: id[0]!.toUpperCase() + id.slice(1),
    icon: StubIcon as Component,
    category,
    component: () => Promise.resolve({ default: Stub as Component }),
  };
}

const mockEmit = vi.fn();
const mockSetSetting = vi.fn(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
  if (key === "dockPinnedAppIds") {
    pinnedAppIds.value = [...(value as SettingsState["dockPinnedAppIds"])];
  }
});

vi.mock("~/core/debug", () => ({
  debugLog: vi.fn(),
}));

const mockKernel: Pick<Kernel, "apps" | "events" | "settings"> = {
  apps: {
    list: (): AppManifest[] => fakeManifests,
    register: (): void => {},
    launch: (): Promise<never> => Promise.reject(new Error("unimplemented")),
    unregister: (): void => {},
  },
  events: {
    emit: mockEmit,
    on: (): (() => void) => (): void => {},
    once: (): (() => void) => (): void => {},
    off: (): void => {},
  },
  settings: {
    use<K extends keyof SettingsState>(key: K): Ref<SettingsState[K]> {
      if (key === "dockPinnedAppIds") {
        return pinnedAppIds as unknown as Ref<SettingsState[K]>;
      }

      return ref(undefined) as unknown as Ref<SettingsState[K]>;
    },
    get<K extends keyof SettingsState>(key: K): SettingsState[K] {
      if (key === "dockPinnedAppIds") {
        return pinnedAppIds.value as SettingsState[K];
      }

      return undefined as unknown as SettingsState[K];
    },
    set: mockSetSetting,
    reset: vi.fn(),
  },
};

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "events" | "settings"> {
    return mockKernel;
  },
}));

function itemLabel(item: DockItemModel): string {
  return item.kind === "app" ? item.manifestId : item.key;
}

function appItem(items: readonly DockItemModel[], manifestId: string): DockItemModel {
  const item = items.find(
    (candidate) => candidate.kind === "app" && candidate.manifestId === manifestId,
  );
  if (!item) {
    throw new Error(`Missing dock app item: ${manifestId}`);
  }
  return item;
}

function spotlightItem(items: readonly DockItemModel[]): DockItemModel {
  const item = items.find(
    (candidate) => candidate.kind === "system" && candidate.action === "spotlight",
  );
  if (!item) {
    throw new Error("Missing Spotlight dock item");
  }
  return item;
}

function trashItem(items: readonly DockItemModel[]): DockItemModel {
  const item = items.find(
    (candidate) => candidate.kind === "system" && candidate.action === "trash",
  );
  if (!item) {
    throw new Error("Missing Trash dock item");
  }
  return item;
}

function expectAppPinned(
  items: readonly DockItemModel[],
  manifestId: string,
  pinned: boolean,
): void {
  const item = appItem(items, manifestId);
  expect(item.kind).toBe("app");

  if (item.kind === "app") {
    expect(item.pinned).toBe(pinned);
  }
}

describe("useDock", () => {
  beforeEach(() => {
    fakeManifests = [makeManifest("one"), makeManifest("two", "dev")];
    pinnedAppIds = ref(["one", "two"]);
    mockEmit.mockClear();
    mockSetSetting.mockClear();
    vi.mocked(debugLog).mockClear();
    serviceWorkerUpdateController.resetForTests();
    __resetWindowManagerForTests();
  });

  it("exposes app items plus fixed Spotlight and Trash system items", () => {
    const { items } = useDock();
    expect(items.value).toHaveLength(4);

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("renders only pinned app items while apps are cold", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two"), makeManifest("three")];
    pinnedAppIds.value = ["two"];
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("hides hidden manifests from app-derived dock items", () => {
    fakeManifests = [makeManifest("one"), { ...makeManifest("trash"), hidden: true }];
    pinnedAppIds.value = ["one", "trash"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "trash", handleId: "trash-handle", title: "Trash" });
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("keeps the Spotlight item first when Finder is present", () => {
    fakeManifests = [
      makeManifest("about"),
      makeManifest("finder"),
      makeManifest("editor", "productivity"),
    ];
    pinnedAppIds.value = ["about", "finder", "editor"];
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "about",
      "finder",
      "editor",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("keeps Spotlight first when Finder is not visible", () => {
    fakeManifests = [makeManifest("about"), makeManifest("finder"), makeManifest("editor")];
    pinnedAppIds.value = ["about", "editor"];
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "about",
      "editor",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("appends running unpinned apps after pinned apps", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two"), makeManifest("three")];
    pinnedAppIds.value = ["one"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "three", handleId: "h-3", title: "Three" });
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "three",
      TRASH_DOCK_ITEM_KEY,
    ]);
    expectAppPinned(items.value, "one", true);
    expectAppPinned(items.value, "three", false);
  });

  it("keeps minimized unpinned apps visible until their window closes", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two")];
    pinnedAppIds.value = ["one"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    const id = wm.open({ manifestId: "two", handleId: "h-2", title: "Two" });
    const { items } = useDock();

    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);

    wm.minimize(id);
    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);

    wm.close(id);
    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("pins temporary app items through settings", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two")];
    pinnedAppIds.value = ["one"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "two", handleId: "h-2", title: "Two" });
    const { items, keepInDock } = useDock();

    keepInDock(appItem(items.value, "two"));

    expect(mockSetSetting).toHaveBeenCalledWith("dockPinnedAppIds", ["one", "two"]);
    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);
    expectAppPinned(items.value, "two", true);
  });

  it("reorders pinned app items through settings", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two"), makeManifest("three")];
    pinnedAppIds.value = ["one", "two", "three"];
    const { items, reorderPinnedApp } = useDock();

    reorderPinnedApp("three", "one", "before");

    expect(mockSetSetting).toHaveBeenCalledWith("dockPinnedAppIds", ["three", "one", "two"]);
    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "three",
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);
  });

  it("ignores pinned app reorder requests for transient or unknown app ids", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two"), makeManifest("three")];
    pinnedAppIds.value = ["one", "two"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "three", handleId: "h-3", title: "Three" });
    const { reorderPinnedApp } = useDock();

    reorderPinnedApp("three", "one", "before");
    reorderPinnedApp("one", "missing", "after");

    expect(mockSetSetting).not.toHaveBeenCalled();
  });

  it("lets a single pinned app be dragged but not reordered", () => {
    fakeManifests = [makeManifest("one")];
    pinnedAppIds.value = ["one"];
    const { items, canDragPinnedApp, canReorderPinnedApp } = useDock();

    expect(canDragPinnedApp(appItem(items.value, "one"))).toBe(true);
    expect(canDragPinnedApp(spotlightItem(items.value))).toBe(false);
    expect(canDragPinnedApp(trashItem(items.value))).toBe(false);
    expect(canReorderPinnedApp(appItem(items.value, "one"))).toBe(false);
  });

  it("moves pinned app items one slot at a time", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two"), makeManifest("three")];
    pinnedAppIds.value = ["one", "two", "three"];
    const { items, canMovePinnedApp, movePinnedApp } = useDock();

    const one = appItem(items.value, "one");
    const two = appItem(items.value, "two");
    const three = appItem(items.value, "three");

    expect(canMovePinnedApp(one, "left")).toBe(false);
    expect(canMovePinnedApp(two, "left")).toBe(true);
    expect(canMovePinnedApp(two, "right")).toBe(true);
    expect(canMovePinnedApp(three, "right")).toBe(false);

    movePinnedApp(two, "right");

    expect(mockSetSetting).toHaveBeenCalledWith("dockPinnedAppIds", ["one", "three", "two"]);
  });

  it("moves pinned app items relative to visible dock apps", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two")];
    pinnedAppIds.value = ["one", "future-app", "two"];
    const { items, canMovePinnedApp, movePinnedApp } = useDock();
    const one = appItem(items.value, "one");

    expect(canMovePinnedApp(one, "right")).toBe(true);

    movePinnedApp(one, "right");

    expect(mockSetSetting).toHaveBeenCalledWith("dockPinnedAppIds", ["future-app", "two", "one"]);
  });

  it("unpins app items without closing running windows", () => {
    fakeManifests = [makeManifest("one"), makeManifest("two")];
    pinnedAppIds.value = ["one", "two"];
    const wm = useWindowManager({ killProcess: vi.fn() });
    wm.open({ manifestId: "two", handleId: "h-2", title: "Two" });
    const { items, removeFromDock } = useDock();

    removeFromDock(appItem(items.value, "two"));

    expect(mockSetSetting).toHaveBeenCalledWith("dockPinnedAppIds", ["one"]);
    expect(items.value.map(itemLabel)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      "one",
      "two",
      TRASH_DOCK_ITEM_KEY,
    ]);
    expectAppPinned(items.value, "two", false);
  });

  it("launch forwards app.launch.requested with dock source", () => {
    const { items, launch } = useDock();
    launch(appItem(items.value, "one"));
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "one",
      source: "dock",
    });
  });

  it("launch forwards the Spotlight dock item to the shell Spotlight event", () => {
    const { items, launch } = useDock();
    launch(spotlightItem(items.value));
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("spotlight.open.requested", {
      source: "dock",
    });
  });

  it("launch forwards the Trash dock item to the hidden Trash app", () => {
    const { items, launch } = useDock();
    launch(trashItem(items.value));
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "trash",
      source: "dock",
    });
  });

  it("does not let the Spotlight system action shadow an app with the same raw id", () => {
    fakeManifests = [makeManifest(SPOTLIGHT_DOCK_ITEM_KEY)];
    pinnedAppIds.value = [SPOTLIGHT_DOCK_ITEM_KEY];
    const { items, launch } = useDock();

    expect(items.value.map((item) => item.key)).toEqual([
      SPOTLIGHT_DOCK_ITEM_KEY,
      `app:${SPOTLIGHT_DOCK_ITEM_KEY}`,
      TRASH_DOCK_ITEM_KEY,
    ]);

    launch(appItem(items.value, SPOTLIGHT_DOCK_ITEM_KEY));
    expect(mockEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: SPOTLIGHT_DOCK_ITEM_KEY,
      source: "dock",
    });

    launch(spotlightItem(items.value));
    expect(mockEmit).toHaveBeenCalledWith("spotlight.open.requested", {
      source: "dock",
    });
  });

  it("launch logs the intent through debugLog for dev observability", () => {
    const { items, launch } = useDock();
    launch(appItem(items.value, "two"));
    expect(debugLog).toHaveBeenCalledTimes(1);
    expect(debugLog).toHaveBeenCalledWith("[dock] launch", "two");
  });

  it("hasRunning tracks visible and minimized records and clears after close", () => {
    const { items, hasRunning } = useDock();
    const wm = useWindowManager({ killProcess: vi.fn() });
    const one = appItem(items.value, "one");
    const spotlight = spotlightItem(items.value);
    const trash = trashItem(items.value);

    expect(hasRunning(one)).toBe(false);
    expect(hasRunning(spotlight)).toBe(false);
    expect(hasRunning(trash)).toBe(false);

    const id = wm.open({ manifestId: "one", handleId: "h-1", title: "One" });
    expect(hasRunning(one)).toBe(true);

    wm.minimize(id);
    expect(hasRunning(one)).toBe(true);

    wm.close(id);
    expect(hasRunning(one)).toBe(false);
  });

  it("hasAttention tracks service worker update attention for Settings only", () => {
    fakeManifests = [makeManifest("settings"), makeManifest("one")];
    pinnedAppIds.value = ["settings", "one"];
    const { items, hasAttention } = useDock();
    const settings = appItem(items.value, "settings");
    const one = appItem(items.value, "one");
    const spotlight = spotlightItem(items.value);
    const trash = trashItem(items.value);

    expect(hasAttention(settings)).toBe(false);
    expect(hasAttention(one)).toBe(false);
    expect(hasAttention(spotlight)).toBe(false);
    expect(hasAttention(trash)).toBe(false);

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    expect(hasAttention(settings)).toBe(true);
    expect(hasAttention(one)).toBe(false);

    serviceWorkerUpdateController.dismiss();

    expect(hasAttention(settings)).toBe(false);
  });
});
