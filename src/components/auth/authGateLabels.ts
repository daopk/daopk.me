import type { ProfileRecord } from "~/types/profile";

export function profileMeta(profile: ProfileRecord): string {
  if (profile.authMode === "guest") {
    return "Guest account";
  }
  return profile.encryption === "prf-aes-gcm-v1" ? "Encrypted passkey" : "Passkey";
}
