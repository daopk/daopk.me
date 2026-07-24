export type ProfileOwner =
  | { readonly kind: "guest" }
  | {
      readonly kind: "account";
      readonly accountId: string;
      readonly linkedAt: number;
    };

export interface ProfileBaseRecord {
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: number;
  readonly owner: ProfileOwner;
  readonly lastOpenedAt?: number;
}

export interface GuestProfileRecord extends ProfileBaseRecord {
  readonly owner: { readonly kind: "guest" };
}

export interface AccountProfileRecord extends ProfileBaseRecord {
  readonly owner: {
    readonly kind: "account";
    readonly accountId: string;
    readonly linkedAt: number;
  };
}

export type ProfileRecord = GuestProfileRecord | AccountProfileRecord;

export interface ProfilesState {
  profiles: ProfileRecord[];
  lastActiveProfileId: string | null;
  importedGlobalAt?: number;
}

export interface ProfileSessionSnapshot {
  readonly profileId: string;
  readonly displayName: string;
  readonly owner: ProfileOwner;
}

export type ActiveProfileSession = ProfileSessionSnapshot;
