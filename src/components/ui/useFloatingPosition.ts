import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type ReferenceElement,
} from "@floating-ui/dom";
import { nextTick, onBeforeUnmount, shallowRef, watch, type CSSProperties, type Ref } from "vue";

export type FloatingSide = "top" | "right" | "bottom" | "left";
export type FloatingAlign = "start" | "center" | "end";

interface FloatingPositionOptions {
  readonly align: () => FloatingAlign;
  readonly arrow: Readonly<Ref<HTMLElement | null>>;
  readonly floating: Readonly<Ref<HTMLElement | null>>;
  readonly open: () => boolean;
  readonly prioritizePosition?: () => boolean;
  readonly reference: () => ReferenceElement | null;
  readonly side: () => FloatingSide;
  readonly sideOffset: () => number;
  readonly updatePositionStrategy?: () => "optimized" | "always";
}

const oppositeSide: Record<FloatingSide, FloatingSide> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

export function useFloatingPosition(options: FloatingPositionOptions) {
  const floatingStyle = shallowRef<CSSProperties>({
    left: "0",
    position: "fixed",
    top: "0",
    visibility: "hidden",
  });
  const arrowStyle = shallowRef<CSSProperties>({});
  const resolvedSide = shallowRef<FloatingSide>(options.side());
  let stopAutoUpdate: (() => void) | undefined;
  let updateRevision = 0;

  async function update(): Promise<void> {
    const reference = options.reference();
    const floating = options.floating.value;
    if (!options.open() || !reference || !floating) return;

    const revision = ++updateRevision;
    const requestedAlign = options.align();
    const placement =
      requestedAlign === "center"
        ? options.side()
        : (`${options.side()}-${requestedAlign}` as const);
    const arrowElement = options.arrow.value;
    const result = await computePosition(reference, floating, {
      placement,
      strategy: "fixed",
      middleware: [
        offset(options.sideOffset()),
        flip({
          padding: 8,
          fallbackStrategy: options.prioritizePosition?.() ? "initialPlacement" : "bestFit",
        }),
        shift({ padding: 8 }),
        ...(arrowElement ? [arrow({ element: arrowElement, padding: 4 })] : []),
      ],
    });
    if (revision !== updateRevision || !options.open()) return;

    floatingStyle.value = {
      left: `${result.x}px`,
      position: result.strategy,
      top: `${result.y}px`,
      visibility: "visible",
    };

    const side = result.placement.split("-")[0] as FloatingSide;
    resolvedSide.value = side;
    const arrowData = result.middlewareData.arrow;
    if (arrowElement && arrowData) {
      arrowStyle.value = {
        left: arrowData.x === undefined ? undefined : `${arrowData.x}px`,
        top: arrowData.y === undefined ? undefined : `${arrowData.y}px`,
        [oppositeSide[side]]: "-4px",
      };
    }
  }

  function stop(): void {
    updateRevision++;
    stopAutoUpdate?.();
    stopAutoUpdate = undefined;
  }

  watch(
    [
      options.open,
      options.reference,
      options.floating,
      options.arrow,
      options.side,
      options.align,
      options.sideOffset,
      () => options.prioritizePosition?.(),
      () => options.updatePositionStrategy?.(),
    ],
    async ([open]) => {
      stop();
      if (!open) return;
      await nextTick();

      const reference = options.reference();
      const floating = options.floating.value;
      if (!reference || !floating) return;
      stopAutoUpdate = autoUpdate(reference, floating, update, {
        animationFrame: options.updatePositionStrategy?.() === "always",
      });
      await update();
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return { arrowStyle, floatingStyle, resolvedSide, update };
}
