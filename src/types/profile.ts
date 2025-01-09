export type ProfileEncryptionMode = "prf-aes-gcm-v1" | "none";
export type ProfileAuthMode = "passkey" | "guest";

export interface ProfileBaseRecord {
  id: string;
  displayName: string;
  createdAt: number;
  authMode: ProfileAuthMode;
  encryption: ProfileEncryptionMode;
  lastUnlockedAt?: number;
}

export interface PasskeyProfileRecord extends ProfileBaseRecord {
  authMode: "passkey";
  credentialId: string;
  userHandle: string;
  publicKey: string;
  publicKeyAlg: number;
  transports: AuthenticatorTransport[];
  prfSalt?: string;
}

export interface GuestProfileRecord extends ProfileBaseRecord {
  authMode: "guest";
  encryption: "none";
}

export type ProfileRecord = PasskeyProfileRecord | GuestProfileRecord;

export interface ProfilesState {
  profiles: ProfileRecord[];
  lastActiveProfileId: string | null;
  importedGlobalAt?: number;
}

export interface ProfileSessionSnapshot {
  profileId: string;
  displayName: string;
  authMode: ProfileAuthMode;
  encryption: ProfileEncryptionMode;
  encrypted: boolean;
}

export interface ActiveProfileSession extends ProfileSessionSnapshot {
  encryptionKey?: CryptoKey;
}
