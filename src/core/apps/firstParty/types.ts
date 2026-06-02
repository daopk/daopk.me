import type {
  AppChromeManifest,
  AppPermission,
  AppSettingsManifest,
  WindowDefaults,
} from "~/types/app";
import type { ShellId } from "~/types/shell";
import type { WidgetManifest } from "~/types/widget";
import type { Component } from "vue";

/**
 * A widget a first-party app contributes. Identical to {@link WidgetManifest}
 * except the component is referenced by `exportName` — the named export in the
 * app's published module that provides the widget's Vue component. The host
 * resolves it to a real `component` loader at registration time (from the
 * catalog entry URL in prod, or the workspace package in dev), since the
 * widget's code ships inside the independently-published app module, not the
 * shell bundle.
 */
export interface FirstPartyWidgetDescriptor extends Omit<WidgetManifest, "component"> {
  /** Named export in the app entry module that is this widget's component. */
  readonly exportName: string;
}

/**
 * A first-party app's **stable identity**, owned by the shell. Everything here
 * is the launcher/dock-facing metadata that must be available before the app's
 * (heavy, independently-published) module is fetched — plus security-relevant
 * fields (permissions, reserved id, `system` category, `autorun`) that the
 * shell, not the app, must control. Only the app's *code* ships out-of-band;
 * its identity stays in the trusted host.
 */
export interface FirstPartyAppDescriptor {
  readonly id: string;
  readonly name: string;
  readonly icon: Component;
  readonly category: "system" | "productivity" | "media" | "dev" | "other";
  /** Fallback version used when the catalog has no published entry yet. */
  readonly version: string;
  readonly singleton?: boolean;
  readonly hidden?: boolean;
  readonly autorun?: boolean;
  readonly supportedShells?: readonly ShellId[];
  readonly permissions?: readonly AppPermission[];
  readonly defaultWindow?: WindowDefaults;
  readonly chrome?: AppChromeManifest;
  readonly keywords?: readonly string[];
  /** Settings metadata (e.g. search keywords) surfaced for this app. */
  readonly settings?: AppSettingsManifest;
  /**
   * Widgets this app contributes. Unlike user-installed external apps (whose
   * widgets are dropped), first-party apps are trusted to register widgets.
   * Each references a named export in the published app module ({@link
   * FirstPartyWidgetDescriptor}); the host builds the real loaders at
   * registration time and carries them through to the built `AppManifest`.
   */
  readonly widgets?: readonly FirstPartyWidgetDescriptor[];
}

/** One published app in the catalog: which immutable URL serves which release. */
export interface FirstPartyCatalogEntry {
  readonly id: string;
  /** Manual, user-facing semver from the app package.json. */
  readonly version: string;
  /** Automatic publish build number. Missing legacy catalog values normalize to 0. */
  readonly build: number;
  /** Optional short source revision for tracing the published bundle. */
  readonly revision?: string;
  /** Same-origin, release-pinned module URL, e.g. `/apps/notes/1.0.0+123/notes.js`. */
  readonly entry: string;
}

/** The `/apps/index.json` document: the dynamic id → entry-URL mapping. */
export interface FirstPartyCatalog {
  readonly apps: readonly FirstPartyCatalogEntry[];
}
