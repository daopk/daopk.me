import { KVStore } from "~/core/storage/KVStore";
import {
  createProfileCoordination,
  type ProfileCoordination,
  type ProfileExclusiveOperation,
} from "~/core/profile/ProfileCoordination";
import type {
  AccountProfileRecord,
  GuestProfileRecord,
  ProfileRecord,
  ProfilesState,
} from "~/types/profile";

export const PROFILE_INDEX_KV_NAMESPACE = "profiles";
export const PROFILE_INDEX_KV_PRIMARY_KEY = "index";
export const PROFILE_INDEX_VERSION = 2;

export interface ProfileStoreOptions {
  readonly coordination?: ProfileCoordination;
}

const DEFAULT_STATE: ProfilesState = {
  profiles: [],
  lastActiveProfileId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isGuestProfile(profile: ProfileRecord): profile is GuestProfileRecord {
  return profile.owner.kind === "guest";
}

function isAccountProfile(profile: ProfileRecord): profile is AccountProfileRecord {
  return profile.owner.kind === "account";
}

function coerceProfile(candidate: unknown): ProfileRecord | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const createdAt = finiteTimestamp(candidate.createdAt);
  if (
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.displayName !== "string" ||
    candidate.displayName.length === 0 ||
    createdAt === undefined ||
    !isRecord(candidate.owner)
  ) {
    return null;
  }

  const lastOpenedAt = finiteTimestamp(candidate.lastOpenedAt);
  const base = {
    id: candidate.id,
    displayName: candidate.displayName,
    createdAt,
    ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
  };

  if (candidate.owner.kind === "guest") {
    return { ...base, owner: { kind: "guest" } };
  }

  const linkedAt = finiteTimestamp(candidate.owner.linkedAt);
  if (
    candidate.owner.kind !== "account" ||
    typeof candidate.owner.accountId !== "string" ||
    candidate.owner.accountId.trim().length === 0 ||
    linkedAt === undefined
  ) {
    return null;
  }

  return {
    ...base,
    owner: {
      kind: "account",
      accountId: candidate.owner.accountId.trim(),
      linkedAt,
    },
  };
}

function dedupeProfiles(
  profiles: readonly ProfileRecord[],
  preferredProfileId?: string,
): ProfileRecord[] {
  const preferredGuest = profiles.find(
    (profile) => profile.id === preferredProfileId && profile.owner.kind === "guest",
  );
  const canonicalGuestId =
    preferredGuest?.id ?? profiles.find((profile) => profile.owner.kind === "guest")?.id;

  const preferredAccountIds = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.owner.kind !== "account") {
      continue;
    }
    if (profile.id === preferredProfileId || !preferredAccountIds.has(profile.owner.accountId)) {
      preferredAccountIds.set(profile.owner.accountId, profile.id);
    }
  }

  let keptGuest = false;
  const keptAccountIds = new Set<string>();
  const out: ProfileRecord[] = [];

  for (const profile of profiles) {
    if (profile.owner.kind === "guest") {
      if (keptGuest || profile.id !== canonicalGuestId) {
        continue;
      }
      keptGuest = true;
      out.push(profile);
      continue;
    }

    if (
      keptAccountIds.has(profile.owner.accountId) ||
      preferredAccountIds.get(profile.owner.accountId) !== profile.id
    ) {
      continue;
    }
    keptAccountIds.add(profile.owner.accountId);
    out.push(profile);
  }

  return out;
}

function coerceState(candidate: unknown): ProfilesState {
  if (!isRecord(candidate)) {
    return { ...DEFAULT_STATE };
  }

  const preferredProfileId =
    typeof candidate.lastActiveProfileId === "string" ? candidate.lastActiveProfileId : undefined;
  const profiles = Array.isArray(candidate.profiles)
    ? candidate.profiles
        .map(coerceProfile)
        .filter((profile): profile is ProfileRecord => profile !== null)
    : [];
  const dedupedProfiles = dedupeProfiles(profiles, preferredProfileId);
  const lastActiveProfileId =
    preferredProfileId !== undefined &&
    dedupedProfiles.some((profile) => profile.id === preferredProfileId)
      ? preferredProfileId
      : null;
  const importedGlobalAt = finiteTimestamp(candidate.importedGlobalAt);

  return {
    profiles: dedupedProfiles,
    lastActiveProfileId,
    ...(importedGlobalAt === undefined ? {} : { importedGlobalAt }),
  };
}

function unwrapStoredEnvelope(stored: unknown): unknown {
  return isRecord(stored) && "data" in stored ? stored.data : stored;
}

function migrateVersionOneState(stored: unknown): ProfilesState {
  const candidate = unwrapStoredEnvelope(stored);
  if (!isRecord(candidate) || !Array.isArray(candidate.profiles)) {
    return { ...DEFAULT_STATE };
  }

  const preferredGuestId =
    typeof candidate.lastActiveProfileId === "string" ? candidate.lastActiveProfileId : undefined;
  const legacyGuests = candidate.profiles
    .filter(
      (profile): profile is Record<string, unknown> =>
        isRecord(profile) && profile.authMode === "guest",
    )
    .map((profile): GuestProfileRecord | null => {
      const createdAt = finiteTimestamp(profile.createdAt);
      const lastOpenedAt = finiteTimestamp(profile.lastUnlockedAt);
      if (
        typeof profile.id !== "string" ||
        profile.id.length === 0 ||
        typeof profile.displayName !== "string" ||
        profile.displayName.length === 0 ||
        createdAt === undefined
      ) {
        return null;
      }
      return {
        id: profile.id,
        displayName: profile.displayName,
        createdAt,
        owner: { kind: "guest" },
        ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
      };
    })
    .filter((profile): profile is GuestProfileRecord => profile !== null);

  const profiles = dedupeProfiles(legacyGuests, preferredGuestId);
  const guest = profiles[0];
  if (!guest) {
    return { ...DEFAULT_STATE };
  }

  const importedGlobalAt = finiteTimestamp(candidate.importedGlobalAt);
  return {
    profiles,
    lastActiveProfileId: guest.id,
    ...(importedGlobalAt === undefined ? {} : { importedGlobalAt }),
  };
}

