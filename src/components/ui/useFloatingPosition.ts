import {
  useFloatingPosition as useRopavFloatingPosition,
  type FloatingPlacement,
  type FloatingReference,
  type FloatingSide as RopavFloatingSide,
} from "ropav/floating";
import { computed, type CSSProperties, type Ref } from "vue";

export type FloatingSide = RopavFloatingSide;
export type FloatingAlign = "start" | "center" | "end";
export type { FloatingReference };

interface FloatingPositionOptions {
  readonly align: () => FloatingAlign;
  readonly arrow: Readonly<Ref<HTMLElement | null>>;
  readonly floating: Readonly<Ref<HTMLElement | null>>;
  readonly open: () => boolean;
  readonly prioritizePosition?: () => boolean;
  readonly reference: () => FloatingReference | null;
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

function resolvePlacement(side: FloatingSide, align: FloatingAlign): FloatingPlacement {
  return align === "center" ? side : `${side}-${align}`;
}

export function useFloatingPosition(options: FloatingPositionOptions) {
  const {
    actualPlacement,
    arrowStyle: ropavArrowStyle,
    floatingStyle,
    update,
  } = useRopavFloatingPosition({
    arrow: options.arrow,
    autoUpdateOptions: () => ({
      animationFrame: options.updatePositionStrategy?.() === "always",
    }),
    collisionPadding: 8,
    floating: options.floating,
    flipOptions: () => ({
      fallbackStrategy: options.prioritizePosition?.() ? "initialPlacement" : "bestFit",
    }),
    offset: options.sideOffset,
    open: options.open,
    placement: () => resolvePlacement(options.side(), options.align()),
    reference: options.reference,
    strategy: "fixed",
  });

  const resolvedSide = computed<FloatingSide>(
    () => actualPlacement.value.split("-")[0] as FloatingSide,
  );
  const arrowStyle = computed<CSSProperties>(() => ({
    ...ropavArrowStyle.value,
    [oppositeSide[resolvedSide.value]]: "-4px",
  }));

  return { arrowStyle, floatingStyle, resolvedSide, update };
}
