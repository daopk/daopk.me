import { BootManager, BootManagerInjectionKey } from "~/core/boot/BootManager";
import { kernelInitPhase } from "~/core/boot/phases/kernelInit";
import { mountShellPhase } from "~/core/boot/phases/mountShell";
import { postPhase } from "~/core/boot/phases/post";

export type { BootDisposable } from "~/core/boot/BootManager";

export const defaultBootPhases = [postPhase, kernelInitPhase, mountShellPhase] as const;

export type { BootContext, BootPhase, BootStatus } from "~/core/boot/types";

export { BootManager, BootManagerInjectionKey, kernelInitPhase, mountShellPhase, postPhase };
