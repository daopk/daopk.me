import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { useFocusTrap } from "ropav/focus-trap";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { useWidgetPlacementStore, type WidgetPlacement } from "~/core/widgets/WidgetPlacementStore";
import {
  createWidgetCatalogItems,
  matchesWidgetCatalogQuery,
  setWidgetVisible,
  widgetMatchesSurface,
  type WidgetCatalogItem,
} from "~/core/widgets/catalog";
import { gridToPixels, widgetPixelDimensions } from "~/core/widgets/sizing";
import { useDesktopWidgetPlacementResolver } from "~/shells/desktop/widgetPlacement/useDesktopWidgetPlacement";
import type { AppManifest } from "~/types/app";
import type { WidgetManifest, WidgetSurface } from "~/types/widget";

export type ConcreteSurface = Exclude<WidgetSurface, "any">;

export interface WidgetGallerySurfaceTab {
  id: ConcreteSurface;
  label: string;
}

export interface DesktopWidgetGalleryPanelBindings {
  readonly class: Readonly<Record<string, boolean>>;
  readonly style: Readonly<Record<string, string>>;
}

export interface DesktopWidgetGalleryDragPreview {
  readonly label: string;
  readonly style: Readonly<Record<string, string>>;
}

export interface DesktopWidgetGalleryView {
  readonly isOpen: boolean;
  readonly query: string;
  readonly activeSurface: ConcreteSurface;
  readonly surfaceTabs: readonly WidgetGallerySurfaceTab[];
  readonly items: readonly WidgetCatalogItem[];
  readonly empty: boolean;
  readonly panelBindings: DesktopWidgetGalleryPanelBindings;
  readonly dragPreview: DesktopWidgetGalleryDragPreview | null;
}

export interface DesktopWidgetGalleryActions {
  readonly close: () => void;
  readonly selectSurface: (value: string | number | null) => void;
  readonly setQuery: (value: string) => void;
  readonly setItemVisible: (item: WidgetCatalogItem, visible: boolean) => void;
  readonly handlePanelPointerDown: (event: PointerEvent) => void;
  readonly handleItemPointerDown: (item: WidgetCatalogItem, event: PointerEvent) => void;
}

export interface UseDesktopWidgetGalleryOptions {
  /** Template refs stay visual; their pointer and focus lifecycles belong to the gallery. */
  readonly panelRef: Readonly<Ref<HTMLElement | null>>;
  readonly initialFocusRef: Readonly<Ref<HTMLElement | null>>;
}

export interface DesktopWidgetGallery {
  readonly view: ComputedRef<DesktopWidgetGalleryView>;
  readonly actions: DesktopWidgetGalleryActions;
}

interface DesktopDragState {
  readonly item: WidgetCatalogItem;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SURFACE_TABS: readonly WidgetGallerySurfaceTab[] = [
  { id: "desktop:wallpaper", label: "Desktop" },
  { id: "desktop:menubar", label: "Menubar" },
];

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function menuTriggerFor(element: HTMLElement): HTMLElement | null {
  const menu = element.closest<HTMLElement>('[role="menu"]');
  const labelledBy = menu?.getAttribute("aria-labelledby")?.trim();
  if (labelledBy === undefined || labelledBy.length === 0) {
    return null;
  }

  const triggerId = labelledBy.split(/\s+/u)[0];
  const trigger = triggerId === undefined ? null : document.getElementById(triggerId);
  return trigger instanceof HTMLElement ? trigger : null;
}

function currentReturnFocusTarget(): HTMLElement | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return null;
  }

  return menuTriggerFor(activeElement) ?? activeElement;
}

