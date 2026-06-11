import type { Component } from "vue";

import { BabyTouchAppIcon } from "./babyTouchAppIcon";
import { createPaletteIcon } from "./createIcon";
import {
  fluentColorIconData,
  fluentColorIconNames,
  type FluentColorIconName,
} from "./generated/fluentColor";

export type { FluentColorIconName };
export { BabyTouchAppIcon };

function createFluentIcon(name: FluentColorIconName, componentName: string): Component {
  return createPaletteIcon(fluentColorIconData[name], componentName);
}

export const FLUENT_COLOR_ICON_NAMES = fluentColorIconNames;

export const BlogAppIcon = createFluentIcon("document-text-24", "FluentBlogAppIcon");
export const BrowserAppIcon = createFluentIcon("globe-24", "FluentBrowserAppIcon");
export const CalendarAppIcon = createFluentIcon("calendar-32", "FluentCalendarAppIcon");
export const ClockAppIcon = createFluentIcon("clock-32", "FluentClockAppIcon");
export const CloudFolderIcon = createFluentIcon("cloud-24", "FluentCloudFolderIcon");
export const FinderAppIcon = createFluentIcon("document-folder-24", "FluentFinderAppIcon");
export const EditorAppIcon = createFluentIcon("edit-32", "FluentEditorAppIcon");
export const HtmlInCanvasAppIcon = createFluentIcon("code-block-32", "FluentHtmlInCanvasAppIcon");
export const NotesAppIcon = createFluentIcon("notebook-32", "FluentNotesAppIcon");
export const PhotosAppIcon = createFluentIcon("image-24", "FluentPhotosAppIcon");
export const PdfViewerAppIcon = createFluentIcon("document-32", "FluentPdfViewerAppIcon");
export const TerminalAppIcon = createFluentIcon("code-block-32", "FluentTerminalAppIcon");
export const SettingsAppIcon = createFluentIcon("settings-32", "FluentSettingsAppIcon");
export const TemplateAppIcon = createFluentIcon("apps-32", "FluentTemplateAppIcon");
export const AppStoreAppIcon = createFluentIcon("apps-list-detail-24", "FluentAppStoreAppIcon");
export const MoviesAppIcon = createPaletteIcon(
  {
    width: 32,
    height: 32,
    body: '<g fill="none"><rect width="26" height="22" x="3" y="6" fill="url(#SVGMoviesBody)" rx="5"/><path fill="url(#SVGMoviesTop)" d="M7 3.5h18A3.5 3.5 0 0 1 28.5 7v3H3.5V7A3.5 3.5 0 0 1 7 3.5"/><path fill="url(#SVGMoviesShine)" fill-opacity=".72" d="M4 11h24v2.4c-2.9 1.18-6.93 1.85-12 1.85S6.9 14.58 4 13.4z"/><path fill="url(#SVGMoviesPlay)" d="M13.25 15.22v7.56a1 1 0 0 0 1.53.85l6.05-3.78a1 1 0 0 0 0-1.7l-6.05-3.78a1 1 0 0 0-1.53.85"/><path fill="url(#SVGMoviesPerfs)" d="M7 6h2.2v4H7zm5.3 0h2.2v4h-2.2zm5.3 0h2.2v4h-2.2zM23 6h2v4h-2z"/><defs><linearGradient id="SVGMoviesBody" x1="5.5" x2="25.5" y1="8" y2="29" gradientUnits="userSpaceOnUse"><stop stop-color="#343941"/><stop offset="1" stop-color="#11151d"/></linearGradient><linearGradient id="SVGMoviesTop" x1="4.7" x2="26.7" y1="4" y2="12.8" gradientUnits="userSpaceOnUse"><stop stop-color="#36dff1"/><stop offset=".55" stop-color="#2764e7"/><stop offset="1" stop-color="#9c6cfe"/></linearGradient><linearGradient id="SVGMoviesShine" x1="7.5" x2="24.5" y1="9.2" y2="18" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="SVGMoviesPlay" x1="13.25" x2="20.6" y1="14.2" y2="23.9" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#d8f7ff"/></linearGradient><linearGradient id="SVGMoviesPerfs" x1="7" x2="23" y1="5.5" y2="10.5" gradientUnits="userSpaceOnUse"><stop stop-color="#fdfdfd"/><stop offset="1" stop-color="#eef7ff"/></linearGradient></defs></g>',
  },
  "FluentMoviesAppIcon",
);
export const YoutubePlayerAppIcon = createPaletteIcon(
  {
    width: 32,
    height: 32,
    body: '<g fill="none"><rect width="26" height="18" x="3" y="7" fill="url(#SVGYoutubePlayerBody)" rx="5"/><path fill="url(#SVGYoutubePlayerSheen)" fill-opacity=".65" d="M3 12a5 5 0 0 1 5-5h16a5 5 0 0 1 5 5v1.4c-3.38 1.2-7.76 1.9-13 1.9s-9.62-.7-13-1.9z"/><path fill="url(#SVGYoutubePlayerTriangle)" d="M13 12.25v7.5a.75.75 0 0 0 1.14.64l6.15-3.75a.75.75 0 0 0 0-1.28l-6.15-3.75a.75.75 0 0 0-1.14.64"/><defs><linearGradient id="SVGYoutubePlayerBody" x1="5.6" x2="24.8" y1="7" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#ff5d5d"/><stop offset="1" stop-color="#d9142b"/></linearGradient><linearGradient id="SVGYoutubePlayerSheen" x1="7.2" x2="24" y1="5.8" y2="17.2" gradientUnits="userSpaceOnUse"><stop stop-color="#ffb1b1"/><stop offset="1" stop-color="#ffb1b1" stop-opacity="0"/></linearGradient><linearGradient id="SVGYoutubePlayerTriangle" x1="13" x2="19.8" y1="12" y2="20.4" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#ffe9e9"/></linearGradient></defs></g>',
  },
  "FluentYoutubePlayerAppIcon",
);
export const TrashAppIcon = createPaletteIcon(
  {
    width: 32,
    height: 32,
    body: '<g fill="none"><path fill="url(#SVGTrashAppBody)" d="M8.5 10.5h15l-1.02 15.37A3.25 3.25 0 0 1 19.24 29h-6.48a3.25 3.25 0 0 1-3.24-3.13z"/><path fill="url(#SVGTrashAppSheen)" fill-opacity=".65" d="M8.5 10.5h15l-.43 6.54c-1.98 1.18-4.41 1.83-7.07 1.83s-5.09-.65-7.07-1.83z"/><path fill="url(#SVGTrashAppLid)" d="M13.25 4A2.25 2.25 0 0 0 11 6.25v.25H8.25A2.25 2.25 0 0 0 6 8.75v.5A1.75 1.75 0 0 0 7.75 11h16.5A1.75 1.75 0 0 0 26 9.25v-.5a2.25 2.25 0 0 0-2.25-2.25H21v-.25A2.25 2.25 0 0 0 18.75 4z"/><path fill="url(#SVGTrashAppHandle)" d="M13.5 6.5v-.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v.25z"/><path fill="url(#SVGTrashAppSlots)" fill-opacity=".7" d="M13.25 14a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-1.5 0v-9.5a.75.75 0 0 1 .75-.75m5.5 0a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-1.5 0v-9.5a.75.75 0 0 1 .75-.75"/><defs><linearGradient id="SVGTrashAppBody" x1="10.17" x2="22.08" y1="11.47" y2="28.36" gradientUnits="userSpaceOnUse"><stop stop-color="#b9c0c7"/><stop offset=".54" stop-color="#889096"/><stop offset="1" stop-color="#63686e"/></linearGradient><linearGradient id="SVGTrashAppSheen" x1="11.07" x2="20.18" y1="9.88" y2="19.35" gradientUnits="userSpaceOnUse"><stop stop-color="#f4f8fb"/><stop offset="1" stop-color="#d7dee5" stop-opacity="0"/></linearGradient><linearGradient id="SVGTrashAppLid" x1="7.35" x2="24.48" y1="4.63" y2="12.94" gradientUnits="userSpaceOnUse"><stop stop-color="#dbe2e8"/><stop offset=".55" stop-color="#aab3bd"/><stop offset="1" stop-color="#7b838a"/></linearGradient><linearGradient id="SVGTrashAppHandle" x1="13.77" x2="17.84" y1="5.02" y2="8.1" gradientUnits="userSpaceOnUse"><stop stop-color="#36dff1"/><stop offset="1" stop-color="#2764e7"/></linearGradient><linearGradient id="SVGTrashAppSlots" x1="12.5" x2="19.5" y1="14" y2="25" gradientUnits="userSpaceOnUse"><stop stop-color="#55595e"/><stop offset="1" stop-color="#383b3d"/></linearGradient></defs></g>',
  },
  "FluentTrashAppIcon",
);