function createProfileId(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
  return `profile-${Date.now().toString(36)}-${suffix}`;
}

export class ProfileStore {
  private readonly kv: KVStore<ProfilesState>;
  private readonly coordination: ProfileCoordination;
  private migratedReadPendingRewrite = false;

  constructor(options: ProfileStoreOptions = {}) {
    this.coordination = options.coordination ?? createProfileCoordination();
    this.kv = new KVStore<ProfilesState>(PROFILE_INDEX_KV_NAMESPACE, {
      version: PROFILE_INDEX_VERSION,
      migrate: (stored, fromVersion) => {
        this.migratedReadPendingRewrite = true;
        return fromVersion === 1 ? migrateVersionOneState(stored) : { ...DEFAULT_STATE };
      },
    });
  }

  createId(): string {
    return createProfileId();
  }

  runExclusive<T>(operation: ProfileExclusiveOperation<T>): Promise<T> {
    return this.coordination.runExclusive(operation);
  }

  read(): ProfilesState {
    const persisted = this.kv.get(PROFILE_INDEX_KV_PRIMARY_KEY);
    const state = persisted === null ? { ...DEFAULT_STATE } : coerceState(persisted);
    if (this.migratedReadPendingRewrite) {
      this.migratedReadPendingRewrite = false;
      this.kv.set(PROFILE_INDEX_KV_PRIMARY_KEY, state);
    }
    return state;
  }

  write(next: ProfilesState): void {
    this.kv.set(PROFILE_INDEX_KV_PRIMARY_KEY, coerceState(next));
  }

  list(): ProfileRecord[] {
    const state = this.read();
    return [...state.profiles].sort((a, b) => {
      if (state.lastActiveProfileId === a.id) return -1;
      if (state.lastActiveProfileId === b.id) return 1;
      return (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt);
    });
  }

  add(profile: ProfileRecord): void {
    const state = this.read();
    if (state.profiles.some((entry) => entry.id === profile.id)) {
      return;
    }
    if (
      profile.owner.kind === "guest" &&
      state.profiles.some((entry) => entry.owner.kind === "guest")
    ) {
      return;
    }
    if (isAccountProfile(profile)) {
      const accountId = profile.owner.accountId;
      if (
        state.profiles.some(
          (entry) => isAccountProfile(entry) && entry.owner.accountId === accountId,
        )
      ) {
        return;
      }
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

    this.write({ ...state, profiles, lastActiveProfileId });
    return true;
  }

  get(profileId: string): ProfileRecord | null {
    return this.read().profiles.find((profile) => profile.id === profileId) ?? null;
  }

  getGuest(): GuestProfileRecord | null {
    return this.read().profiles.find(isGuestProfile) ?? null;
  }

  setLastActive(profileId: string, now: number = Date.now()): void {
    const state = this.read();
    if (!state.profiles.some((profile) => profile.id === profileId)) {
      return;
    }
    const profiles = state.profiles.map((profile) =>
      profile.id === profileId ? { ...profile, lastOpenedAt: now } : profile,
    );
    this.write({ ...state, profiles, lastActiveProfileId: profileId });
  }

  async linkGuest(
    profileId: string,
    accountId: string,
    linkedAt: number,
  ): Promise<AccountProfileRecord> {
    const normalizedAccountId = accountId.trim();
    if (normalizedAccountId.length === 0) {
      throw new Error("INVALID_ACCOUNT");
    }

    return await this.runExclusive(() => {
      const state = this.read();
      const profile = state.profiles.find((entry) => entry.id === profileId);
      if (!profile) {
        throw new Error("PROFILE_NOT_FOUND");
      }
      if (isAccountProfile(profile)) {
        if (profile.owner.accountId === normalizedAccountId) {
          return profile;
        }
        throw new Error("PROFILE_ALREADY_LINKED");
      }
      if (
        state.profiles.some(
          (entry) =>
            entry.id !== profileId &&
            entry.owner.kind === "account" &&
            entry.owner.accountId === normalizedAccountId,
        )
      ) {
        throw new Error("ACCOUNT_ALREADY_LINKED");
      }

      const linked: AccountProfileRecord = {
        ...profile,
        owner: { kind: "account", accountId: normalizedAccountId, linkedAt },
      };
      const profiles = state.profiles.map((entry) => (entry.id === profileId ? linked : entry));
      this.write({ ...state, profiles, lastActiveProfileId: profileId });

      const committed = this.get(profileId);
      if (!committed) {
        throw new Error("PROFILE_NOT_FOUND");
      }
      if (!isAccountProfile(committed) || committed.owner.accountId !== normalizedAccountId) {
        throw new Error("Profile account link was not committed.");
      }
      return committed;
    });
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
      (a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt),
    )[0]?.id ?? null
  );
}
