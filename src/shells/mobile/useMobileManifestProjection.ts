import { computed, onScopeDispose, shallowRef, type ComputedRef, type VaporComponent } from "vue";

import { hasAppSettings } from "~/core/apps/appSettings";
import { appSupportsShell, appUnsupportedShellMessage } from "~/core/apps/shellSupport";
import type { AppChromeEdgeSwipe, AppChromeTitlebarVisibility, AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

export interface MobileManifest {
  readonly id: string;
  readonly name: string;
  readonly icon: VaporComponent;
  readonly singleton: boolean;
  readonly hasSettings: boolean;
  readonly supported: boolean;
  readonly unsupportedMessage: string | null;
  readonly chrome: Readonly<{
    titlebar: AppChromeTitlebarVisibility;
    edgeSwipe: AppChromeEdgeSwipe;
  }>;
}

export interface MobileManifestProjection {
  readonly all: ComputedRef<readonly MobileManifest[]>;
  readonly launcher: ComputedRef<readonly MobileManifest[]>;
  find(manifestId: string): MobileManifest | null;
}

interface ProjectionSnapshot {
  readonly all: readonly MobileManifest[];
  readonly launcher: readonly MobileManifest[];
  readonly byId: ReadonlyMap<string, MobileManifest>;
}

type MobileManifestRegistry = Pick<Kernel, "apps" | "events">;

const HIDDEN_PREFIX = "_";

/**
 * Owns the mobile shell's reactive view of the app registry. Registry refresh,
 * mobile defaults, support policy, and launcher visibility stay behind this
 * interface so mobile callers consume one consistent snapshot.
 */
export function useMobileManifestProjection(
  kernel: MobileManifestRegistry,
): MobileManifestProjection {
  const snapshot = shallowRef<ProjectionSnapshot>(projectRegistry(kernel.apps.list()));

  function refresh(): void {
    snapshot.value = projectRegistry(kernel.apps.list());
  }

  const stopRegistered = kernel.events.on("app.registered", refresh);
  const stopUnregistered = kernel.events.on("app.unregistered", refresh);

  onScopeDispose(() => {
    stopRegistered();
    stopUnregistered();
  });

  return {
    all: computed(() => snapshot.value.all),
    launcher: computed(() => snapshot.value.launcher),
    find(manifestId: string): MobileManifest | null {
      return snapshot.value.byId.get(manifestId) ?? null;
    },
  };
}

function projectRegistry(manifests: readonly AppManifest[]): ProjectionSnapshot {
  const all: MobileManifest[] = [];
  const launcher: MobileManifest[] = [];
  const byId = new Map<string, MobileManifest>();

  for (const manifest of manifests) {
    const projected = projectManifest(manifest);
    all.push(projected);
    byId.set(projected.id, projected);

    if (!manifest.id.startsWith(HIDDEN_PREFIX) && manifest.hidden !== true) {
      launcher.push(projected);
    }
  }

  return {
    all: Object.freeze(all),
    launcher: Object.freeze(launcher),
    byId,
  };
}

function projectManifest(manifest: AppManifest): MobileManifest {
  const supported = appSupportsShell(manifest, "mobile");

  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    singleton: manifest.singleton === true,
    hasSettings: hasAppSettings(manifest),
    supported,
    unsupportedMessage: supported ? null : appUnsupportedShellMessage(manifest, "mobile"),
    chrome: Object.freeze({
      titlebar: manifest.chrome?.mobile?.titlebar ?? "visible",
      edgeSwipe: manifest.chrome?.mobile?.edgeSwipe ?? "enabled",
    }),
  });
}
