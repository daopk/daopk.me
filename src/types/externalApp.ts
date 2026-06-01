import type { AppPermission } from "~/types/app";

/**
 * Categories an external (installed) app may declare. Deliberately excludes
 * `"system"` from {@link AppManifest} so third-party apps cannot masquerade as
 * first-party system software. The validator enforces this.
 */
export type ExternalAppCategory = "productivity" | "media" | "dev" | "other";

/** Remote image icon (e.g. an app's hosted PNG/SVG). Loaded with no referrer. */
export interface ExternalAppIconUrl {
  type: "url";
  src: string;
}

/** Iconify icon by name (e.g. `"lucide:rocket"`), rendered via `@iconify/vue`. */
export interface ExternalAppIconIconify {
  type: "iconify";
  name: string;
}

export type ExternalAppIcon = ExternalAppIconUrl | ExternalAppIconIconify;

/** Subset of {@link WindowDefaults} an external manifest may request (clamped). */
export interface ExternalAppWindowDefaults {
  width?: number;
  height?: number;
  maximized?: boolean;
  centered?: boolean;
}

/**
 * The serializable, plain-JSON contract an external app publishes. It is NOT an
 * {@link AppManifest}: it carries no Vue `Component` and no module loader. The
 * host fetches it, validates it (see `externalManifest.ts`), then adapts it into
 * a runtime `AppManifest` (see `externalAppAdapter.ts`). Keeping these separate
 * preserves the strong `AppManifest` contract for built-ins.
 */
export interface ExternalAppManifest {
  /** Stable unique id. Lowercase kebab-case; cannot collide with a built-in. */
  id: string;
  name: string;
  /** Required for external apps; used by catalog updates and app metadata surfaces. */
  version: string;
  category: ExternalAppCategory;
  description?: string;
  /** Absolute `https:` URL to an ES module that `export default`s a component. */
  entry: string;
  icon: ExternalAppIcon;
  permissions?: AppPermission[];
  defaultWindow?: ExternalAppWindowDefaults;
  singleton?: boolean;
  keywords?: string[];
}
