import { migrateGlobalDataToProfile } from "~/core/profile/migration";
import {
  getActiveProfileSession,
  replaceActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { ProfileStore } from "~/core/profile/ProfileStore";
import type { ActiveProfileSession, GuestProfileRecord, ProfileRecord } from "~/types/profile";

export type ProfileLifecycleErrorCode =
  | "INVALID_ACCOUNT"
  | "NO_ACTIVE_PROFILE"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_ALREADY_LINKED"
  | "ACCOUNT_ALREADY_LINKED";

export class ProfileLifecycleError extends Error {
  readonly code: ProfileLifecycleErrorCode;

  constructor(code: ProfileLifecycleErrorCode, message: string) {
    super(message);
    this.name = "ProfileLifecycleError";
    this.code = code;
  }
}

export interface ProfileLifecycle {
  bootstrapGuest(): Promise<ActiveProfileSession>;
  linkActiveGuest(input: { accountId: string }): Promise<ActiveProfileSession>;
  dispose(): void;
}

export interface ProfileLifecycleOptions {
  readonly store?: ProfileStore;
  readonly migrateGlobalData?: typeof migrateGlobalDataToProfile;
  readonly now?: () => number;
}

function sessionForProfile(profile: ProfileRecord): ActiveProfileSession {
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    owner: { ...profile.owner },
  };
}

export function createProfileLifecycle(options: ProfileLifecycleOptions = {}): ProfileLifecycle {
  const store = options.store ?? new ProfileStore();
  const ownsStore = options.store === undefined;
  const migrateGlobalData = options.migrateGlobalData ?? migrateGlobalDataToProfile;
  const now = options.now ?? Date.now;

  return {
    async bootstrapGuest(): Promise<ActiveProfileSession> {
      return await store.runExclusive(async () => {
        const active = getActiveProfileSession();
        if (active) {
          return active;
        }

        let guest = store.getGuest();
        if (!guest) {
          const candidate: GuestProfileRecord = {
            id: store.createId(),
            displayName: "Guest",
            createdAt: now(),
            owner: { kind: "guest" },
          };
          store.add(candidate);
          guest = store.getGuest();
        }
        if (!guest) {
          throw new Error("Guest profile could not be created.");
        }

        if (!store.hasImportedGlobalData()) {
          await migrateGlobalData({ profileId: guest.id });
          store.markGlobalImported(now());
        }

        store.setLastActive(guest.id, now());
        const committed = store.get(guest.id);
        if (!committed) {
          throw new Error("Guest profile disappeared during setup.");
        }

        const session = sessionForProfile(committed);
        setActiveProfileSession(session);
        return session;
      });
    },

    async linkActiveGuest(input: { accountId: string }): Promise<ActiveProfileSession> {
      const accountId = input.accountId.trim();
      if (accountId.length === 0) {
        throw new ProfileLifecycleError("INVALID_ACCOUNT", "Account id is required.");
      }

      const active = getActiveProfileSession();
      if (!active) {
        throw new ProfileLifecycleError(
          "NO_ACTIVE_PROFILE",
          "An active guest profile is required before linking an account.",
        );
      }

      try {
        const linked = await store.linkGuest(active.profileId, accountId, now());
        const session = sessionForProfile(linked);
        replaceActiveProfileSession(session);
        return session;
      } catch (error: unknown) {
        if (!(error instanceof Error)) {
          throw error;
        }
        const code = error.message as ProfileLifecycleErrorCode;
        if (code === "PROFILE_NOT_FOUND") {
          throw new ProfileLifecycleError(code, "The active profile could not be found.");
        }
        if (code === "PROFILE_ALREADY_LINKED") {
          throw new ProfileLifecycleError(
            code,
            "The active profile is already linked to another account.",
          );
        }
        if (code === "ACCOUNT_ALREADY_LINKED") {
          throw new ProfileLifecycleError(
            code,
            "This account is already linked to another local profile.",
          );
        }
        throw error;
      }
    },

    dispose(): void {
      if (ownsStore) {
        store.dispose();
      }
    },
  };
}
