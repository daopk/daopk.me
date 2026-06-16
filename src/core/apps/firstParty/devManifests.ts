import babyTouchManifest from "../../../../apps/baby-touch/app.manifest.json";
import babyTouchPackage from "../../../../apps/baby-touch/package.json";
import blogManifest from "../../../../apps/blog/app.manifest.json";
import blogPackage from "../../../../apps/blog/package.json";
import browserManifest from "../../../../apps/browser/app.manifest.json";
import browserPackage from "../../../../apps/browser/package.json";
import calendarManifest from "../../../../apps/calendar/app.manifest.json";
import calendarPackage from "../../../../apps/calendar/package.json";
import clockManifest from "../../../../apps/clock/app.manifest.json";
import clockPackage from "../../../../apps/clock/package.json";
import editorManifest from "../../../../apps/editor/app.manifest.json";
import editorPackage from "../../../../apps/editor/package.json";
import moviesManifest from "../../../../apps/movies/app.manifest.json";
import moviesPackage from "../../../../apps/movies/package.json";
import notesManifest from "../../../../apps/notes/app.manifest.json";
import notesPackage from "../../../../apps/notes/package.json";
import pdfViewerManifest from "../../../../apps/pdf-viewer/app.manifest.json";
import pdfViewerPackage from "../../../../apps/pdf-viewer/package.json";
import photosManifest from "../../../../apps/photos/app.manifest.json";
import photosPackage from "../../../../apps/photos/package.json";
import youtubePlayerManifest from "../../../../apps/youtube-player/app.manifest.json";
import youtubePlayerPackage from "../../../../apps/youtube-player/package.json";

import type { FirstPartyCatalogEntry } from "./types";

function devEntry(id: string, version: string, manifest: unknown): FirstPartyCatalogEntry {
  return {
    id,
    version,
    build: 0,
    entry: `/apps/${id}/${version}+0/${id}.js`,
    manifest: manifest as FirstPartyCatalogEntry["manifest"],
  };
}

/**
 * Dev-only catalog data. The app packages own the manifest JSON; the host
 * imports it only in dev so HMR can register apps without fetching R2.
 */
// fallow-ignore-next-line unused-export
export const FIRST_PARTY_DEV_CATALOG_ENTRIES: readonly FirstPartyCatalogEntry[] = [
  devEntry("baby-touch", babyTouchPackage.version, babyTouchManifest),
  devEntry("blog", blogPackage.version, blogManifest),
  devEntry("browser", browserPackage.version, browserManifest),
  devEntry("calendar", calendarPackage.version, calendarManifest),
  devEntry("clock", clockPackage.version, clockManifest),
  devEntry("editor", editorPackage.version, editorManifest),
  devEntry("movies", moviesPackage.version, moviesManifest),
  devEntry("notes", notesPackage.version, notesManifest),
  devEntry("pdf-viewer", pdfViewerPackage.version, pdfViewerManifest),
  devEntry("photos", photosPackage.version, photosManifest),
  devEntry("youtube-player", youtubePlayerPackage.version, youtubePlayerManifest),
];
