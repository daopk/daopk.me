export const APP_OVERLAY_PORTAL_ID = "app-overlays";

export type PortalTarget = string | HTMLElement;

/**
 * Keep portaled UI inside a named landmark in the full app while preserving
 * body-based rendering for isolated component tests and standalone previews.
 */
export function resolvePortalTarget(explicitTarget?: PortalTarget): PortalTarget {
  if (explicitTarget !== undefined) {
    return explicitTarget;
  }

  if (typeof document === "undefined") {
    return "body";
  }

  return document.getElementById(APP_OVERLAY_PORTAL_ID) ?? "body";
}
