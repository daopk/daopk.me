export const breakpoints = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1180,
  xl: 1440,
} as const;

export type LogicalBreakpointBand = "mobile" | "tablet" | "desktop";

export function matchBreakpoint(width: number): LogicalBreakpointBand {
  if (width < breakpoints.md) {
    return "mobile";
  }

  if (width < breakpoints.lg) {
    return "tablet";
  }

  return "desktop";
}
