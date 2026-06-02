import type { AppChromeManifest, AppChromeTitlebarVisibility, AppPermission } from "~/types/app";
import type {
  ExternalAppCategory,
  ExternalAppIcon,
  ExternalAppManifest,
  ExternalAppWindowDefaults,
} from "~/types/externalApp";

import { BUILTIN_APP_IDS } from "./builtinAppIds";

/** Categories an external app may declare (excludes `"system"` on purpose). */
export const EXTERNAL_APP_CATEGORIES: readonly ExternalAppCategory[] = [
  "productivity",
  "media",
  "dev",
  "other",
];

/** The full `AppPermission` union as a runtime list, for subset validation. */
export const EXTERNAL_APP_PERMISSIONS: readonly AppPermission[] = [
  "vfs.read",
  "vfs.write",
  "storage.write",
  "shortcut.global",
  "notifications.post",
  "network.fetch",
];

const APP_CHROME_TITLEBAR_VALUES: readonly AppChromeTitlebarVisibility[] = ["visible", "hidden"];

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;
const MAX_VERSION_LENGTH = 32;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_ENTRY_LENGTH = 2048;
const MAX_ICON_NAME_LENGTH = 128;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 40;

/** Window dimensions are clamped to this range to avoid degenerate/huge windows. */
export const EXTERNAL_WINDOW_MIN_PX = 240;
export const EXTERNAL_WINDOW_MAX_PX = 4096;

export type ExternalManifestValidation =
  | { ok: true; manifest: ExternalAppManifest }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:";
}

function clampDimension(value: number): number {
  return Math.min(EXTERNAL_WINDOW_MAX_PX, Math.max(EXTERNAL_WINDOW_MIN_PX, Math.round(value)));
}

function validateIcon(
  input: unknown,
): { ok: true; icon: ExternalAppIcon } | { ok: false; error: string } {
  if (!isRecord(input)) {
    return { ok: false, error: "icon must be an object" };
  }
  if (input.type === "url") {
    if (!isNonEmptyString(input.src) || !isHttpsUrl(input.src)) {
      return { ok: false, error: "icon.src must be an https URL" };
    }
    return { ok: true, icon: { type: "url", src: input.src } };
  }
  if (input.type === "iconify") {
    if (!isNonEmptyString(input.name) || input.name.length > MAX_ICON_NAME_LENGTH) {
      return { ok: false, error: "icon.name must be a non-empty string" };
    }
    return { ok: true, icon: { type: "iconify", name: input.name } };
  }
  return { ok: false, error: 'icon.type must be "url" or "iconify"' };
}

function validatePermissions(
  input: unknown,
): { ok: true; permissions?: AppPermission[] } | { ok: false; error: string } {
  if (input === undefined) {
    return { ok: true };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "permissions must be an array" };
  }
  const allowed = new Set<string>(EXTERNAL_APP_PERMISSIONS);
  const seen = new Set<AppPermission>();
  for (const entry of input) {
    if (typeof entry !== "string" || !allowed.has(entry)) {
      return { ok: false, error: `unknown permission: ${String(entry)}` };
    }
    seen.add(entry as AppPermission);
  }
  return seen.size > 0 ? { ok: true, permissions: [...seen] } : { ok: true };
}

function cleanWindowDefaults(input: unknown): ExternalAppWindowDefaults | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const out: ExternalAppWindowDefaults = {};
  if (typeof input.width === "number" && Number.isFinite(input.width)) {
    out.width = clampDimension(input.width);
  }
  if (typeof input.height === "number" && Number.isFinite(input.height)) {
    out.height = clampDimension(input.height);
  }
  if (typeof input.maximized === "boolean") {
    out.maximized = input.maximized;
  }
  if (typeof input.centered === "boolean") {
    out.centered = input.centered;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanChromeManifest(input: unknown): AppChromeManifest | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const mobile = isRecord(input.mobile) ? input.mobile : undefined;
  if (!mobile) {
    return undefined;
  }

  const out: AppChromeManifest = {};
  if (
    typeof mobile.titlebar === "string" &&
    APP_CHROME_TITLEBAR_VALUES.includes(mobile.titlebar as AppChromeTitlebarVisibility)
  ) {
    out.mobile = { titlebar: mobile.titlebar as AppChromeTitlebarVisibility };
  }

  return out.mobile === undefined ? undefined : out;
}

