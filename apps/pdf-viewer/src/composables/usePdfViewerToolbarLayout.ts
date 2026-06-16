import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
  type WatchSource,
} from "vue";

const PDF_VIEWER_TOOLBAR_ACTION_IDS = ["open", "zoom", "fit", "rotate", "download"] as const;

export type PdfViewerToolbarActionId = (typeof PDF_VIEWER_TOOLBAR_ACTION_IDS)[number];

interface UsePdfViewerToolbarLayoutOptions {
  readonly controlsEl: Ref<HTMLElement | null>;
  readonly layoutTriggers?: readonly WatchSource<unknown>[];
}

export interface UsePdfViewerToolbarLayoutBindings {
  readonly visibleToolbarActionIds: Ref<readonly PdfViewerToolbarActionId[]>;
  readonly overflowToolbarActionIds: ComputedRef<PdfViewerToolbarActionId[]>;
  readonly hasOverflowToolbarActions: ComputedRef<boolean>;
  readonly hasVisibleToolbarTools: ComputedRef<boolean>;
  readonly hasOverflowDocumentAction: ComputedRef<boolean>;
  readonly hasOverflowZoomAction: ComputedRef<boolean>;
  readonly hasOverflowPageToolAction: ComputedRef<boolean>;
  isToolbarActionVisible(id: PdfViewerToolbarActionId): boolean;
  isToolbarActionOverflowed(id: PdfViewerToolbarActionId): boolean;
  scheduleToolbarLayoutUpdate(): void;
  updateToolbarLayout(): void;
}

const BASE_TOOLBAR_ACTION_WIDTHS: Record<PdfViewerToolbarActionId, number> = {
  open: 44,
  zoom: 134,
  fit: 44,
  rotate: 44,
  download: 44,
};
const PAGE_GROUP_FALLBACK_WIDTH = 196;
const MORE_BUTTON_WIDTH = 44;
const TOOLBAR_GAP_FALLBACK = 4;