export const FinderFolderIcon = createFluentIcon("document-folder-24", "FluentFinderFolderIcon");
export const FinderFileIcon = createFluentIcon("document-24", "FluentFinderFileIcon");
export const FinderTextFileIcon = createFluentIcon("document-text-24", "FluentFinderTextFileIcon");
export const FinderImageFileIcon = createFluentIcon("image-24", "FluentFinderImageFileIcon");
export const FinderPdfFileIcon = createFluentIcon("document-24", "FluentFinderPdfFileIcon");

export const SettingsAppearanceIcon = createFluentIcon(
  "paint-brush-24",
  "FluentSettingsAppearanceIcon",
);
export const SettingsLanguageIcon = createFluentIcon("globe-24", "FluentSettingsLanguageIcon");
export const SettingsBackgroundIcon = createFluentIcon("image-24", "FluentSettingsBackgroundIcon");
export const SettingsDockIcon = createFluentIcon("apps-list-24", "FluentSettingsDockIcon");
export const SettingsWidgetsIcon = createFluentIcon("apps-24", "FluentSettingsWidgetsIcon");
export const SettingsComfortIcon = createFluentIcon(
  "apps-list-detail-24",
  "FluentSettingsComfortIcon",
);
export const SettingsAccountIcon = createFluentIcon(
  "person-starburst-32",
  "FluentSettingsAccountIcon",
);
export const SettingsPrivacyIcon = createFluentIcon("shield-24", "FluentSettingsPrivacyIcon");
export const SettingsAboutDeviceIcon = createFluentIcon(
  "laptop-24",
  "FluentSettingsAboutDeviceIcon",
);

export const fluentColorIconComponents = {
  BabyTouchAppIcon,
  BlogAppIcon,
  BrowserAppIcon,
  CalendarAppIcon,
  ClockAppIcon,
  CloudFolderIcon,
  FinderAppIcon,
  EditorAppIcon,
  HtmlInCanvasAppIcon,
  NotesAppIcon,
  PhotosAppIcon,
  PdfViewerAppIcon,
  MoviesAppIcon,
  YoutubePlayerAppIcon,
  TerminalAppIcon,
  SettingsAppIcon,
  TemplateAppIcon,
  AppStoreAppIcon,
  TrashAppIcon,
  FinderFolderIcon,
  FinderFileIcon,
  FinderTextFileIcon,
  FinderImageFileIcon,
  FinderPdfFileIcon,
  SettingsAppearanceIcon,
  SettingsLanguageIcon,
  SettingsBackgroundIcon,
  SettingsDockIcon,
  SettingsWidgetsIcon,
  SettingsComfortIcon,
  SettingsAccountIcon,
  SettingsPrivacyIcon,
  SettingsAboutDeviceIcon,
} satisfies Record<string, Component>;