function cleanKeywords(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const seen = new Set<string>();
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_KEYWORD_LENGTH) continue;
    seen.add(trimmed);
    if (seen.size >= MAX_KEYWORDS) break;
  }
  return seen.size > 0 ? [...seen] : undefined;
}

/**
 * Validate + normalize an untrusted, plain-JSON external manifest. Returns a
 * cleaned {@link ExternalAppManifest} with unknown fields stripped, or a
 * human-readable error. Security gates (all enforced here):
 *  - id: kebab-case, not a reserved/built-in id, never `_`-prefixed;
 *  - entry + url icons: absolute `https:` only;
 *  - permissions: subset of the host `AppPermission` union;
 *  - category: from the external whitelist (no `"system"`);
 *  - window dimensions: clamped; `autorun` cannot be set (field is dropped).
 */
export function validateExternalManifest(input: unknown): ExternalManifestValidation {
  if (!isRecord(input)) {
    return { ok: false, error: "manifest must be a JSON object" };
  }

  if (
    !isNonEmptyString(input.id) ||
    input.id.length > MAX_ID_LENGTH ||
    !ID_PATTERN.test(input.id)
  ) {
    return { ok: false, error: "id must be lowercase kebab-case (a-z, 0-9, -)" };
  }
  if (input.id.startsWith("_") || BUILTIN_APP_IDS.has(input.id)) {
    return { ok: false, error: `id "${input.id}" is reserved` };
  }

  if (!isNonEmptyString(input.name) || input.name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: "name must be a non-empty string" };
  }

  if (
    !isNonEmptyString(input.version) ||
    input.version.length > MAX_VERSION_LENGTH ||
    !VERSION_PATTERN.test(input.version)
  ) {
    return { ok: false, error: "version must be a semver string (e.g. 1.0.0)" };
  }

  if (
    typeof input.category !== "string" ||
    !EXTERNAL_APP_CATEGORIES.includes(input.category as ExternalAppCategory)
  ) {
    return { ok: false, error: `category must be one of: ${EXTERNAL_APP_CATEGORIES.join(", ")}` };
  }

  if (
    !isNonEmptyString(input.entry) ||
    input.entry.length > MAX_ENTRY_LENGTH ||
    !isHttpsUrl(input.entry)
  ) {
    return { ok: false, error: "entry must be an absolute https URL" };
  }

  const icon = validateIcon(input.icon);
  if (!icon.ok) {
    return { ok: false, error: icon.error };
  }

  const permissions = validatePermissions(input.permissions);
  if (!permissions.ok) {
    return { ok: false, error: permissions.error };
  }

  let description: string | undefined;
  if (input.description !== undefined) {
    if (
      typeof input.description !== "string" ||
      input.description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return { ok: false, error: "description must be a string" };
    }
    if (input.description.trim().length > 0) {
      description = input.description;
    }
  }

  const manifest: ExternalAppManifest = {
    id: input.id,
    name: input.name,
    version: input.version,
    category: input.category as ExternalAppCategory,
    entry: input.entry,
    icon: icon.icon,
  };

  if (description !== undefined) {
    manifest.description = description;
  }
  if (permissions.permissions !== undefined) {
    manifest.permissions = permissions.permissions;
  }
  const defaultWindow = cleanWindowDefaults(input.defaultWindow);
  if (defaultWindow !== undefined) {
    manifest.defaultWindow = defaultWindow;
  }
  const chrome = cleanChromeManifest(input.chrome);
  if (chrome !== undefined) {
    manifest.chrome = chrome;
  }
  if (typeof input.singleton === "boolean") {
    manifest.singleton = input.singleton;
  }
  const keywords = cleanKeywords(input.keywords);
  if (keywords !== undefined) {
    manifest.keywords = keywords;
  }

  return { ok: true, manifest };
}
