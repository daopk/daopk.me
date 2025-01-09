import type { ResolvedTheme } from "~/types/theme";

import { getSystemPreference } from "~/core/theme/systemPreference";

import { SETTINGS_KV_PRIMARY_KEY } from "~/core/storage/constants";

/** Physical `KVStore('settings').scopedKey(primary)` — MUST stay aligned with FOUC snippet. */

export const SETTINGS_PHYSICAL_STORAGE_KEY = `settings:${SETTINGS_KV_PRIMARY_KEY}`;

/** Best-effort parse from raw localStorage snapshot (sync, no KVStore instantiation). */

export function readResolvedThemePreflight(raw: string | null): ResolvedTheme {
  let pref: SettingsThemePref | "invalid" = "system";

  if (raw) {
    try {
      const envelope: unknown = JSON.parse(raw);
      pref = extractThemePref(envelope);
    } catch {
      pref = "system";
    }
  }

  if (pref === "light" || pref === "dark") {
    return pref;
  }

  return getSystemPreference();
}

type SettingsThemePref = "light" | "dark" | "system";

function extractThemePref(envelope: unknown): SettingsThemePref | "invalid" {
  if (typeof envelope !== "object" || envelope === null) {
    return "invalid";
  }

  const candidate = envelope as { data?: { theme?: unknown } };
  const t = candidate.data?.theme;

  if (typeof t !== "string") {
    return "invalid";
  }

  if (t === "light" || t === "dark" || t === "system") {
    return t;
  }

  return "invalid";
}
