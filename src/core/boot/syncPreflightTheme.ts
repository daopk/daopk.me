import {
  readResolvedThemePreflight,
  SETTINGS_PHYSICAL_STORAGE_KEY,
} from "~/core/storage/preflight";

if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
  const resolved = readResolvedThemePreflight(localStorage.getItem(SETTINGS_PHYSICAL_STORAGE_KEY));

  document.documentElement.dataset.theme = resolved;
}
