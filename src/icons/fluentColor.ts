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
export const SlidesAppIcon = createFluentIcon("document-32", "FluentSlidesAppIcon");
export const TerminalAppIcon = createFluentIcon("code-block-32", "FluentTerminalAppIcon");
export const SettingsAppIcon = createFluentIcon("settings-32", "FluentSettingsAppIcon");
export const TemplateAppIcon = createFluentIcon("apps-32", "FluentTemplateAppIcon");
export const AppStoreAppIcon = createFluentIcon("apps-list-detail-24", "FluentAppStoreAppIcon");
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
  SlidesAppIcon,
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
  SettingsBackgroundIcon,
  SettingsDockIcon,
  SettingsWidgetsIcon,
  SettingsComfortIcon,
  SettingsAccountIcon,
  SettingsPrivacyIcon,
  SettingsAboutDeviceIcon,
} satisfies Record<string, Component>;
