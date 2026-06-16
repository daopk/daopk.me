import { readonly, shallowRef, type ShallowRef } from "vue";

import type { ActiveProfileSession, ProfileSessionSnapshot } from "~/types/profile";

const activeSession = shallowRef<ActiveProfileSession | null>(null);
const locked = shallowRef(false);

function snapshotOf(session: ActiveProfileSession): ProfileSessionSnapshot {
  return {
    profileId: session.profileId,
    displayName: session.displayName,
    authMode: session.authMode,
    encryption: session.encryption,
    encrypted: session.encrypted,
  };
}

export function useActiveProfileSession(): Readonly<ShallowRef<ActiveProfileSession | null>> {
  return readonly(activeSession) as Readonly<ShallowRef<ActiveProfileSession | null>>;
}

export function useProfileSessionLocked(): Readonly<ShallowRef<boolean>> {
  return readonly(locked) as Readonly<ShallowRef<boolean>>;
}

export function getActiveProfileSession(): ActiveProfileSession | null {
  return activeSession.value;
}

export function isProfileSessionLocked(): boolean {
  return locked.value;
}

export function setActiveProfileSession(session: ActiveProfileSession): void {
  activeSession.value = session;
  locked.value = false;
}

export function clearActiveProfileSession(): void {
  activeSession.value = null;
  locked.value = false;
}

export function lockActiveProfileSession(): void {
  if (!activeSession.value) {
    throw new Error("Cannot lock without an active profile session.");
  }
  locked.value = true;
}

export function unlockActiveProfileSession(session?: ActiveProfileSession): void {
  if (session) {
    activeSession.value = session;
  }
  if (!activeSession.value) {
    throw new Error("Cannot unlock without an active profile session.");
  }
  locked.value = false;
}

export function currentProfileSessionSnapshot(): ProfileSessionSnapshot {
  const session = activeSession.value;
  if (!session) {
    throw new Error("No active profile session.");
  }
  return snapshotOf(session);
}

function requireActiveProfileSession(): ActiveProfileSession {
  const session = activeSession.value;
  if (!session) {
    throw new Error("Kernel.init() requires an unlocked local profile.");
  }
  return session;
}

export function ensureActiveProfileSessionForKernel(): ActiveProfileSession {
  const session = activeSession.value;
  if (session) {
    return session;
  }

  if (import.meta.env.MODE === "test") {
    const testSession: ActiveProfileSession = {
      profileId: "test-profile",
      displayName: "Test Profile",
      authMode: "passkey",
      encryption: "none",
      encrypted: false,
    };
    activeSession.value = testSession;
    locked.value = false;
    return testSession;
  }

  return requireActiveProfileSession();
}
