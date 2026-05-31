import type { AppManifest } from "~/types/app";
import type { ShellId } from "~/types/shell";

type AppShellSupportManifest = Pick<AppManifest, "name" | "supportedShells">;

export function appSupportsShell(
  manifest: Pick<AppManifest, "supportedShells">,
  shellId: ShellId,
): boolean {
  return manifest.supportedShells?.includes(shellId) ?? true;
}

export function appUnsupportedShellMessage(
  manifest: AppShellSupportManifest,
  shellId: ShellId,
): string {
  const supportedShells = manifest.supportedShells ?? [];

  if (supportedShells.length === 1 && supportedShells[0] === "desktop" && shellId === "mobile") {
    return `${manifest.name} is not supported on mobile. Open it from the desktop shell.`;
  }

  if (supportedShells.length === 1 && supportedShells[0] === "mobile" && shellId === "desktop") {
    return `${manifest.name} is not supported on desktop. Open it from the mobile shell.`;
  }

  return `${manifest.name} is not supported in this shell.`;
}
