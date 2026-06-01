import type { Component } from "vue";

import type { ShellId } from "~/types/shell";
import type { WidgetManifest } from "~/types/widget";

export type AppPermission =
  | "vfs.read"
  | "vfs.write"
  | "storage.write"
  | "shortcut.global"
  | "notifications.post"
  | "network.fetch";

export interface WindowDefaults {
  width?: number;
  height?: number;
  maximized?: boolean;
  centered?: boolean;
}

export interface AppSettingsManifest {
  keywords?: readonly string[];
}

export interface AppManifest {
  id: string;
  name: string;
  /**
   * Semantic version string (e.g. `"1.0.0"`). Optional so the kernel/registry
   * contract stays backwards compatible, but built-in manifests set it and
   * external manifests require it. Surfaced read-only in Settings > Apps.
   */
  version?: string;
  /**
   * Monotonic first-party app build number. The semantic `version` may stay the
   * same across publishes; `build` lets the host detect same-version updates.
   */
  build?: number;
  /** Short source revision for first-party release traceability. */
  revision?: string;
  /**
   * App icon as a Vue Component (typically an Iconify-backed icon export).
   * Manifests own their visual identity so the dock/launcher can tree-shake
   * down to only the icons actually registered. If broader registries
   * (remote/serializable manifests) become a need later, introduce a parallel
   * string-keyed icon registry then; do not weaken this contract.
   */
  icon: Component;
  category: "system" | "productivity" | "media" | "dev" | "other";
  hidden?: boolean;
  singleton?: boolean;
  /**
   * Shells that can run this app. Omit to support every shell.
   */
  supportedShells?: readonly ShellId[];
  defaultWindow?: WindowDefaults;
  permissions?: AppPermission[];
  widgets?: readonly WidgetManifest[];
  component: () => Promise<{ default: Component }>;
  autorun?: boolean;
  keywords?: string[];
  settings?: AppSettingsManifest;
}

export interface AppContext {
  manifestId: string;
  handleId: string;
  args: Readonly<Record<string, unknown>>;
  // TODO: inject AbortSignal tied to window unmount + process kill.
}

// Defined once in the SDK module (single source — see src/runtime/sdk.ts).
export { AppContextInjectionKey } from "~/runtime/sdk";

export interface AppChromeBackAction {
  readonly ariaLabel: string;
  readonly handler: () => void;
}

export interface AppChromeController {
  setTitle(title: string | null): void;
  setBackAction(action: AppChromeBackAction | null): void;
}

// Defined once in the SDK module (single source — see src/runtime/sdk.ts).
export { AppChromeInjectionKey } from "~/runtime/sdk";

export type AppLifecycleEvent = "close" | "blur" | "focus";

export interface AppHandle {
  readonly id: string;
  readonly manifestId: string;
  on(event: AppLifecycleEvent, listener: () => void): () => void;
  postMessage(payload: Record<string, unknown>): void;
}
