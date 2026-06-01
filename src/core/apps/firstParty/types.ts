import type { AppPermission, WindowDefaults } from "~/types/app";
import type { ShellId } from "~/types/shell";
import type { WidgetManifest } from "~/types/widget";
import type { Component } from "vue";

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
  readonly keywords?: readonly string[];
  /**
   * Widgets this app contributes. Unlike user-installed external apps (whose
   * widgets are dropped), first-party apps are trusted to register widgets;
   * carried through to the built `AppManifest`.
   */
  readonly widgets?: readonly WidgetManifest[];
}

/** One published app in the catalog: which immutable URL serves which version. */
export interface FirstPartyCatalogEntry {
  readonly id: string;
  readonly version: string;
  /** Same-origin, version-pinned module URL, e.g. `/apps/notes/1.0.0/notes.js`. */
  readonly entry: string;
}

/** The `/apps/index.json` document: the dynamic id → entry-URL mapping. */
export interface FirstPartyCatalog {
  readonly apps: readonly FirstPartyCatalogEntry[];
}
