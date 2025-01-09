export const MIN_VISIBLE_X = 60;

export interface ClampWindowPositionOptions {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly windowWidth: number;
  readonly titlebarHeight: number;
}

/**
 * Clamps a proposed `(x, y)` to the keep-in-stage rules above.
 *
 * Returns the input unchanged when stage dimensions are zero (i.e. the
 * `ResizeObserver` has not measured yet) — the drag handler is responsible
 * for not over-correcting in that brief window.
 */
export function clampWindowPosition(
  x: number,
  y: number,
  options: ClampWindowPositionOptions,
): { x: number; y: number } {
  const { stageWidth, stageHeight, windowWidth, titlebarHeight } = options;

  let safeX = x;
  if (stageWidth > 0) {
    const minX = Math.min(0, MIN_VISIBLE_X - windowWidth);
    const maxX = Math.max(stageWidth - MIN_VISIBLE_X, 0);
    safeX = Math.min(Math.max(x, minX), maxX);
  }

  let safeY = y;
  if (stageHeight > 0) {
    safeY = Math.min(Math.max(y, 0), Math.max(stageHeight - titlebarHeight, 0));
  }

  return { x: safeX, y: safeY };
}
