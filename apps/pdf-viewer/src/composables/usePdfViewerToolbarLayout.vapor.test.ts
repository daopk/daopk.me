import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mountVaporElementComposable } from "~/test/mountVapor";

import {
  usePdfViewerToolbarLayout,
  type UsePdfViewerToolbarLayoutBindings,
} from "./usePdfViewerToolbarLayout";

function toolbarRect(width: number, height = 44): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubToolbarLayout(options: { readonly controlsWidth: number }): void {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function clientWidth() {
    const el = this as HTMLElement;
    if (el.classList.contains("pdf-viewer__controls")) {
      return options.controlsWidth;
    }
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect() {
    const el = this as HTMLElement;
    if (el.classList.contains("pdf-viewer__page-group")) {
      return toolbarRect(196);
    }
    if (el.classList.contains("ds-kit-icon-button")) {
      return toolbarRect(44);
    }
    return toolbarRect(0, 0);
  });
}

function mountToolbarLayout(): {
  layout: UsePdfViewerToolbarLayoutBindings;
  unmount: () => void;
} {
  const mounted = mountVaporElementComposable(
    () => {
      const controls = document.createElement("div");
      controls.className = "pdf-viewer__controls";
      const pageGroup = document.createElement("div");
      pageGroup.className = "pdf-viewer__page-group";
      const button = document.createElement("button");
      button.className = "ds-kit-icon-button";
      button.type = "button";
      controls.append(pageGroup, button);
      return controls;
    },
    (controlsEl) => {
      const pageCount = ref(3);
      const zoomLabel = ref("100%");
      return usePdfViewerToolbarLayout({
        controlsEl,
        layoutTriggers: [pageCount, zoomLabel],
      });
    },
  );

  return {
    layout: mounted.result,
    unmount: mounted.unmount,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePdfViewerToolbarLayout", () => {
  it("keeps all toolbar actions visible when the controls have room", async () => {
    stubToolbarLayout({ controlsWidth: 800 });
    const { layout, unmount } = mountToolbarLayout();

    await nextTick();
    await nextTick();

    expect(layout.visibleToolbarActionIds.value).toEqual([
      "open",
      "zoom",
      "fit",
      "rotate",
      "download",
    ]);
    expect(layout.overflowToolbarActionIds.value).toEqual([]);
    expect(layout.hasOverflowToolbarActions.value).toBe(false);

    unmount();
  });

  it("moves every optional action into overflow when only the page group fits", async () => {
    stubToolbarLayout({ controlsWidth: 344 });
    const { layout, unmount } = mountToolbarLayout();

    await nextTick();
    await nextTick();

    expect(layout.visibleToolbarActionIds.value).toEqual([]);
    expect(layout.overflowToolbarActionIds.value).toEqual([
      "open",
      "zoom",
      "fit",
      "rotate",
      "download",
    ]);
    expect(layout.hasOverflowDocumentAction.value).toBe(true);
    expect(layout.hasOverflowZoomAction.value).toBe(true);
    expect(layout.hasOverflowPageToolAction.value).toBe(true);

    unmount();
  });

  it("keeps the highest-priority tools inline before overflowing the rest", async () => {
    stubToolbarLayout({ controlsWidth: 430 });
    const { layout, unmount } = mountToolbarLayout();

    await nextTick();
    await nextTick();

    expect(layout.visibleToolbarActionIds.value).toEqual(["zoom", "fit"]);
    expect(layout.overflowToolbarActionIds.value).toEqual(["open", "rotate", "download"]);
    expect(layout.isToolbarActionVisible("zoom")).toBe(true);
    expect(layout.isToolbarActionOverflowed("download")).toBe(true);

    unmount();
  });
});
