import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
} from "vue";

import { useKernel } from "~/composables/useKernel";
import { useWidgetEnabled } from "~/composables/useWidgetEnabled";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import {
  createWidgetCatalogItems,
  matchesWidgetCatalogQuery,
  setWidgetVisible,
  widgetMatchesSurface,
  type WidgetCatalogItem,
} from "~/core/widgets/catalog";
import { useDesktopWidgetPlacementResolver } from "~/shells/desktop/widgetPlacement/useDesktopWidgetPlacement";
import type { AppManifest } from "~/types/app";
import type { WidgetManifest, WidgetSurface } from "~/types/widget";

import {
  useWidgetGalleryDesktopDrag,
  type WidgetGalleryDesktopDragState,
} from "./useWidgetGalleryDesktopDrag";
import { useWidgetGalleryPanelDrag } from "./useWidgetGalleryPanelDrag";

export type ConcreteSurface = Exclude<WidgetSurface, "any">;

export interface WidgetGallerySurfaceTab {
  id: ConcreteSurface;
  label: string;
}

const SURFACE_TABS: readonly WidgetGallerySurfaceTab[] = [
  { id: "desktop:wallpaper", label: "Desktop" },
  { id: "desktop:menubar", label: "Menubar" },
];

export interface UseDesktopWidgetGalleryOptions {
  /** Template ref to the gallery panel, owned by the SFC for drag bounds. */
  panelRef: Ref<HTMLElement | null>;
}

export interface DesktopWidgetGallery {
  open: Ref<boolean>;
  query: Ref<string>;
  activeSurface: Ref<ConcreteSurface>;
  surfaceTabs: readonly WidgetGallerySurfaceTab[];
  filteredItems: ComputedRef<readonly WidgetCatalogItem[]>;
  hasItems: ComputedRef<boolean>;
  panelDragging: Ref<boolean>;
  panelStyle: ComputedRef<Record<string, string>>;
  startPanelDrag: (event: PointerEvent) => void;
  dragging: Ref<WidgetGalleryDesktopDragState | null>;
  dragStyle: ComputedRef<Record<string, string>>;
  startDesktopDrag: (item: WidgetCatalogItem, event: PointerEvent) => void;
  close: () => void;
  show: (item: WidgetCatalogItem) => void;
  hide: (item: WidgetCatalogItem) => void;
}

export function useDesktopWidgetGallery(
  options: UseDesktopWidgetGalleryOptions,
): DesktopWidgetGallery {
  const { panelRef } = options;

  const kernel = useKernel();
  const placements = useWidgetPlacementStore();
  const { enabled: enabledMap, isEnabled, setEnabled } = useWidgetEnabled("desktop");

  const open = ref(false);
  const query = ref("");
  const activeSurface = ref<ConcreteSurface>("desktop:wallpaper");
  const widgets = shallowRef<readonly WidgetManifest[]>(kernel.widgets.list());
  const apps = shallowRef<readonly AppManifest[]>(kernel.apps.list());

  const placementResolver = useDesktopWidgetPlacementResolver({
    getWidgets: () => widgets.value,
    getPlacement: (id) => placements.get(id),
    isEnabled: (id, defaultVisible) => isEnabled(id, defaultVisible),
  });

  const { panelDragging, panelStyle, startPanelDrag, clampPanelToViewport, stopPanelDrag } =
    useWidgetGalleryPanelDrag({
      panelRef,
      isOpen: () => open.value,
      getDesktopStageTop: () => desktopStageRect()?.top ?? 0,
    });

  const { dragging, dragStyle, startDesktopDrag, stopDesktopDrag } = useWidgetGalleryDesktopDrag({
    resolveTargetAtPointer(item, clientX, clientY) {
      const rect = desktopStageRect();
      if (rect === null) return null;
      return placementResolver.resolvePointerPlacement(item.manifest, { clientX, clientY }, rect, {
        excludeId: item.id,
      });
    },
    onPlace(item, placement) {
      placements.set(item.id, placement);
      show(item);
    },
  });

  function refreshCatalog(): void {
    widgets.value = kernel.widgets.list();
    apps.value = kernel.apps.list();
  }

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
    window.addEventListener("resize", clampPanelToViewport);
  });

  onUnmounted(() => {
    stopOpen();
    stopWidgetRegistered();
    stopWidgetUnregistered();
    stopAppRegistered();
    stopAppUnregistered();
    stopDesktopDrag();
    stopPanelDrag();
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

  const hasItems = computed(() => filteredItems.value.length > 0);

  function close(): void {
    open.value = false;
  }

  function show(item: WidgetCatalogItem): void {
    setWidgetVisible(setEnabled, item.manifest, true);
  }

  function hide(item: WidgetCatalogItem): void {
    setWidgetVisible(setEnabled, item.manifest, false);
  }

  function desktopStageRect(): DOMRect | null {
    return document.querySelector<HTMLElement>(".desktop-stage")?.getBoundingClientRect() ?? null;
  }

  return {
    open,
    query,
    activeSurface,
    surfaceTabs: SURFACE_TABS,
    filteredItems,
    hasItems,
    panelDragging,
    panelStyle,
    startPanelDrag,
    dragging,
    dragStyle,
    startDesktopDrag,
    close,
    show,
    hide,
  };
}
