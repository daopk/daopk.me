/**
 * Validate + normalize the untrusted-shaped first-party catalog document into
 * the strict in-shell `FirstPartyCatalog` shape. Every field is defensively
 * coerced; a single bad field drops the whole entry so a malformed publish can
 * never widen an app's declared capabilities.
 */

import { debugWarn } from "~/core/debug";

import { coerceFirstPartyPreviewMatchRule } from "./previewMatchers";
import { isFirstPartyAppId } from "./registry";
import { isTrustedEntryUrl, isValidIconRef } from "./trustedUrls";
import type {
  FirstPartyCatalog,
  FirstPartyCatalogAppManifest,
  FirstPartyCatalogDesktopContextMenuDescriptor,
  FirstPartyCatalogDesktopRendererDescriptor,
  FirstPartyCatalogEntry,
  FirstPartyCatalogPreviewDescriptor,
  FirstPartyCatalogWidgetDescriptor,
} from "./types";

import type { AppPermission, WindowDefaults } from "~/types/app";
import type { AppPreviewSurface } from "~/types/preview";
import type { DesktopContextMenuSurface, DesktopRendererSurface } from "~/types/desktop";
import type { ShellId } from "~/types/shell";
import type { WidgetDefaultPlacement, WidgetSize, WidgetSurface } from "~/types/widget";

const APP_CATEGORIES = new Set(["system", "productivity", "media", "dev", "other"]);
const APP_PERMISSIONS = new Set<AppPermission>([
  "vfs.read",
  "vfs.write",
  "storage.write",
  "shortcut.global",
  "notifications.post",
  "network.fetch",
]);
const SHELL_IDS = new Set<ShellId>(["desktop", "mobile"]);
const WIDGET_SURFACES = new Set<WidgetSurface>([
  "desktop:menubar",
  "desktop:wallpaper",
  "mobile:widgets",
  "any",
]);
const WIDGET_SIZES = new Set<WidgetSize>(["sm", "md", "lg"]);
const PREVIEW_SURFACES = new Set<AppPreviewSurface>([
  "blog.embed",
  "finder.panel",
  "movies.trailer",
]);
const DESKTOP_CONTEXT_MENU_SURFACES = new Set<DesktopContextMenuSurface>(["desktop:background"]);
const DESKTOP_RENDERER_SURFACES = new Set<DesktopRendererSurface>(["desktop:wallpaper"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceBuild(value: unknown): number | null {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function coerceStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      return null;
    }
    out.push(entry);
  }
  return out;
}

function coerceEnumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): readonly T[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: T[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry as T)) {
      return null;
    }
    out.push(entry as T);
  }
  return out;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
}

function coerceWindowDefaults(value: unknown): WindowDefaults | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }

  const width = optionalNumber(value.width);
  const height = optionalNumber(value.height);
  const minWidth = optionalNumber(value.minWidth);
  const minHeight = optionalNumber(value.minHeight);
  const maximized = optionalBoolean(value.maximized);
  const centered = optionalBoolean(value.centered);
  if (
    width === null ||
    height === null ||
    minWidth === null ||
    minHeight === null ||
    maximized === null ||
    centered === null
  ) {
    return null;
  }

  return {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(minWidth === undefined ? {} : { minWidth }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(maximized === undefined ? {} : { maximized }),
    ...(centered === undefined ? {} : { centered }),
  };
}

function coerceChrome(value: unknown): FirstPartyCatalogAppManifest["chrome"] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (value.mobile === undefined) {
    return {};
  }
  if (!isRecord(value.mobile)) {
    return null;
  }
  const titlebar = value.mobile.titlebar;
  const edgeSwipe = value.mobile.edgeSwipe;
  if (titlebar !== undefined && titlebar !== "visible" && titlebar !== "hidden") {
    return null;
  }
  if (edgeSwipe !== undefined && edgeSwipe !== "enabled" && edgeSwipe !== "disabled") {
    return null;
  }
  return {
    mobile: {
      ...(titlebar === undefined ? {} : { titlebar }),
      ...(edgeSwipe === undefined ? {} : { edgeSwipe }),
    },
  };
}

function coerceSettings(
  value: unknown,
): FirstPartyCatalogAppManifest["settings"] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }
  const keywords = value.keywords === undefined ? undefined : coerceStringArray(value.keywords);
  if (keywords === null) {
    return null;
  }
  return keywords === undefined ? {} : { keywords };
}

function coerceDefaultPlacement(value: unknown): WidgetDefaultPlacement | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }

  if (value.anchor === "top-right") {
    const insetX = optionalNumber(value.insetX);
    const insetY = optionalNumber(value.insetY);
    if (insetX === null || insetY === null) {
      return null;
    }
    return {
      anchor: "top-right",
      ...(insetX === undefined ? {} : { insetX }),
      ...(insetY === undefined ? {} : { insetY }),
    };
  }

  const gridX = optionalNumber(value.gridX);
  const gridY = optionalNumber(value.gridY);
  if (gridX === null || gridY === null || gridX === undefined || gridY === undefined) {
    return null;
  }
  return { gridX, gridY };
}

