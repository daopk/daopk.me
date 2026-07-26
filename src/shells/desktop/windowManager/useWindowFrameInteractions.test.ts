import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

import {
  useWindowFrameInteractions,
  type WindowFrameOutcome,
  type WindowFrameResizeDirection,
  type WindowFrameSnapshot,
} from "./useWindowFrameInteractions";

interface FakePointerEventInit {
  readonly button?: number;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly pointerId?: number;
}

interface HarnessOptions {
  readonly window?: Partial<WindowFrameSnapshot["window"]>;
  readonly stageBounds?: WindowFrameSnapshot["stageBounds"];
  readonly stageOffset?: WindowFrameSnapshot["stageOffset"];
  readonly applyResizeOutcomes?: boolean;
}

function fakePointerEvent(type: string, init: FakePointerEventInit = {}): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId ?? 1 },
  });

  return event as PointerEvent;
}

function pointerDown(
  element: HTMLElement,
  start: (event: PointerEvent) => void,
  init: FakePointerEventInit = {},
): void {
  const event = fakePointerEvent("pointerdown", init);
  Object.defineProperty(event, "currentTarget", { value: element });
  start(event);
}

function createHarness(options: HarnessOptions = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const window = {
    id: "window-1",
    x: 100,
    y: 80,
    width: 300,
    height: 240,
    maximized: false,
    ...options.window,
  };
  const snapshot: WindowFrameSnapshot = {
    window,
    stageBounds: options.stageBounds ?? { width: 500, height: 400 },
    stageOffset: options.stageOffset,
  };
  const outcomes: WindowFrameOutcome[] = [];
  const focus = vi.fn();
  const interactions = useWindowFrameInteractions({
    read: () => snapshot,
    focus,
    publish: (outcome) => {
      outcomes.push(outcome);
      if (options.applyResizeOutcomes && outcome.type === "resize-window") {
        Object.assign(window, {
          x: outcome.x,
          y: outcome.y,
          width: outcome.width,
          height: outcome.height,
        });
      }
    },
  });

  return { element, focus, interactions, outcomes, snapshot };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("window frame interaction seam", () => {
  it("owns the complete drag, clamp, snap-preview, and snap-commit lifecycle", () => {
    const { element, focus, interactions, outcomes } = createHarness({
      stageOffset: { x: 10, y: 20 },
    });

    pointerDown(element, interactions.startDrag, { clientX: 110, clientY: 100 });

    expect(interactions.dragging.value).toBe(true);
    expect(focus).toHaveBeenCalledOnce();

    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 1_000, clientY: 1_000 }));

    expect(outcomes).toEqual([
      { type: "move-window", windowId: "window-1", x: 440, y: 372 },
      { type: "preview-snap", windowId: "window-1", edge: "right" },
    ]);

    element.dispatchEvent(fakePointerEvent("pointerup"));

    expect(interactions.dragging.value).toBe(false);
    expect(outcomes).toEqual([
      { type: "move-window", windowId: "window-1", x: 440, y: 372 },
      { type: "preview-snap", windowId: "window-1", edge: "right" },
      { type: "preview-snap", windowId: "window-1", edge: null },
      { type: "snap-window", windowId: "window-1", edge: "right" },
    ]);
  });

  it.each([
    {
      name: "keeps the titlebar visible past the left edge",
      window: {},
      stageBounds: { width: 500, height: 400 },
      move: { clientX: -1_000, clientY: 100 },
      expected: { x: -240, y: 80 },
    },
    {
      name: "keeps a narrow window at the left edge",
      window: { width: 40 },
      stageBounds: { width: 500, height: 400 },
      move: { clientX: -1_000, clientY: 100 },
      expected: { x: 0, y: 80 },
    },
    {
      name: "keeps the titlebar inside the vertical stage band",
      window: {},
      stageBounds: { width: 500, height: 400 },
      move: { clientX: 110, clientY: 1_000 },
      expected: { x: 100, y: 372 },
    },
    {
      name: "passes through coordinates before the stage is measured",
      window: {},
      stageBounds: { width: 0, height: 0 },
      move: { clientX: -490, clientY: -180 },
      expected: { x: -500, y: -200 },
    },
  ])("$name", ({ window, stageBounds, move, expected }) => {
    const { element, interactions, outcomes } = createHarness({ window, stageBounds });

    pointerDown(element, interactions.startDrag, { clientX: 110, clientY: 100 });
    element.dispatchEvent(fakePointerEvent("pointermove", move));

    expect(outcomes).toContainEqual({
      type: "move-window",
      windowId: "window-1",
      ...expected,
    });
  });

  it("clamps resize bounds and exposes only the gesture lifecycle state", () => {
    const { element, focus, interactions, outcomes } = createHarness();

    pointerDown(element, (event) => interactions.startResize("nw", event));

    expect(interactions.resizing.value).toBe(true);
    expect(focus).toHaveBeenCalledOnce();

    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: -200, clientY: -200 }));

    expect(outcomes).toEqual([
      {
        type: "resize-window",
        windowId: "window-1",
        x: 0,
        y: 0,
        width: 400,
        height: 320,
      },
    ]);

    element.dispatchEvent(fakePointerEvent("pointerup"));
    expect(interactions.resizing.value).toBe(false);
  });

  it("anchors every resize move to an immutable pointer-down snapshot", () => {
    const { element, interactions, outcomes } = createHarness({
      applyResizeOutcomes: true,
      stageBounds: { width: 2_000, height: 2_000 },
    });

    pointerDown(element, (event) => interactions.startResize("e", event));
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 10 }));
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 20 }));

    expect(outcomes).toEqual([
      {
        type: "resize-window",
        windowId: "window-1",
        x: 100,
        y: 80,
        width: 310,
        height: 240,
      },
      {
        type: "resize-window",
        windowId: "window-1",
        x: 100,
        y: 80,
        width: 320,
        height: 240,
      },
    ]);
  });

  it.each<{
    direction: WindowFrameResizeDirection;
    delta: { clientX: number; clientY: number };
    expected: { x: number; y: number; width: number; height: number };
  }>([
    {
      direction: "e",
      delta: { clientX: 50, clientY: 999 },
      expected: { x: 100, y: 80, width: 450, height: 300 },
    },
    {
      direction: "s",
      delta: { clientX: 999, clientY: 70 },
      expected: { x: 100, y: 80, width: 400, height: 370 },
    },
    {
      direction: "w",
      delta: { clientX: -40, clientY: 0 },
      expected: { x: 60, y: 80, width: 440, height: 300 },
    },
    {
      direction: "n",
      delta: { clientX: 0, clientY: -30 },
      expected: { x: 100, y: 50, width: 400, height: 330 },
    },
    {
      direction: "se",
      delta: { clientX: 25, clientY: 15 },
      expected: { x: 100, y: 80, width: 425, height: 315 },
    },
    {
      direction: "nw",
      delta: { clientX: -20, clientY: -10 },
      expected: { x: 80, y: 70, width: 420, height: 310 },
    },
    {
      direction: "ne",
      delta: { clientX: 30, clientY: -20 },
      expected: { x: 100, y: 60, width: 430, height: 320 },
    },
    {
      direction: "sw",
      delta: { clientX: -15, clientY: 25 },
      expected: { x: 85, y: 80, width: 415, height: 325 },
    },
  ])("calculates $direction resize outcomes", ({ direction, delta, expected }) => {
    const { element, interactions, outcomes } = createHarness({
      window: { width: 400, height: 300 },
      stageBounds: { width: 2_000, height: 2_000 },
    });

    pointerDown(element, (event) => interactions.startResize(direction, event));
    element.dispatchEvent(fakePointerEvent("pointermove", delta));

    expect(outcomes).toEqual([{ type: "resize-window", windowId: "window-1", ...expected }]);
  });

  it("ignores non-primary pointer starts", () => {
    const { element, focus, interactions, outcomes } = createHarness();

    pointerDown(element, interactions.startDrag, { button: 2 });
    pointerDown(element, (event) => interactions.startResize("e", event), { button: 2 });

    expect(interactions.dragging.value).toBe(false);
    expect(interactions.resizing.value).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
  });

  it("cancels drag without committing snap and detaches pointer listeners", () => {
    const { element, interactions, outcomes } = createHarness();

    pointerDown(element, interactions.startDrag, { clientX: 110, clientY: 100 });
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 499, clientY: 100 }));
    element.dispatchEvent(fakePointerEvent("pointercancel"));

    expect(interactions.dragging.value).toBe(false);
    expect(outcomes).toContainEqual({
      type: "preview-snap",
      windowId: "window-1",
      edge: null,
    });
    expect(outcomes.some((outcome) => outcome.type === "snap-window")).toBe(false);

    const outcomeCount = outcomes.length;
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 200, clientY: 200 }));
    expect(outcomes).toHaveLength(outcomeCount);
  });

  it("cancels an active gesture when its Vue scope is disposed", () => {
    const scope = effectScope();
    const { element, interactions, outcomes } = scope.run(() => createHarness())!;

    pointerDown(element, interactions.startDrag, { clientX: 110, clientY: 100 });
    element.dispatchEvent(fakePointerEvent("pointermove", { clientX: 499, clientY: 100 }));

    scope.stop();

    expect(interactions.dragging.value).toBe(false);
    expect(outcomes.at(-1)).toEqual({
      type: "preview-snap",
      windowId: "window-1",
      edge: null,
    });
    expect(outcomes.some((outcome) => outcome.type === "snap-window")).toBe(false);
  });

  it("exposes all eight resize handles through the frame seam", () => {
    const { interactions } = createHarness();

    expect(interactions.resizeDirections).toEqual(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  });
});
