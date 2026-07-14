import aboutIcon from "~/assets/settings-menu-icons/about.png";
import accountIcon from "~/assets/settings-menu-icons/account.png";
import appearanceIcon from "~/assets/settings-menu-icons/appearance.png";
import backgroundIcon from "~/assets/settings-menu-icons/background.png";
import comfortIcon from "~/assets/settings-menu-icons/comfort.png";
import dockIcon from "~/assets/settings-menu-icons/dock.png";
import languageIcon from "~/assets/settings-menu-icons/language.png";
import privacyIcon from "~/assets/settings-menu-icons/privacy.png";
import type { SettingsSectionId } from "~/types/settings";

import { createImageIcon } from "./createIcon";

export const SETTINGS_MENU_ICON_ASSETS = {
  appearance: appearanceIcon,
  language: languageIcon,
  background: backgroundIcon,
  comfort: comfortIcon,
  dock: dockIcon,
  account: accountIcon,
  privacy: privacyIcon,
  about: aboutIcon,
} as const satisfies Record<SettingsSectionId, string>;

export const SettingsAppearanceIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.appearance,
  "GeneratedSettingsAppearanceIcon",
);
export const SettingsLanguageIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.language,
  "GeneratedSettingsLanguageIcon",
);
export const SettingsBackgroundIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.background,
  "GeneratedSettingsBackgroundIcon",
);
export const SettingsComfortIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.comfort,
  "GeneratedSettingsComfortIcon",
);
export const SettingsDockIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.dock,
  "GeneratedSettingsDockIcon",
);
export const SettingsAccountIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.account,
  "GeneratedSettingsAccountIcon",
);
export const SettingsPrivacyIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.privacy,
  "GeneratedSettingsPrivacyIcon",
);
export const SettingsAboutDeviceIcon = createImageIcon(
  SETTINGS_MENU_ICON_ASSETS.about,
  "GeneratedSettingsAboutDeviceIcon",
);
