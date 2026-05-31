import { BootManager, BootManagerInjectionKey } from "~/core/boot/BootManager";
import { installedAppsPhase } from "~/core/boot/phases/installedApps";
import { kernelInitPhase } from "~/core/boot/phases/kernelInit";
import { mountShellPhase } from "~/core/boot/phases/mountShell";
import { postPhase } from "~/core/boot/phases/post";

export type { BootDisposable } from "~/core/boot/BootManager";

// `installedAppsPhase` runs after `kernelInitPhase` (store hydrated) and before
// `mountShellPhase` so external apps are registered for the first paint.
export const defaultBootPhases = [
  postPhase,
  kernelInitPhase,
  installedAppsPhase,
  mountShellPhase,
] as const;

export type { BootContext, BootPhase, BootStatus } from "~/core/boot/types";

export {
  BootManager,
  BootManagerInjectionKey,
  installedAppsPhase,
  kernelInitPhase,
  mountShellPhase,
  postPhase,
};
