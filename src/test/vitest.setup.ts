import { setProfileSessionFallback } from "~/core/profile/ProfileSession";
import type { ActiveProfileSession } from "~/types/profile";

// Mirrors the session the kernel used to self-inject under `MODE === "test"`.
// Installing it as a fallback (consulted only when `kernel.init()` runs without
// an unlocked session) — rather than seeding it eagerly — keeps the previous
// behavior exactly: specs that never boot the kernel (e.g. store tests asserting
// the un-scoped KV namespace) still observe no active profile session.
const TEST_PROFILE_SESSION: ActiveProfileSession = {
  profileId: "test-profile",
  displayName: "Test Profile",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
};

setProfileSessionFallback(() => ({ ...TEST_PROFILE_SESSION }));
