export const FLUENT_COLOR_ICON_NAMES = [
  "apps-24",
  "apps-32",
  "apps-list-24",
  "apps-list-detail-24",
  "arrow-sync-24",
  "calendar-32",
  "clock-32",
  "cloud-24",
  "code-block-32",
  "document-24",
  "document-32",
  "document-folder-24",
  "document-text-24",
  "edit-32",
  "globe-24",
  "image-24",
  "laptop-24",
  "notebook-32",
  "paint-brush-24",
  "person-starburst-32",
  "settings-32",
  "shield-24",
  "text-edit-style-24",
] as const;

export type FluentColorIconName = (typeof FLUENT_COLOR_ICON_NAMES)[number];

export { default as CloudFolderIcon } from "~icons/fluent-color/cloud-24";
export { default as FinderAppIcon } from "~icons/fluent-color/document-folder-24";
export { default as TerminalAppIcon } from "~icons/fluent-color/code-block-32";
export { default as SettingsAppIcon } from "~icons/fluent-color/settings-32";
export { default as TemplateAppIcon } from "~icons/fluent-color/apps-32";
export { default as AppStoreAppIcon } from "~icons/fluent-color/apps-list-detail-24";
/** Neutral stand-in when a first-party app's own icon asset cannot be resolved. */
export { default as FallbackAppIcon } from "~icons/fluent-color/apps-32";
export { default as TrashAppIcon } from "~icons/daopk/trash-app";

export { default as FinderFolderIcon } from "~icons/fluent-color/document-folder-24";
export { default as FinderFileIcon } from "~icons/fluent-color/document-24";
export { default as FinderTextFileIcon } from "~icons/fluent-color/document-text-24";
export { default as FinderImageFileIcon } from "~icons/fluent-color/image-24";
export { default as FinderPdfFileIcon } from "~icons/fluent-color/document-24";

export { default as SettingsAppearanceIcon } from "~icons/fluent-color/paint-brush-24";
export { default as SettingsLanguageIcon } from "~icons/fluent-color/globe-24";
export { default as SettingsBackgroundIcon } from "~icons/fluent-color/image-24";
export { default as SettingsDockIcon } from "~icons/fluent-color/apps-list-24";
export { default as SettingsWidgetsIcon } from "~icons/fluent-color/apps-24";
export { default as SettingsComfortIcon } from "~icons/fluent-color/apps-list-detail-24";
export { default as SettingsAccountIcon } from "~icons/fluent-color/person-starburst-32";
export { default as SettingsPrivacyIcon } from "~icons/fluent-color/shield-24";
export { default as SettingsAboutDeviceIcon } from "~icons/fluent-color/laptop-24";
