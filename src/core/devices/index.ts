export type { LogicalBreakpointBand } from "~/core/devices/breakpoints";

export { breakpoints, matchBreakpoint } from "~/core/devices/breakpoints";

export type { WatchDeviceProfileHandle } from "~/core/devices/deviceProfile";

export { createBaselineProfile, watchDeviceProfile } from "~/core/devices/deviceProfile";

export {
  getPrefersReducedMotion,
  subscribePrefersReducedMotion,
} from "~/core/devices/motionPreference";
