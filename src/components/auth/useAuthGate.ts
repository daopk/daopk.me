import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

import { useBreakpoint } from "~/composables/useBreakpoint";
import { useKernel } from "~/composables/useKernel";
import { PasskeyService, ProfileAuthError } from "~/core/profile/PasskeyService";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { migrateGlobalDataToProfile } from "~/core/profile/migration";
import { setActiveProfileSession, useActiveProfileSession } from "~/core/profile/ProfileSession";
import { hasAutoGuestLoginUrlIntent } from "~/core/routing/appUrlIntents";
import {
  DEFAULT_WALLPAPER_DESKTOP_URL,
  DEFAULT_WALLPAPER_MOBILE_URL,
} from "~/core/theme/wallpapers";
import type { ActiveProfileSession, GuestProfileRecord, ProfileRecord } from "~/types/profile";

import { profileMeta } from "./authGateLabels";
import { useAuthAutoUpdate } from "./useAuthAutoUpdate";

type AuthMode = "unlock" | "create";

export interface UseAuthGateOptions {
  onAuthenticated(): void;
}

export function useAuthGate({ onAuthenticated }: UseAuthGateOptions) {
  const store = new ProfileStore();
  const passkeys = new PasskeyService();
  const breakpoint = useBreakpoint();
  const kernel = useKernel();
  const activeProfile = useActiveProfileSession();

  const profiles = ref<ProfileRecord[]>([]);
  const selectedProfileId = ref<string | null>(null);
  const displayName = ref("Local Profile");
  const mode = ref<AuthMode>("unlock");
  const busy = ref(false);
  const errorMessage = ref("");
  const autoUpdate = useAuthAutoUpdate(computed(() => activeProfile.value === null));

  const hasProfiles = computed(() => profiles.value.length > 0);
  const isCreatingProfile = computed(() => !hasProfiles.value || mode.value === "create");
  const selectedProfile = computed<ProfileRecord | null>(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  );
  const guestProfile = computed<GuestProfileRecord | null>(
    () => profiles.value.find((profile) => profile.authMode === "guest") ?? null,
  );
  const hasGuestProfile = computed(() => guestProfile.value !== null);
  const passkeyAvailable = computed(() => passkeys.isAvailable());
  const canUnlockSelected = computed(
    () =>
      selectedProfile.value !== null &&
      (selectedProfile.value.authMode === "guest" || passkeyAvailable.value),
  );
  const unlockButtonLabel = computed(() =>
    selectedProfile.value?.authMode === "guest" ? "Open guest" : "Unlock",
  );
  const addAccountLabel = computed(() =>
    guestProfile.value ? "Add passkey account" : "Add account",
  );
  const showProfileList = computed(() => profiles.value.length > 1);
  const authGateStyle = computed<Record<string, string>>(() => ({
    backgroundImage: [
      "linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 34%, transparent) 0%, color-mix(in srgb, var(--color-bg) 72%, transparent) 100%)",
      `url("${
        breakpoint.isMobile.value ? DEFAULT_WALLPAPER_MOBILE_URL : DEFAULT_WALLPAPER_DESKTOP_URL
      }")`,
    ].join(", "),
  }));
  const panelLabel = computed(() =>
    isCreatingProfile.value ? "Create account" : "Unlock account",
  );
  const panelEyebrow = computed(() => (isCreatingProfile.value ? "Local setup" : "Welcome back"));
  const screenTitle = computed(() => {
    if (isCreatingProfile.value) {
      return "Create account";
    }
    return selectedProfile.value?.displayName ?? "Choose account";
  });
  const screenSubtitle = computed(() => {
    if (isCreatingProfile.value) {
      return "Local to this browser.";
    }
    const profile = selectedProfile.value;
    return profile ? profileMeta(profile) : "Choose account";
  });
  const initialImportPending = computed(
    () => profiles.value.length === 1 && !store.hasImportedGlobalData(),
  );

  function refreshProfiles(): void {
    const previousSelected = selectedProfileId.value;
    profiles.value = store.list();
    selectedProfileId.value =
      profiles.value.find((profile) => profile.id === previousSelected)?.id ??
      profiles.value[0]?.id ??
      null;
    if (profiles.value.length === 0) {
      mode.value = "create";
    }
  }

  function describeError(error: unknown): string {
    if (error instanceof ProfileAuthError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Passkey operation failed.";
  }

  async function waitForBusyFeedback(): Promise<void> {
    await nextTick();

    if (import.meta.env.MODE === "test") {
      return;
    }

    await new Promise<void>((resolve) => {
      if (typeof window.requestAnimationFrame !== "function") {
        window.setTimeout(resolve, 0);
        return;
      }

      window.requestAnimationFrame(() => resolve());
    });
  }

  async function importGlobalDataIfNeeded(
    profileId: string,
    encryptionKey?: CryptoKey,
  ): Promise<void> {
    if (profiles.value.length > 1 || store.hasImportedGlobalData()) {
      return;
    }

    await migrateGlobalDataToProfile({ profileId, encryptionKey });
    store.markGlobalImported();
  }

  function createGuestRecord(name: string): GuestProfileRecord {
    return {
      id: store.createId(),
      displayName: name,
      createdAt: Date.now(),
      authMode: "guest",
      encryption: "none",
    };
  }

  function sessionForGuest(profile: GuestProfileRecord): ActiveProfileSession {
    return {
      profileId: profile.id,
      displayName: profile.displayName,
      authMode: "guest",
      encryption: "none",
      encrypted: false,
    };
  }

  async function createProfile(): Promise<void> {
    if (busy.value || !passkeyAvailable.value) {
      return;
    }

    busy.value = true;
    errorMessage.value = "";
    await waitForBusyFeedback();

    const wasFirstProfile = profiles.value.length === 0;
    const profileId = store.createId();
    const name = displayName.value.trim() || "Local Profile";
    let createdProfileId: string | null = null;
    let authenticated = false;

    try {
      const created = await passkeys.createProfilePasskey({ profileId, displayName: name });
      store.add(created.profile);
      createdProfileId = created.profile.id;
      if (wasFirstProfile) {
        await importGlobalDataIfNeeded(created.profile.id, created.session.encryptionKey);
      }

      store.setLastActive(created.profile.id);
      setActiveProfileSession(created.session);
      onAuthenticated();
      authenticated = true;
    } catch (error: unknown) {
      errorMessage.value = describeError(error);
    } finally {
      if (!authenticated) {
        busy.value = false;
        refreshProfiles();
        if (createdProfileId && errorMessage.value) {
          selectedProfileId.value = createdProfileId;
          mode.value = "unlock";
        }
      }
    }
  }

  async function createGuestProfileWithName(rawName: string): Promise<void> {
    if (busy.value) {
      return;
    }

    const existingGuest = guestProfile.value;
    if (existingGuest) {
      await openGuestProfile(existingGuest);
      return;
    }

    busy.value = true;
    errorMessage.value = "";
    await waitForBusyFeedback();

    const wasFirstProfile = profiles.value.length === 0;
    const name = rawName.trim() || "Guest";
    const profile = createGuestRecord(name);
    let createdProfileId: string | null = null;
    let authenticated = false;

    try {
      store.add(profile);
      const storedGuest = store.getGuest();
      if (!storedGuest) {
        throw new Error("Guest account could not be created.");
      }
      if (storedGuest.id !== profile.id) {
        authenticated = await openGuestProfile(storedGuest);
        return;
      }
      createdProfileId = storedGuest.id;
      if (wasFirstProfile) {
        await importGlobalDataIfNeeded(storedGuest.id);
      }

      store.setLastActive(storedGuest.id);
      setActiveProfileSession(sessionForGuest(storedGuest));
      onAuthenticated();
      authenticated = true;
    } catch (error: unknown) {
      errorMessage.value = describeError(error);
    } finally {
      if (!authenticated) {
        busy.value = false;
        refreshProfiles();
        if (createdProfileId && errorMessage.value) {
          selectedProfileId.value = createdProfileId;
          mode.value = "unlock";
        }
      }
    }
  }

  async function createGuestProfile(): Promise<void> {
    await createGuestProfileWithName(displayName.value);
  }

  async function createDefaultGuestProfile(): Promise<void> {
    await createGuestProfileWithName("Guest");
  }

  function showCreateProfile(): void {
    errorMessage.value = "";
    displayName.value = "Local Profile";
    mode.value = "create";
  }

  function showUnlockProfile(): void {
    errorMessage.value = "";
    mode.value = "unlock";
  }

  function selectProfile(profileId: string): void {
    selectedProfileId.value = profileId;
  }

  async function unlockSelected(): Promise<void> {
    const profile = selectedProfile.value;
    if (busy.value || !profile) {
      return;
    }

    if (profile.authMode === "guest") {
      await openGuestProfile(profile);
      return;
    }

    if (!passkeyAvailable.value) {
      return;
    }

    busy.value = true;
    errorMessage.value = "";
    await waitForBusyFeedback();

    let authenticated = false;
    try {
      const session = await passkeys.unlockProfile(profile);
      await importGlobalDataIfNeeded(profile.id, session.encryptionKey);
      store.setLastActive(profile.id);
      setActiveProfileSession(session);
      onAuthenticated();
      authenticated = true;
    } catch (error: unknown) {
      errorMessage.value = describeError(error);
    } finally {
      if (!authenticated) {
        busy.value = false;
        refreshProfiles();
      }
    }
  }

  async function openGuestProfile(profile: GuestProfileRecord): Promise<boolean> {
    busy.value = true;
    errorMessage.value = "";
    await waitForBusyFeedback();

    let authenticated = false;
    try {
      await importGlobalDataIfNeeded(profile.id);
      store.setLastActive(profile.id);
      setActiveProfileSession(sessionForGuest(profile));
      onAuthenticated();
      authenticated = true;
      return true;
    } catch (error: unknown) {
      errorMessage.value = describeError(error);
      return false;
    } finally {
      if (!authenticated) {
        busy.value = false;
        refreshProfiles();
      }
    }
  }

  onMounted(() => {
    refreshProfiles();
    if (autoUpdate.visible.value) {
      return;
    }

    if (profiles.value.length === 0) {
      void createDefaultGuestProfile();
      return;
    }

    const soleProfile = profiles.value.length === 1 ? profiles.value[0] : null;
    if (soleProfile?.authMode === "guest" && hasAutoGuestLoginUrlIntent(kernel)) {
      void openGuestProfile(soleProfile);
    }
  });

  onUnmounted(() => {
    store.dispose();
  });

  return {
    addAccountLabel,
    autoUpdateErrorMessage: autoUpdate.errorMessage,
    autoUpdateFailed: autoUpdate.failed,
    autoUpdateVisible: autoUpdate.visible,
    authGateStyle,
    busy,
    canUnlockSelected,
    createGuestProfile,
    createProfile,
    displayName,
    errorMessage,
    hasGuestProfile,
    hasProfiles,
    initialImportPending,
    isCreatingProfile,
    panelEyebrow,
    panelLabel,
    passkeyAvailable,
    profiles,
    retryAutoUpdate: autoUpdate.retry,
    screenSubtitle,
    screenTitle,
    selectProfile,
    selectedProfile,
    selectedProfileId,
    showCreateProfile,
    showProfileList,
    showUnlockProfile,
    unlockButtonLabel,
    unlockSelected,
  };
}
