import { BootManager, BootManagerInjectionKey } from "~/core/boot/BootManager";
import { firstPartyAppsPhase } from "~/core/boot/phases/firstPartyApps";
import { kernelInitPhase } from "~/core/boot/phases/kernelInit";
import { mountShellPhase } from "~/core/boot/phases/mountShell";
import { postPhase } from "~/core/boot/phases/post";

export type { BootDisposable } from "~/core/boot/BootManager";

// After `kernelInitPhase` (store hydrated) and before `mountShellPhase` so all
// apps are registered for the first paint: `firstPartyAppsPhase` registers
// independently-published first-party apps (catalog in prod, workspace in dev).
export const defaultBootPhases = [
  postPhase,
  kernelInitPhase,
  firstPartyAppsPhase,
  mountShellPhase,
] as const;

export type { BootContext, BootPhase, BootStatus } from "~/core/boot/types";

export {
  BootManager,
  BootManagerInjectionKey,
  firstPartyAppsPhase,
  kernelInitPhase,
  mountShellPhase,
  postPhase,
};