function coerceWidget(input: unknown): FirstPartyCatalogWidgetDescriptor | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, title, description, icon, surface, size, exportName } = input;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof title !== "string" ||
    title.length === 0 ||
    typeof surface !== "string" ||
    !WIDGET_SURFACES.has(surface as WidgetSurface) ||
    typeof size !== "string" ||
    !WIDGET_SIZES.has(size as WidgetSize) ||
    typeof exportName !== "string" ||
    exportName.length === 0
  ) {
    return null;
  }
  if (description !== undefined && typeof description !== "string") {
    return null;
  }
  if (icon !== undefined && !isValidIconRef(icon)) {
    return null;
  }

  const defaultVisible = optionalBoolean(input.defaultVisible);
  const priority = optionalNumber(input.priority);
  const defaultPlacement = coerceDefaultPlacement(input.defaultPlacement);
  if (defaultVisible === null || priority === null || defaultPlacement === null) {
    return null;
  }

  return {
    id,
    title,
    ...(description === undefined ? {} : { description }),
    ...(icon === undefined ? {} : { icon: icon as FirstPartyCatalogWidgetDescriptor["icon"] }),
    surface: surface as WidgetSurface,
    size: size as WidgetSize,
    ...(defaultVisible === undefined ? {} : { defaultVisible }),
    ...(priority === undefined ? {} : { priority }),
    ...(defaultPlacement === undefined ? {} : { defaultPlacement }),
    exportName,
  };
}

function coercePreview(input: unknown): FirstPartyCatalogPreviewDescriptor | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, title, surfaces, exportName, match } = input;
  const coercedSurfaces = coerceEnumArray(surfaces, PREVIEW_SURFACES);
  const matchRule = coerceFirstPartyPreviewMatchRule(match);
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    (title !== undefined && typeof title !== "string") ||
    coercedSurfaces === null ||
    coercedSurfaces.length === 0 ||
    typeof exportName !== "string" ||
    exportName.length === 0 ||
    matchRule === null
  ) {
    return null;
  }

  const priority = optionalNumber(input.priority);
  if (priority === null) {
    return null;
  }

  return {
    id,
    ...(title === undefined ? {} : { title }),
    surfaces: coercedSurfaces,
    ...(priority === undefined ? {} : { priority }),
    exportName,
    match: matchRule,
  };
}

function coerceDesktopContextMenuItem(
  input: unknown,
): FirstPartyCatalogDesktopContextMenuDescriptor | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, label, surface, group, exportName } = input;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof label !== "string" ||
    label.length === 0 ||
    typeof surface !== "string" ||
    !DESKTOP_CONTEXT_MENU_SURFACES.has(surface as DesktopContextMenuSurface) ||
    (group !== undefined && (typeof group !== "string" || group.length === 0)) ||
    typeof exportName !== "string" ||
    exportName.length === 0
  ) {
    return null;
  }

  const order = optionalNumber(input.order);
  if (order === null) {
    return null;
  }

  return {
    id,
    label,
    surface: surface as DesktopContextMenuSurface,
    ...(group === undefined ? {} : { group }),
    ...(order === undefined ? {} : { order }),
    exportName,
  };
}

function coerceDesktopRenderer(input: unknown): FirstPartyCatalogDesktopRendererDescriptor | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, surface, exportName } = input;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof surface !== "string" ||
    !DESKTOP_RENDERER_SURFACES.has(surface as DesktopRendererSurface) ||
    typeof exportName !== "string" ||
    exportName.length === 0
  ) {
    return null;
  }

  const order = optionalNumber(input.order);
  if (order === null) {
    return null;
  }

  return {
    id,
    surface: surface as DesktopRendererSurface,
    ...(order === undefined ? {} : { order }),
    exportName,
  };
}

function coerceDesktop(value: unknown): FirstPartyCatalogAppManifest["desktop"] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }

  const contextMenu =
    value.contextMenu === undefined
      ? undefined
      : Array.isArray(value.contextMenu)
        ? value.contextMenu.map(coerceDesktopContextMenuItem)
        : null;
  const renderers =
    value.renderers === undefined
      ? undefined
      : Array.isArray(value.renderers)
        ? value.renderers.map(coerceDesktopRenderer)
        : null;

  if (
    contextMenu === null ||
    renderers === null ||
    contextMenu?.some((item) => item === null) ||
    renderers?.some((renderer) => renderer === null)
  ) {
    return null;
  }

  return {
    ...(contextMenu === undefined
      ? {}
      : { contextMenu: contextMenu as FirstPartyCatalogDesktopContextMenuDescriptor[] }),
    ...(renderers === undefined
      ? {}
      : { renderers: renderers as FirstPartyCatalogDesktopRendererDescriptor[] }),
  };
}

