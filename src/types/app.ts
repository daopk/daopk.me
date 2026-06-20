import type { Component, InjectionKey } from "vue";

import {
  AppChromeInjectionKey as rawAppChromeInjectionKey,
  AppContextInjectionKey as rawAppContextInjectionKey,
} from "~/runtime/injectionKeys";
import type { AppPreviewProvider } from "~/types/preview";
import type { AppDesktopManifest } from "~/types/desktop";
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
  minWidth?: number;
  minHeight?: number;
  maximized?: boolean;
  centered?: boolean;
}

export type AppChromeTitlebarVisibility = "visible" | "hidden";
export type AppChromeEdgeSwipe = "enabled" | "disabled";

export interface AppMobileChromeManifest {
  titlebar?: AppChromeTitlebarVisibility;
  edgeSwipe?: AppChromeEdgeSwipe;
}

export interface AppChromeManifest {
  mobile?: AppMobileChromeManifest;
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
   * external manifests require it. Surfaced read-only wherever app metadata is listed.
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
   * App icon as a resolved Vue Component. Built-in (system) apps import a
   * Fluent Color glyph directly; first-party apps declare a flat icon filename
   * in their serializable manifest, which the host resolves to a trusted
   * release-pinned image component (`createImageIcon`) at registration. Keeping
   * this contract a resolved Component (not a string key) lets the dock,
   * launcher, and other surfaces render any app icon uniformly via `AppIcon`.
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
  chrome?: AppChromeManifest;
  permissions?: AppPermission[];
  widgets?: readonly WidgetManifest[];
  component: () => Promise<{ default: Component }>;
  autorun?: boolean;
  keywords?: string[];
  settings?: AppSettingsManifest;
  previews?: readonly AppPreviewProvider[];
  desktop?: AppDesktopManifest;
}

export interface AppContext {
  manifestId: string;
  handleId: string;
  args: Readonly<Record<string, unknown>>;
  // TODO: inject AbortSignal tied to window unmount + process kill.
}

// Defined once in the runtime symbol module; re-typed here for host internals.
export const AppContextInjectionKey = rawAppContextInjectionKey as InjectionKey<AppContext>;

export interface AppChromeBackAction {
  readonly ariaLabel: string;
  readonly handler: () => void;
}

export interface AppChromeContentSize {
  readonly width: number;
  readonly height: number;
}

export interface AppChromeController {
  /**
   * Whether this controller backs visible shell chrome around the app content.
   * Desktop windows may still provide a controller for title / size / window
   * actions without replacing in-app toolbars.
   */
  readonly rendersAppChrome?: boolean;
  setTitle(title: string | null): void;
  setBackAction(action: AppChromeBackAction | null): void;
  setTitlebar?(visibility: AppChromeTitlebarVisibility | null): void;
  setContentSize?(size: AppChromeContentSize | null): void;
  hide?(): void;
  close?(): void;
}

export type AppLifecycleEvent = "close" | "blur" | "focus";

// Defined once in the runtime symbol module; re-typed here for host internals.
export const AppChromeInjectionKey = rawAppChromeInjectionKey as InjectionKey<AppChromeController>;

export interface AppHandle {
  readonly id: string;
  readonly manifestId: string;
  on(event: AppLifecycleEvent, listener: () => void): () => void;
  postMessage(payload: Record<string, unknown>): void;
}
