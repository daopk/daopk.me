import { debugWarn } from "~/core/debug";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { Kernel } from "~/types/kernel";
import type { ExternalAppManifest } from "~/types/externalApp";

import { externalToAppManifest } from "./externalAppAdapter";
import { validateExternalManifest } from "./externalManifest";
import { type InstalledAppRecord, useInstalledAppsStore } from "./InstalledAppsStore";
import { EXTERNAL_APP_ORIGIN_ALLOWLIST, isExternalOriginAllowed } from "./originAllowlist";

type InstalledAppsStore = ReturnType<typeof useInstalledAppsStore>;
type SettingsStore = ReturnType<typeof useSettingsStore>;

/** Context shown to the user before they consent to an install. */
export interface InstallConsentInfo {
  manifest: ExternalAppManifest;
  /** URL the manifest JSON was fetched from. */
  manifestUrl: string;
  /** Origin of the app's entry module (what actually runs). */
  entryOrigin: string;
  /** True when this install replaces an already-installed app with the same id. */
  isUpdate: boolean;
}

/** Resolve `true` to proceed with the install, `false` to cancel. */
export type InstallConsent = (info: InstallConsentInfo) => boolean | Promise<boolean>;

export type InstallFailureReason =
  | "invalid-url"
  | "fetch-failed"
  | "invalid-manifest"
  | "blocked-origin"
  | "id-conflict"
  | "declined";

export type InstallResult =
  | { ok: true; manifest: ExternalAppManifest; isUpdate: boolean }
  | { ok: false; reason: InstallFailureReason; error: string };

export interface InstallExternalAppDeps {
  kernel: Kernel;
  /** Install-consent gate (informational; runtime permission prompts still apply). */
  confirm: InstallConsent;
  store?: InstalledAppsStore;
  fetchImpl?: typeof fetch;
  /**
   * Origins allowed to run external apps. Empty (default) allows any HTTPS
   * origin; a non-empty list restricts the app's ENTRY origin to exact matches.
   */
  allowlist?: readonly string[];
}

export interface UninstallExternalAppDeps {
  kernel: Kernel;
  store?: InstalledAppsStore;
  settingsStore?: SettingsStore;
  /** Safety cap for awaiting process teardown before unregister. */
  killTimeoutMs?: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetch → validate → guard → consent → persist → register an external app.
 *
 * - HTTPS-only manifest URL; CORS fetch with credentials omitted.
 * - The validator enforces the security gates (reserved ids, https entry, etc.).
 * - Collision guard: refuses to shadow a built-in / first-party id, but allows
 *   re-installing (updating) an already-installed external id (upsert).
 * - Consent is informational — the user is shown what runs; capability use is
 *   still gated by the runtime permission prompts.
 */
export async function installExternalApp(
  url: string,
  deps: InstallExternalAppDeps,
): Promise<InstallResult> {
  let manifestUrl: URL;
  try {
    manifestUrl = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url", error: "Enter a valid URL." };
  }
  if (manifestUrl.protocol !== "https:") {
    return { ok: false, reason: "invalid-url", error: "The manifest URL must use https." };
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  let json: unknown;
  try {
    const response = await fetchImpl(manifestUrl.href, { credentials: "omit", mode: "cors" });
    if (!response.ok) {
      return {
        ok: false,
        reason: "fetch-failed",
        error: `Could not fetch manifest (${response.status}).`,
      };
    }
    json = await response.json();
  } catch (error) {
    return { ok: false, reason: "fetch-failed", error: describeError(error) };
  }

  const validation = validateExternalManifest(json);
  if (!validation.ok) {
    return { ok: false, reason: "invalid-manifest", error: validation.error };
  }
  const manifest = validation.manifest;

  const entryOrigin = new URL(manifest.entry).origin;
  const allowlist = deps.allowlist ?? EXTERNAL_APP_ORIGIN_ALLOWLIST;
  if (!isExternalOriginAllowed(entryOrigin, allowlist)) {
    return {
      ok: false,
      reason: "blocked-origin",
      error: `Apps from "${entryOrigin}" are not allowed on this device.`,
    };
  }

  const store = deps.store ?? useInstalledAppsStore();
  const alreadyRegistered = deps.kernel.apps.list().some((m) => m.id === manifest.id);
  const isUpdate = store.isExternalApp(manifest.id);
  if (alreadyRegistered && !isUpdate) {
    return {
      ok: false,
      reason: "id-conflict",
      error: `The id "${manifest.id}" is already used by an installed app.`,
    };
  }

  const consented = await deps.confirm({
    manifest,
    manifestUrl: manifestUrl.href,
    entryOrigin,
    isUpdate,
  });
  if (!consented) {
    return { ok: false, reason: "declined", error: "Installation cancelled." };
  }

  const record: InstalledAppRecord = { manifestUrl: manifestUrl.href, manifest };
  store.add(record);

  // Re-register so an update swaps in the new loader closure / metadata.
  if (deps.kernel.apps.list().some((m) => m.id === manifest.id)) {
    deps.kernel.apps.unregister(manifest.id);
  }
  deps.kernel.apps.register(externalToAppManifest(manifest));

  return { ok: true, manifest, isUpdate };
}

/**
 * Kill every running process for `manifestId` and await teardown, so widgets and
 * app state are gone before the manifest is unregistered. Resolves early once
 * all targeted handles emit `app.killed`; a watchdog guarantees it never hangs.
 */
async function killProcessesForManifest(
  kernel: Kernel,
  manifestId: string,
  timeoutMs: number,
): Promise<void> {
  const targets = Array.from(kernel.processes.list())
    .filter(([, process]) => process.manifestId === manifestId)
    .map(([handleId]) => handleId);
  if (targets.length === 0) {
    return;
  }

  const pending = new Set(targets);
  await new Promise<void>((resolve) => {
    let settled = false;
    let off: () => void = () => {};
    const finish = (): void => {
      if (settled) return;
      settled = true;
      off();
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    off = kernel.events.on("app.killed", ({ handleId }) => {
      pending.delete(handleId);
      if (pending.size === 0) {
        finish();
      }
    });
    for (const handleId of targets) {
      kernel.processes.kill(handleId, "kernel");
    }
  });
}

/**
 * Tear down an installed external app completely: kill its processes (awaiting
 * teardown) BEFORE unregistering, then remove it from the store, revoke its
 * permission ledger entries, and scrub it from the dock pins. No-op (returns
 * `false`) for ids that are not installed external apps.
 */
export async function uninstallExternalApp(
  id: string,
  deps: UninstallExternalAppDeps,
): Promise<boolean> {
  const store = deps.store ?? useInstalledAppsStore();
  if (!store.isExternalApp(id)) {
    return false;
  }

  try {
    await killProcessesForManifest(deps.kernel, id, deps.killTimeoutMs ?? 3000);
  } catch (error) {
    debugWarn("[installed-apps]", "error while killing processes during uninstall", id, error);
  }

  deps.kernel.apps.unregister(id);
  store.remove(id);

  for (const entry of deps.kernel.permissions.list({ manifestId: id })) {
    deps.kernel.permissions.revoke(id, entry.permission);
  }

  const settingsStore = deps.settingsStore ?? useSettingsStore();
  if (settingsStore.dockPinnedAppIds.includes(id)) {
    settingsStore.setDockPinnedAppIds(
      settingsStore.dockPinnedAppIds.filter((pinned) => pinned !== id),
    );
  }

  return true;
}
