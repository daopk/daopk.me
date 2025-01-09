import { getActiveProfileSession } from "~/core/profile/ProfileSession";

export function profileKvNamespace(profileId: string, namespace: string): string {
  return `profiles:${profileId}:${namespace}`;
}

export function activeProfileKvNamespace(namespace: string): string {
  const session = getActiveProfileSession();
  return session ? profileKvNamespace(session.profileId, namespace) : namespace;
}

export function profileIdbName(profileId: string, domain: "vfs" | "wallpapers" | "trash"): string {
  return `daopk.profile.${profileId}.${domain}`;
}

export function activeProfileIdbName(
  fallbackDbName: string,
  domain: "vfs" | "wallpapers" | "trash",
): string {
  const session = getActiveProfileSession();
  return session ? profileIdbName(session.profileId, domain) : fallbackDbName;
}