export function usePdfViewerToolbarLayout({
  controlsEl,
  layoutTriggers = [],
}: UsePdfViewerToolbarLayoutOptions): UsePdfViewerToolbarLayoutBindings {
  const toolbarActionWidths: Record<PdfViewerToolbarActionId, number> = {
    ...BASE_TOOLBAR_ACTION_WIDTHS,
  };
  const visibleToolbarActionIds = ref<readonly PdfViewerToolbarActionId[]>(
    PDF_VIEWER_TOOLBAR_ACTION_IDS,
  );
  const overflowToolbarActionIds = computed(() =>
    PDF_VIEWER_TOOLBAR_ACTION_IDS.filter((id) => !visibleToolbarActionIds.value.includes(id)),
  );
  const hasOverflowToolbarActions = computed(() => overflowToolbarActionIds.value.length > 0);
  const hasVisibleToolbarTools = computed(() =>
    (["zoom", "fit", "rotate", "download"] as const).some(isToolbarActionVisible),
  );
  const hasOverflowDocumentAction = computed(() => isToolbarActionOverflowed("open"));
  const hasOverflowZoomAction = computed(() => isToolbarActionOverflowed("zoom"));
  const hasOverflowPageToolAction = computed(() =>
    (["fit", "rotate", "download"] as const).some(isToolbarActionOverflowed),
  );

  let toolbarResizeObserver: ResizeObserver | null = null;
  let observedControlsEl: HTMLElement | null = null;

  function isToolbarActionVisible(id: PdfViewerToolbarActionId): boolean {
    return visibleToolbarActionIds.value.includes(id);
  }

  function isToolbarActionOverflowed(id: PdfViewerToolbarActionId): boolean {
    return overflowToolbarActionIds.value.includes(id);
  }

  function readPixelValue(value: string, fallback: number): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toolbarGapPx(): number {
    const el = controlsEl.value;
    if (el === null) {
      return TOOLBAR_GAP_FALLBACK;
    }
    const styles = window.getComputedStyle(el);
    return readPixelValue(styles.columnGap || styles.gap, TOOLBAR_GAP_FALLBACK);
  }

  function toolbarButtonWidthPx(): number {
    const button = controlsEl.value?.querySelector<HTMLButtonElement>(".ds-kit-icon-button");
    const width = button?.getBoundingClientRect().width ?? 0;
    return width > 0 ? Math.ceil(width) : MORE_BUTTON_WIDTH;
  }

  function pageGroupWidthPx(): number {
    const pageGroup = controlsEl.value?.querySelector<HTMLElement>(".pdf-viewer__page-group");
    const width = pageGroup?.getBoundingClientRect().width ?? 0;
    return width > 0 ? Math.ceil(width) : PAGE_GROUP_FALLBACK_WIDTH;
  }

  function toolbarInlineWidthFor(
    pageWidth: number,
    actionIds: readonly PdfViewerToolbarActionId[],
    gap: number,
    reserveMore: boolean,
  ): number {
    const actionWidth = actionIds.reduce((sum, id) => sum + toolbarActionWidths[id], 0);
    const groupCount = 1 + actionIds.length + (reserveMore ? 1 : 0);
    return pageWidth + actionWidth + (reserveMore ? MORE_BUTTON_WIDTH : 0) + gap * (groupCount - 1);
  }

  function updateToolbarLayout(): void {
    const el = controlsEl.value;
    if (el === null) {
      visibleToolbarActionIds.value = PDF_VIEWER_TOOLBAR_ACTION_IDS;
      return;
    }

    const availableWidth = el.clientWidth;
    if (availableWidth <= 0) {
      visibleToolbarActionIds.value = PDF_VIEWER_TOOLBAR_ACTION_IDS;
      return;
    }

    const buttonWidth = toolbarButtonWidthPx();
    toolbarActionWidths.open = buttonWidth;
    toolbarActionWidths.fit = buttonWidth;
    toolbarActionWidths.rotate = buttonWidth;
    toolbarActionWidths.download = buttonWidth;

    const gap = toolbarGapPx();
    const pageWidth = pageGroupWidthPx();
    if (
      toolbarInlineWidthFor(pageWidth, PDF_VIEWER_TOOLBAR_ACTION_IDS, gap, false) <= availableWidth
    ) {
      visibleToolbarActionIds.value = PDF_VIEWER_TOOLBAR_ACTION_IDS;
      return;
    }

    const nextVisible: PdfViewerToolbarActionId[] = [];
    for (const id of ["zoom", "fit", "rotate", "download", "open"] as const) {
      const candidate = [...nextVisible, id];
      if (toolbarInlineWidthFor(pageWidth, candidate, gap, true) > availableWidth) {
        break;
      }
      nextVisible.push(id);
    }
    visibleToolbarActionIds.value = nextVisible;
  }

  function observeToolbarControls(): void {
    const nextEl = controlsEl.value;
    if (observedControlsEl === nextEl) {
      return;
    }

    toolbarResizeObserver?.disconnect();
    toolbarResizeObserver = null;
    observedControlsEl = nextEl;

    if (nextEl !== null && typeof ResizeObserver !== "undefined") {
      toolbarResizeObserver = new ResizeObserver(updateToolbarLayout);
      toolbarResizeObserver.observe(nextEl);
    }
  }

  function scheduleToolbarLayoutUpdate(): void {
    void nextTick(() => {
      observeToolbarControls();
      updateToolbarLayout();
    });
  }

  onMounted(() => {
    window.addEventListener("resize", updateToolbarLayout);
    scheduleToolbarLayoutUpdate();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateToolbarLayout);
    toolbarResizeObserver?.disconnect();
  });

  if (layoutTriggers.length > 0) {
    watch(layoutTriggers, scheduleToolbarLayoutUpdate, { immediate: true });
  }

  return {
    visibleToolbarActionIds,
    overflowToolbarActionIds,
    hasOverflowToolbarActions,
    hasVisibleToolbarTools,
    hasOverflowDocumentAction,
    hasOverflowZoomAction,
    hasOverflowPageToolAction,
    isToolbarActionVisible,
    isToolbarActionOverflowed,
    scheduleToolbarLayoutUpdate,
    updateToolbarLayout,
  };
}