function coerceManifest(input: unknown, entryId: string): FirstPartyCatalogAppManifest | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, name, icon, category } = input;
  if (
    id !== entryId ||
    typeof id !== "string" ||
    !isFirstPartyAppId(id) ||
    typeof name !== "string" ||
    name.length === 0 ||
    !isValidIconRef(icon) ||
    typeof category !== "string" ||
    !APP_CATEGORIES.has(category)
  ) {
    return null;
  }

  const singleton = optionalBoolean(input.singleton);
  const hidden = optionalBoolean(input.hidden);
  const autorun = optionalBoolean(input.autorun);
  const permissions =
    input.permissions === undefined
      ? undefined
      : coerceEnumArray(input.permissions, APP_PERMISSIONS);
  const supportedShells =
    input.supportedShells === undefined
      ? undefined
      : coerceEnumArray(input.supportedShells, SHELL_IDS);
  const defaultWindow = coerceWindowDefaults(input.defaultWindow);
  const chrome = coerceChrome(input.chrome);
  const keywords = input.keywords === undefined ? undefined : coerceStringArray(input.keywords);
  const settings = coerceSettings(input.settings);
  const widgets =
    input.widgets === undefined
      ? undefined
      : Array.isArray(input.widgets)
        ? input.widgets.map(coerceWidget)
        : null;
  const previews =
    input.previews === undefined
      ? undefined
      : Array.isArray(input.previews)
        ? input.previews.map(coercePreview)
        : null;
  const desktop = coerceDesktop(input.desktop);

  if (
    singleton === null ||
    hidden === null ||
    autorun === null ||
    permissions === null ||
    supportedShells === null ||
    defaultWindow === null ||
    chrome === null ||
    keywords === null ||
    settings === null ||
    widgets === null ||
    previews === null ||
    desktop === null ||
    widgets?.some((widget) => widget === null) ||
    previews?.some((preview) => preview === null)
  ) {
    return null;
  }

  return {
    id,
    name,
    icon,
    category: category as FirstPartyCatalogAppManifest["category"],
    ...(singleton === undefined ? {} : { singleton }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(autorun === undefined ? {} : { autorun }),
    ...(supportedShells === undefined ? {} : { supportedShells }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(defaultWindow === undefined ? {} : { defaultWindow }),
    ...(chrome === undefined ? {} : { chrome }),
    ...(keywords === undefined ? {} : { keywords }),
    ...(settings === undefined ? {} : { settings }),
    ...(widgets === undefined ? {} : { widgets: widgets as FirstPartyCatalogWidgetDescriptor[] }),
    ...(previews === undefined
      ? {}
      : { previews: previews as FirstPartyCatalogPreviewDescriptor[] }),
    ...(desktop === undefined ? {} : { desktop }),
  };
}

function coerceEntry(input: unknown): FirstPartyCatalogEntry | null {
  if (!isRecord(input)) {
    return null;
  }
  const { id, version, build: rawBuild, revision, entry } = input;
  if (typeof id !== "string" || typeof version !== "string" || typeof entry !== "string") {
    return null;
  }
  if (!isFirstPartyAppId(id)) {
    debugWarn("[first-party]", `rejecting catalog entry for unknown id "${id}"`);
    return null;
  }
  const build = coerceBuild(rawBuild);
  if (build === null) {
    debugWarn("[first-party]", `rejecting catalog entry for "${id}": bad build`, rawBuild);
    return null;
  }
  if (!isTrustedEntryUrl(entry, id)) {
    debugWarn("[first-party]", `rejecting catalog entry for "${id}": bad entry URL`, entry);
    return null;
  }
  let manifest: FirstPartyCatalogAppManifest | undefined;
  if (input.manifest !== undefined) {
    const coercedManifest = coerceManifest(input.manifest, id);
    if (coercedManifest === null) {
      debugWarn("[first-party]", `rejecting catalog entry for "${id}": bad manifest`);
      return null;
    }
    manifest = coercedManifest;
  }
  return {
    id,
    version,
    build,
    ...(typeof revision === "string" && revision.length > 0 ? { revision } : {}),
    entry,
    ...(manifest === undefined ? {} : { manifest }),
  };
}

/** Validate + normalize an untrusted-shaped catalog document; drop bad entries. */
export function coerceFirstPartyCatalog(input: unknown): FirstPartyCatalog {
  if (!isRecord(input) || !Array.isArray(input.apps)) {
    return { apps: [] };
  }
  const seen = new Set<string>();
  const apps: FirstPartyCatalogEntry[] = [];
  for (const raw of input.apps) {
    const entry = coerceEntry(raw);
    if (entry === null || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    apps.push(entry);
  }
  return { apps };
}
