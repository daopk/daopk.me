import appStoreIcon from "~/assets/app-icons/app-store.png";
import finderIcon from "~/assets/app-icons/finder.png";
import settingsIcon from "~/assets/app-icons/settings.png";
import spotlightIcon from "~/assets/app-icons/spotlight.png";
import terminalIcon from "~/assets/app-icons/terminal.png";
import trashIcon from "~/assets/app-icons/trash.png";

import { createImageIcon } from "./createIcon";

export const FinderAppIcon = createImageIcon(finderIcon, "GeneratedFinderAppIcon");
export const TerminalAppIcon = createImageIcon(terminalIcon, "GeneratedTerminalAppIcon");
export const SettingsAppIcon = createImageIcon(settingsIcon, "GeneratedSettingsAppIcon");
export const AppStoreAppIcon = createImageIcon(appStoreIcon, "GeneratedAppStoreAppIcon");
export const SpotlightAppIcon = createImageIcon(spotlightIcon, "GeneratedSpotlightAppIcon");
export const TrashAppIcon = createImageIcon(trashIcon, "GeneratedTrashAppIcon");
