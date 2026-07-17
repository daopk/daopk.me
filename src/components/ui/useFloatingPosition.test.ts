import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type CSSProperties } from "vue";

import { useFloatingPosition } from "./useFloatingPosition";

const floatingMocks = vi.hoisted(() => ({
  update: vi.fn(),
  use: vi.fn(),
}));

vi.mock("ropav/floating", () => ({
  useFloatingPosition: floatingMocks.use,
}));

describe("useFloatingPosition", () => {
  beforeEach(() => {
    floatingMocks.update.mockReset();
    floatingMocks.use.mockReset();
  });

  it("maps the local facade options to Ropav 0.0.13", () => {
    const actualPlacement = ref("top-end" as const);
    const ropavArrowStyle = ref<CSSProperties>({ left: "12px", top: "4px" });
    const floatingStyle = ref<CSSProperties>({ left: "20px", position: "fixed", top: "8px" });
    floatingMocks.use.mockReturnValue({
      actualPlacement,
      arrowStyle: ropavArrowStyle,
      floatingStyle,
      isPositioned: ref(true),
      update: floatingMocks.update,
    });

    const arrow = ref<HTMLElement | null>(null);
    const floating = ref<HTMLElement | null>(null);
    const reference = { getBoundingClientRect: () => new DOMRect(10, 20, 30, 40) };
    const result = useFloatingPosition({
      align: () => "end",
      arrow,
      floating,
      open: () => true,
      prioritizePosition: () => true,
      reference: () => reference,
      side: () => "top",
      sideOffset: () => 12,
      updatePositionStrategy: () => "always",
    });

    expect(floatingMocks.use).toHaveBeenCalledOnce();
    const options = floatingMocks.use.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      arrow,
      collisionPadding: 8,
      floating,
      strategy: "fixed",
    });
    expect(options?.placement()).toBe("top-end");
    expect(options?.offset()).toBe(12);
    expect(options?.flipOptions()).toEqual({ fallbackStrategy: "initialPlacement" });
    expect(options?.autoUpdateOptions()).toEqual({ animationFrame: true });
    expect(result.floatingStyle).toBe(floatingStyle);
    expect(result.resolvedSide.value).toBe("top");
    expect(result.arrowStyle.value).toEqual({ left: "12px", top: "4px", bottom: "-4px" });
    expect(result.update).toBe(floatingMocks.update);
  });

  it("keeps centered placement and optimized positioning defaults", () => {
    floatingMocks.use.mockReturnValue({
      actualPlacement: ref("right" as const),
      arrowStyle: ref<CSSProperties>(),
      floatingStyle: ref<CSSProperties>({}),
      isPositioned: ref(false),
      update: floatingMocks.update,
    });

    useFloatingPosition({
      align: () => "center",
      arrow: ref(null),
      floating: ref(null),
      open: () => false,
      reference: () => null,
      side: () => "right",
      sideOffset: () => 10,
    });

    const options = floatingMocks.use.mock.calls[0]?.[0];
    expect(options?.placement()).toBe("right");
    expect(options?.flipOptions()).toEqual({ fallbackStrategy: "bestFit" });
    expect(options?.autoUpdateOptions()).toEqual({ animationFrame: false });
  });
});
