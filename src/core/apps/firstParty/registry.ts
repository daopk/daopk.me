import {
  BabyTouchAppIcon,
  BlogAppIcon,
  BrowserAppIcon,
  CalendarAppIcon,
  ClockAppIcon,
  EditorAppIcon,
  NotesAppIcon,
  PdfViewerAppIcon,
  PhotosAppIcon,
  SlidesAppIcon,
} from "~/icons/fluentColor";

import type { FirstPartyAppDescriptor } from "./types";

/**
 * The shell's roster of first-party apps that are built + published
 * independently (out of the shell bundle) and loaded at runtime from the
 * catalog. This is the trusted lane: entries here may use reserved built-in
 * ids, the `system` category, `autorun`, and widgets — none of which untrusted
 * external apps may declare.
 *
 * Rollout (staged on purpose — externalize in waves, not all at once):
 *  - Wave 1 (done): `notes` — the pilot that proved the runtime contract, lib
 *    build, catalog, loader, R2/Worker path, per-app CI, and offline caching.
 *  - Wave 2 (incremental): the satellite apps (`blog`, `calendar`, `clock`,
 *    `editor`, `photos`, `pdf-viewer`, `slides`, `browser`). Each migrates the
 *    same mechanical way — move `src/apps/<id>` to an `apps/<id>` package
 *    (vite lib build, `@daopk/*` external), add a descriptor below, drop its
 *    `kernel.apps.register(...)` from `src/main.ts`, and let CI publish it.
 *  - System apps (`settings`, `finder`, `trash`, `app-store`, `terminal`):
 *    intentionally kept IN the shell. They are the system (deepest coupling +
 *    permissions, lowest payoff), so decoupling them buys little and risks the
 *    boot/identity path. Revisit only with a concrete reason.
 *
 * Migrating one app = add a descriptor here + an `apps/<id>` package + (CI
 * publishes) a catalog entry; nothing else in the shell needs to change.
 */
export const FIRST_PARTY_APPS: readonly FirstPartyAppDescriptor[] = [
  {
    id: "baby-touch",
    name: "Baby Touch",
    version: "1.0.0",
    icon: BabyTouchAppIcon,
    category: "media",
    singleton: true,
    permissions: ["storage.write"],
    defaultWindow: { width: 760, height: 560, centered: true },
    chrome: { mobile: { titlebar: "hidden" } },
    keywords: ["baby", "touch", "sensory", "animals", "toy", "cause effect"],
  },
  {
    id: "notes",
    name: "Notes",
    version: "1.0.0",
    icon: NotesAppIcon,
    category: "productivity",
    singleton: true,
    permissions: ["vfs.read", "vfs.write"],
    defaultWindow: { width: 920, height: 620, centered: true },
    keywords: ["notes", "markdown", "writing", "drafts", "journal", "vfs"],
  },
  {
    id: "browser",
    name: "Browser",
    version: "1.0.0",
    icon: BrowserAppIcon,
    category: "productivity",
    singleton: false,
    defaultWindow: { width: 980, height: 640, centered: true },
    keywords: ["web", "internet", "browser", "url", "site", "iframe"],
  },
  {
    id: "editor",
    name: "Editor",
    version: "1.0.0",
    icon: EditorAppIcon,
    category: "productivity",
    singleton: false,
    permissions: ["vfs.read", "vfs.write"],
    defaultWindow: { width: 900, height: 620, centered: true },
    keywords: ["editor", "text", "markdown", "write", "notes", "vfs"],
  },
  {
    id: "pdf-viewer",
    name: "PDF Viewer",
    version: "1.0.0",
    icon: PdfViewerAppIcon,
    category: "productivity",
    singleton: false,
    permissions: ["vfs.read"],
    defaultWindow: { width: 1040, height: 720, centered: true },
    keywords: ["pdf", "document", "reader", "viewer", "vfs"],
  },
  {
    id: "photos",
    name: "Photos",
    version: "1.0.0",
    icon: PhotosAppIcon,
    category: "media",
    singleton: true,
    permissions: ["network.fetch"],
    defaultWindow: { width: 960, height: 680, centered: true },
    keywords: ["photos", "images", "gallery", "pictures", "media", "r2"],
  },
  {
    id: "blog",
    name: "Blog",
    version: "1.0.0",
    icon: BlogAppIcon,
    category: "system",
    permissions: ["vfs.read", "vfs.write", "network.fetch"],
    defaultWindow: { width: 720, height: 520, centered: true },
    keywords: ["blog", "post", "writing", "article", "markdown"],
  },
  {
    id: "clock",
    name: "Clock",
    version: "1.0.0",
    icon: ClockAppIcon,
    category: "productivity",
    singleton: true,
    permissions: ["storage.write"],
    defaultWindow: { width: 760, height: 560, centered: true },
    keywords: ["clock", "time", "timer", "stopwatch"],
    widgets: [
      {
        id: "clock:menubar",
        title: "Clock",
        description: "Compact time in the desktop menubar.",
        surface: "desktop:menubar",
        size: "sm",
        defaultVisible: true,
        exportName: "MenubarClockWidget",
      },
      {
        id: "clock:desktop-big",
        title: "Clock",
        description: "Large desktop clock with the current date.",
        surface: "desktop:wallpaper",
        size: "md",
        defaultVisible: true,
        defaultPlacement: { anchor: "top-right", insetX: 1, insetY: 1 },
        exportName: "DesktopBigClockWidget",
      },
      {
        id: "clock:mobile-big",
        title: "Clock",
        description: "Large clock card for the mobile widgets page.",
        surface: "mobile:widgets",
        size: "lg",
        defaultVisible: true,
        exportName: "MobileBigClockWidget",
      },
    ],
  },
  {
    id: "calendar",
    name: "Calendar",
    version: "1.0.0",
    icon: CalendarAppIcon,
    category: "productivity",
    singleton: true,
    permissions: ["vfs.read", "vfs.write", "storage.write"],
    defaultWindow: { width: 980, height: 680, centered: true },
    keywords: ["calendar", "events", "schedule", "agenda", "planner", "settings", "preferences"],
    settings: {
      keywords: ["calendar settings", "week start", "lunar calendar", "event defaults"],
    },
    widgets: [
      {
        id: "calendar:lunar-date-mobile",
        title: "Lunar Date",
        description: "Vietnamese lunar date on the mobile widgets page.",
        surface: "mobile:widgets",
        size: "md",
        exportName: "LunarDateWidget",
      },
      {
        id: "calendar:lunar-date-desktop",
        title: "Lunar Date",
        description: "Vietnamese lunar date on the desktop.",
        surface: "desktop:wallpaper",
        size: "md",
        priority: 80,
        exportName: "LunarDateWidget",
      },
    ],
  },
  {
    id: "slides",
    name: "Slides",
    version: "1.0.0",
    icon: SlidesAppIcon,
    category: "productivity",
    singleton: true,
    // Desktop-only: the Slidev preview runs in a WebContainer, which needs a
    // cross-origin-isolated context (SharedArrayBuffer) — unavailable in the
    // mobile shell's embedded surfaces.
    supportedShells: ["desktop"],
    permissions: ["vfs.read", "vfs.write", "network.fetch"],
    defaultWindow: { width: 1120, height: 720, centered: true },
    keywords: ["slides", "slidev", "deck", "presentation", "markdown", "vfs"],
  },
];

/** Reserved ids owned by the first-party roster (kept out of external apps). */
export const FIRST_PARTY_APP_IDS: ReadonlySet<string> = new Set(
  FIRST_PARTY_APPS.map((app) => app.id),
);