export function useDesktopWidgetGallery(
  options: UseDesktopWidgetGalleryOptions,
): DesktopWidgetGallery {
  const { panelRef, initialFocusRef } = options;

  const kernel = useKernel();
  const placements = useWidgetPlacementStore();
  const { enabled: enabledMap, isEnabled, setEnabled } = useWidgetEnabled("desktop");

  const open = ref(false);
  const query = ref("");
  const activeSurface = ref<ConcreteSurface>("desktop:wallpaper");
  const widgets = shallowRef<readonly WidgetManifest[]>(kernel.widgets.list());
  const apps = shallowRef<readonly AppManifest[]>(kernel.apps.list());
  const panelPosition = ref<{ x: number; y: number } | null>(null);
  const panelDragging = ref(false);
  const desktopDrag = ref<DesktopDragState | null>(null);

  let stopPanelDragImpl: (() => void) | undefined;
  let stopDesktopDragImpl: (() => void) | undefined;
  let returnFocusTarget: HTMLElement | null = null;

  const placementResolver = useDesktopWidgetPlacementResolver({
    getWidgets: () => widgets.value,
    getPlacement: (id) => placements.get(id),
    isEnabled: (id, defaultVisible) => isEnabled(id, defaultVisible),
  });

  function desktopStageRect(): DOMRect | null {
    return document.querySelector<HTMLElement>(".desktop-stage")?.getBoundingClientRect() ?? null;
  }

  function panelDragBounds(
    width: number,
    height: number,
  ): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const margin = 8;
    const desktopTop = desktopStageRect()?.top ?? 0;
    const minX = margin;
    const minY = Math.max(margin, desktopTop + margin);

    return {
      minX,
      maxX: Math.max(minX, window.innerWidth - width - margin),
      minY,
      maxY: Math.max(minY, window.innerHeight - height - margin),
    };
  }

  function clampPanelPosition(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { x: number; y: number } {
    const bounds = panelDragBounds(width, height);

    return {
      x: clamp(x, bounds.minX, bounds.maxX),
      y: clamp(y, bounds.minY, bounds.maxY),
    };
  }

  function clampPanelToViewport(): void {
    if (!open.value || panelPosition.value === null) return;

    const panel = panelRef.value;
    if (panel === null) return;

    const rect = panel.getBoundingClientRect();
    panelPosition.value = clampPanelPosition(
      panelPosition.value.x,
      panelPosition.value.y,
      rect.width,
      rect.height,
    );
  }

  function stopPanelDrag(): void {
    stopPanelDragImpl?.();
  }

  function handlePanelPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;

    const panel = panelRef.value;
    if (panel === null) return;

    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const width = rect.width;
    const height = rect.height;
    const origin = clampPanelPosition(
      panelPosition.value?.x ?? rect.left,
      panelPosition.value?.y ?? rect.top,
      width,
      height,
    );

    stopPanelDrag();
    panelPosition.value = origin;
    panelDragging.value = true;

    const move = (next: PointerEvent): void => {
      const x = origin.x + next.clientX - startX;
      const y = origin.y + next.clientY - startY;
      panelPosition.value = clampPanelPosition(x, y, width, height);
      next.preventDefault();
    };

    const end = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      stopPanelDragImpl = undefined;
      panelDragging.value = false;
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    stopPanelDragImpl = end;
    event.preventDefault();
  }

  function resolveDesktopDragTarget(
    item: WidgetCatalogItem,
    clientX: number,
    clientY: number,
  ): { placement: WidgetPlacement; stageRect: DOMRect } | null {
    const stageRect = desktopStageRect();
    if (stageRect === null) return null;

    return placementResolver.resolvePointerPlacement(
      item.manifest,
      { clientX, clientY },
      stageRect,
      { excludeId: item.id },
    );
  }

  function dragPreviewPosition(
    item: WidgetCatalogItem,
    clientX: number,
    clientY: number,
    size: { width: number; height: number },
  ): { x: number; y: number } {
    const target = resolveDesktopDragTarget(item, clientX, clientY);
    if (target !== null) {
      return {
        x: target.stageRect.left + gridToPixels(target.placement.gridX),
        y: target.stageRect.top + gridToPixels(target.placement.gridY),
      };
    }

    return {
      x: clientX - size.width / 2,
      y: clientY - size.height / 2,
    };
  }

  function placeAtPointer(item: WidgetCatalogItem, clientX: number, clientY: number): void {
    const target = resolveDesktopDragTarget(item, clientX, clientY);
    if (target === null) return;

    placements.set(item.id, target.placement);
    setItemVisible(item, true);
  }

  function stopDesktopDrag(): void {
    stopDesktopDragImpl?.();
  }

  function handleItemPointerDown(item: WidgetCatalogItem, event: PointerEvent): void {
    if (event.button !== 0 || item.visible || !item.desktopPlaceable) return;

    const size = widgetPixelDimensions(item.manifest.size);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    stopDesktopDrag();

    const move = (next: PointerEvent): void => {
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) {
        return;
      }

      moved = true;
      const position = dragPreviewPosition(item, next.clientX, next.clientY, size);
      desktopDrag.value = {
        item,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };
      next.preventDefault();
    };

    const end = (next: PointerEvent): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      stopDesktopDragImpl = undefined;
      if (moved) {
        placeAtPointer(item, next.clientX, next.clientY);
      }
      desktopDrag.value = null;
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    stopDesktopDragImpl = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      stopDesktopDragImpl = undefined;
      desktopDrag.value = null;
    };
  }

  function refreshCatalog(): void {
    widgets.value = kernel.widgets.list();
    apps.value = kernel.apps.list();
  }

  function close(): void {
    open.value = false;
  }

  function selectSurface(value: string | number | null): void {
    if (value === "desktop:wallpaper" || value === "desktop:menubar") {
      activeSurface.value = value;
    }
  }

  function setQuery(value: string): void {
    query.value = value;
  }

  function setItemVisible(item: WidgetCatalogItem, visible: boolean): void {
    setWidgetVisible(setEnabled, item.manifest, visible);
  }

  const { activate, deactivate } = useFocusTrap(panelRef, {
    allowOutsideClick: true,
    escapeDeactivates: false,
    fallbackFocus: () => panelRef.value!,
    initialFocus: () => initialFocusRef.value ?? panelRef.value ?? false,
    returnFocusOnDeactivate: true,
    setReturnFocus: () => {
      if (returnFocusTarget?.isConnected === true) {
        return returnFocusTarget;
      }

      return document.querySelector<HTMLElement>(".desktop-stage") ?? false;
    },
    tabbableOptions: { displayCheck: "full" },
  });

  function onGlobalKeydown(event: KeyboardEvent): void {
    if (!open.value || event.defaultPrevented || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    close();
  }

  watch(
    open,
    (isOpen) => {
      if (!isOpen) {
        stopDesktopDrag();
        stopPanelDrag();
        deactivate({ returnFocus: true });
        return;
      }

      returnFocusTarget = currentReturnFocusTarget();
      void nextTick(() => {
        if (open.value) {
          activate();
        }
      });
    },
    { flush: "sync" },
  );

  const stopOpen = kernel.events.on("widget.gallery.open.requested", () => {
    refreshCatalog();
    open.value = true;
    void nextTick(clampPanelToViewport);
  });
  const stopWidgetRegistered = kernel.events.on("widget.registered", refreshCatalog);
  const stopWidgetUnregistered = kernel.events.on("widget.unregistered", refreshCatalog);
  const stopAppRegistered = kernel.events.on("app.registered", refreshCatalog);
  const stopAppUnregistered = kernel.events.on("app.unregistered", refreshCatalog);

  onMounted(() => {
    if (!placements.isHydrated()) {
      placements.hydrate();
    }
    window.addEventListener("keydown", onGlobalKeydown);
    window.addEventListener("resize", clampPanelToViewport);
  });

  onBeforeUnmount(() => {
    stopOpen();
    stopWidgetRegistered();
    stopWidgetUnregistered();
    stopAppRegistered();
    stopAppUnregistered();
    stopDesktopDrag();
    stopPanelDrag();
    deactivate({ returnFocus: false });
    window.removeEventListener("keydown", onGlobalKeydown);
    window.removeEventListener("resize", clampPanelToViewport);
  });

  const catalogItems = computed(() => {
    void enabledMap.value;
    return createWidgetCatalogItems({
      widgets: widgets.value,
      apps: apps.value,
      isVisible: (manifest, defaultVisible) => isEnabled(manifest.id, defaultVisible),
    });
  });

  const filteredItems = computed(() =>
    catalogItems.value.filter((item) => {
      if (!widgetMatchesSurface(item.manifest, activeSurface.value)) return false;
      return matchesWidgetCatalogQuery(item, query.value);
    }),
  );

  const panelBindings = computed<DesktopWidgetGalleryPanelBindings>(() => {
    const position = panelPosition.value;
    const style: Readonly<Record<string, string>> =
      position === null
        ? {}
        : {
            insetBlockStart: `${position.y.toString()}px`,
            insetInlineEnd: "auto",
            insetInlineStart: `${position.x.toString()}px`,
          };

    return {
      class: {
        "desktop-widget-gallery--dragging": panelDragging.value,
      },
      style,
    };
  });

  const dragPreview = computed<DesktopWidgetGalleryDragPreview | null>(() => {
    const state = desktopDrag.value;
    if (state === null) return null;

    return {
      label: state.item.title,
      style: {
        inlineSize: `${state.width.toString()}px`,
        blockSize: `${state.height.toString()}px`,
        transform: `translate3d(${state.x.toString()}px, ${state.y.toString()}px, 0)`,
      },
    };
  });

  const view = computed<DesktopWidgetGalleryView>(() => ({
    isOpen: open.value,
    query: query.value,
    activeSurface: activeSurface.value,
    surfaceTabs: SURFACE_TABS,
    items: filteredItems.value,
    empty: filteredItems.value.length === 0,
    panelBindings: panelBindings.value,
    dragPreview: dragPreview.value,
  }));

  return {
    view,
    actions: {
      close,
      selectSurface,
      setQuery,
      setItemVisible,
      handlePanelPointerDown,
      handleItemPointerDown,
    },
  };
}
