import { KVStore } from "~/core/storage/KVStore";
import type { GuestProfileRecord, ProfileRecord, ProfilesState } from "~/types/profile";

export const PROFILE_INDEX_KV_NAMESPACE = "profiles";
export const PROFILE_INDEX_KV_PRIMARY_KEY = "index";

const DEFAULT_STATE: ProfilesState = {
  profiles: [],
  lastActiveProfileId: null,
};

function coerceTransports(candidate: unknown): AuthenticatorTransport[] {
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter((entry): entry is AuthenticatorTransport => typeof entry === "string");
}

function coerceProfile(candidate: unknown): ProfileRecord | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }
  const c = candidate as Record<string, unknown>;
  if (
    typeof c.id !== "string" ||
    c.id.length === 0 ||
    typeof c.displayName !== "string" ||
    c.displayName.length === 0 ||
    typeof c.createdAt !== "number" ||
    !Number.isFinite(c.createdAt)
  ) {
    return null;
  }

  const authMode = c.authMode === "guest" ? "guest" : "passkey";
  const lastUnlockedAt =
    typeof c.lastUnlockedAt === "number" && Number.isFinite(c.lastUnlockedAt)
      ? { lastUnlockedAt: c.lastUnlockedAt }
      : {};

  if (authMode === "guest") {
    return {
      id: c.id,
      displayName: c.displayName,
      createdAt: c.createdAt,
      authMode,
      encryption: "none",
      ...lastUnlockedAt,
    };
  }

  if (
    typeof c.credentialId !== "string" ||
    c.credentialId.length === 0 ||
    typeof c.userHandle !== "string" ||
    c.userHandle.length === 0 ||
    typeof c.publicKey !== "string" ||
    c.publicKey.length === 0 ||
    typeof c.publicKeyAlg !== "number" ||
    !Number.isFinite(c.publicKeyAlg)
  ) {
    return null;
  }

  const encryption = c.encryption === "prf-aes-gcm-v1" ? c.encryption : "none";

  return {
    id: c.id,
    displayName: c.displayName,
    createdAt: c.createdAt,
    authMode,
    credentialId: c.credentialId,
    userHandle: c.userHandle,
    publicKey: c.publicKey,
    publicKeyAlg: Math.trunc(c.publicKeyAlg),
    transports: coerceTransports(c.transports),
    encryption,
    ...(typeof c.prfSalt === "string" && c.prfSalt.length > 0 ? { prfSalt: c.prfSalt } : {}),
    ...lastUnlockedAt,
  };
}

function coerceState(candidate: unknown): ProfilesState {
  if (typeof candidate !== "object" || candidate === null) {
    return { ...DEFAULT_STATE };
  }

  const c = candidate as Partial<ProfilesState>;
  const profiles = Array.isArray(c.profiles)
    ? c.profiles.map(coerceProfile).filter((entry): entry is ProfileRecord => entry !== null)
    : [];
  const preferredGuestId =
    typeof c.lastActiveProfileId === "string" ? c.lastActiveProfileId : undefined;
  const dedupedProfiles = dedupeGuestProfiles(profiles, preferredGuestId);
  const lastActiveProfileId =
    typeof c.lastActiveProfileId === "string" &&
    dedupedProfiles.some((profile) => profile.id === c.lastActiveProfileId)
      ? c.lastActiveProfileId
      : null;

  return {
    profiles: dedupedProfiles,
    lastActiveProfileId,
    ...(typeof c.importedGlobalAt === "number" && Number.isFinite(c.importedGlobalAt)
      ? { importedGlobalAt: c.importedGlobalAt }
      : {}),
  };
}

function dedupeGuestProfiles(
  profiles: readonly ProfileRecord[],
  preferredGuestId?: string,
): ProfileRecord[] {
  const preferredGuest =
    preferredGuestId === undefined
      ? undefined
      : profiles.find((profile) => profile.id === preferredGuestId && profile.authMode === "guest");
  const canonicalGuestId =
    preferredGuest?.id ?? profiles.find((profile) => profile.authMode === "guest")?.id;
  let hasGuest = false;
  const out: ProfileRecord[] = [];
  for (const profile of profiles) {
    if (profile.authMode === "guest") {
      if (profile.id !== canonicalGuestId) {
        continue;
      }
      if (hasGuest) {
        continue;
      }
      hasGuest = true;
    }
    out.push(profile);
  }
  return out;
}

function createProfileId(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
  return `profile-${Date.now().toString(36)}-${suffix}`;
}

export class ProfileStore {
  private readonly kv: KVStore<ProfilesState>;

  constructor() {
    this.kv = new KVStore<ProfilesState>(PROFILE_INDEX_KV_NAMESPACE, { version: 1 });
  }

  createId(): string {
    return createProfileId();
  }

  read(): ProfilesState {
    const persisted = this.kv.get(PROFILE_INDEX_KV_PRIMARY_KEY);
    return persisted === null ? { ...DEFAULT_STATE } : coerceState(persisted);
  }

  write(next: ProfilesState): void {
    this.kv.set(PROFILE_INDEX_KV_PRIMARY_KEY, coerceState(next));
  }

  list(): ProfileRecord[] {
    const state = this.read();
    return [...state.profiles].sort((a, b) => {
      if (state.lastActiveProfileId === a.id) return -1;
      if (state.lastActiveProfileId === b.id) return 1;
      return (b.lastUnlockedAt ?? b.createdAt) - (a.lastUnlockedAt ?? a.createdAt);
    });
  }

  add(profile: ProfileRecord): void {
    const state = this.read();
    if (state.profiles.some((entry) => entry.id === profile.id)) {
      return;
    }
    if (
      profile.authMode === "guest" &&
      state.profiles.some((entry) => entry.authMode === "guest")
    ) {
      return;
    }
    this.write({
      ...state,
      profiles: [...state.profiles, profile],
      lastActiveProfileId: profile.id,
    });
  }

  remove(profileId: string): boolean {
    const state = this.read();
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    if (profiles.length === state.profiles.length) {
      return false;
    }

    const keepLastActive =
      state.lastActiveProfileId !== profileId &&
      profiles.some((profile) => profile.id === state.lastActiveProfileId);
    const lastActiveProfileId = keepLastActive
      ? state.lastActiveProfileId
      : mostRecentlyUsedProfileId(profiles);

    this.write({
      ...state,
      profiles,
      lastActiveProfileId,
    });

    return true;
  }

  get(profileId: string): ProfileRecord | null {
    return this.read().profiles.find((profile) => profile.id === profileId) ?? null;
  }

  getGuest(): GuestProfileRecord | null {
    const profile = this.read().profiles.find((entry) => entry.authMode === "guest");
    return profile?.authMode === "guest" ? profile : null;
  }

  setLastActive(profileId: string, now: number = Date.now()): void {
    const state = this.read();
    const profiles = state.profiles.map((profile) =>
      profile.id === profileId ? { ...profile, lastUnlockedAt: now } : profile,
    );
    this.write({ ...state, profiles, lastActiveProfileId: profileId });
  }

  markGlobalImported(now: number = Date.now()): void {
    const state = this.read();
    this.write({ ...state, importedGlobalAt: now });
  }

  hasImportedGlobalData(): boolean {
    return this.read().importedGlobalAt !== undefined;
  }

  dispose(): void {
    this.kv.dispose();
  }
}

function mostRecentlyUsedProfileId(profiles: readonly ProfileRecord[]): string | null {
  return (
    [...profiles].sort(
      (a, b) => (b.lastUnlockedAt ?? b.createdAt) - (a.lastUnlockedAt ?? a.createdAt),
    )[0]?.id ?? null
  );
}
