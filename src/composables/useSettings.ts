import { useSettingsStore } from "~/core/storage/SettingsStore";

export function useSettings(): ReturnType<typeof useSettingsStore> {
  return useSettingsStore();
}
