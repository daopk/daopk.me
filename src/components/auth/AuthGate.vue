<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import everestDesktopUrl from "~/assets/wallpapers/everest-desktop.webp";
import everestPhoneUrl from "~/assets/wallpapers/everest-phone.webp";
import { Button } from "~/components/ui";
import { useBreakpoint } from "~/composables/useBreakpoint";
import { useKernel } from "~/composables/useKernel";
import { PasskeyService, ProfileAuthError } from "~/core/profile/PasskeyService";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { migrateGlobalDataToProfile } from "~/core/profile/migration";
import { setActiveProfileSession } from "~/core/profile/ProfileSession";
import { hasRegisteredAppUrlIntent } from "~/core/routing/appUrlIntents";
import { CloudOff, KeyRound, Plus, RefreshCw, Shield } from "~/icons/lucide";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { ActiveProfileSession, GuestProfileRecord, ProfileRecord } from "~/types/profile";

const emit = defineEmits<{
  authenticated: [];
}>();

const store = new ProfileStore();
const passkeys = new PasskeyService();
const breakpoint = useBreakpoint();
const kernel = useKernel();

type AuthMode = "unlock" | "create";

const profiles = ref<ProfileRecord[]>([]);
const selectedProfileId = ref<string | null>(null);
const displayName = ref("Local Profile");
const mode = ref<AuthMode>("unlock");
const busy = ref(false);
const status = ref("");
const errorMessage = ref("");
const serviceWorkerUpdateState = serviceWorkerUpdateController.state;

const hasProfiles = computed(() => profiles.value.length > 0);
const isCreatingProfile = computed(() => !hasProfiles.value || mode.value === "create");
const selectedProfile = computed<ProfileRecord | null>(
  () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
);
const guestProfile = computed<GuestProfileRecord | null>(
  () => profiles.value.find((profile) => profile.authMode === "guest") ?? null,
);
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
    `url("${breakpoint.isMobile.value ? everestPhoneUrl : everestDesktopUrl}")`,
  ].join(", "),
}));
const canUpdateApp = computed(
  () =>
    serviceWorkerUpdateState.value.kind === "update-available" ||
    serviceWorkerUpdateState.value.kind === "refresh-error",
);
const updateButtonLabel = computed(() =>
  serviceWorkerUpdateState.value.kind === "refresh-error" ? "Retry update" : "Update app",
);
const updateMessage = computed(() => {
  if (serviceWorkerUpdateState.value.kind === "refresh-error") {
    return "Update could not finish.";
  }

  return "A newer version is ready.";
});
const isUpdatingApp = computed(
  () =>
    serviceWorkerUpdateState.value.kind === "update-available" &&
    serviceWorkerUpdateState.value.refreshing,
);
const panelLabel = computed(() => (isCreatingProfile.value ? "Create account" : "Unlock account"));
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

async function importGlobalDataIfNeeded(
  profileId: string,
  encryptionKey?: CryptoKey,
): Promise<void> {
  if (profiles.value.length > 1 || store.hasImportedGlobalData()) {
    return;
  }

  status.value = "Importing local data";
  await migrateGlobalDataToProfile({ profileId, encryptionKey });
  store.markGlobalImported();
}

function profileMeta(profile: ProfileRecord): string {
  if (profile.authMode === "guest") {
    return "Guest account";
  }
  return profile.encryption === "prf-aes-gcm-v1" ? "Encrypted passkey" : "Passkey";
}

function createGuestRecord(displayName: string): GuestProfileRecord {
  return {
    id: store.createId(),
    displayName,
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
  status.value = "Creating profile";

  const wasFirstProfile = profiles.value.length === 0;
  const profileId = store.createId();
  const name = displayName.value.trim() || "Local Profile";
  let createdProfileId: string | null = null;

  try {
    const created = await passkeys.createProfilePasskey({ profileId, displayName: name });
    store.add(created.profile);
    createdProfileId = created.profile.id;
    if (wasFirstProfile) {
      await importGlobalDataIfNeeded(created.profile.id, created.session.encryptionKey);
    }

    store.setLastActive(created.profile.id);
    setActiveProfileSession(created.session);
    emit("authenticated");
  } catch (error: unknown) {
    errorMessage.value = describeError(error);
  } finally {
    busy.value = false;
    status.value = "";
    refreshProfiles();
    if (createdProfileId && errorMessage.value) {
      selectedProfileId.value = createdProfileId;
      mode.value = "unlock";
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
  status.value = "Creating guest";

  const wasFirstProfile = profiles.value.length === 0;
  const name = rawName.trim() || "Guest";
  const profile = createGuestRecord(name);
  let createdProfileId: string | null = null;

  try {
    store.add(profile);
    const storedGuest = store.getGuest();
    if (!storedGuest) {
      throw new Error("Guest account could not be created.");
    }
    if (storedGuest.id !== profile.id) {
      await openGuestProfile(storedGuest);
      return;
    }
    createdProfileId = storedGuest.id;
    if (wasFirstProfile) {
      await importGlobalDataIfNeeded(storedGuest.id);
    }

    store.setLastActive(storedGuest.id);
    setActiveProfileSession(sessionForGuest(storedGuest));
    emit("authenticated");
  } catch (error: unknown) {
    errorMessage.value = describeError(error);
  } finally {
    busy.value = false;
    status.value = "";
    refreshProfiles();
    if (createdProfileId && errorMessage.value) {
      selectedProfileId.value = createdProfileId;
      mode.value = "unlock";
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
  status.value = "";
  displayName.value = "Local Profile";
  mode.value = "create";
}

function showUnlockProfile(): void {
  errorMessage.value = "";
  status.value = "";
  mode.value = "unlock";
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
  status.value = "Unlocking";

  try {
    const session = await passkeys.unlockProfile(profile);
    await importGlobalDataIfNeeded(profile.id, session.encryptionKey);
    store.setLastActive(profile.id);
    setActiveProfileSession(session);
    emit("authenticated");
  } catch (error: unknown) {
    errorMessage.value = describeError(error);
  } finally {
    busy.value = false;
    status.value = "";
    refreshProfiles();
  }
}

async function openGuestProfile(profile: GuestProfileRecord): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  status.value = "Opening guest";

  try {
    await importGlobalDataIfNeeded(profile.id);
    store.setLastActive(profile.id);
    setActiveProfileSession(sessionForGuest(profile));
    emit("authenticated");
  } catch (error: unknown) {
    errorMessage.value = describeError(error);
  } finally {
    busy.value = false;
    status.value = "";
    refreshProfiles();
  }
}

function updateApp(): void {
  void serviceWorkerUpdateController.refresh();
}

onMounted(() => {
  refreshProfiles();
  if (profiles.value.length === 0) {
    void createDefaultGuestProfile();
    return;
  }

  const soleProfile = profiles.value.length === 1 ? profiles.value[0] : null;
  if (soleProfile?.authMode === "guest" && hasRegisteredAppUrlIntent(kernel)) {
    void openGuestProfile(soleProfile);
  }
});

onUnmounted(() => {
  store.dispose();
});
</script>

<template>
  <main
    class="auth-gate"
    :class="{ 'auth-gate--with-update': canUpdateApp }"
    :style="authGateStyle"
    aria-labelledby="auth-title"
  >
    <div v-if="canUpdateApp" class="auth-gate__update">
      <span class="auth-gate__update-copy" role="status" aria-atomic="true">
        {{ updateMessage }}
      </span>
      <Button
        class="auth-gate__update-button"
        variant="secondary"
        size="sm"
        type="button"
        :loading="isUpdatingApp"
        :icon-start="RefreshCw"
        @click="updateApp"
      >
        {{ updateButtonLabel }}
      </Button>
    </div>

    <div class="auth-gate__shell">
      <section class="auth-gate__surface" :aria-label="panelLabel">
        <div class="auth-gate__mark" aria-hidden="true">
          <Shield class="auth-gate__mark-icon" />
        </div>

        <p class="auth-gate__eyebrow">
          {{ isCreatingProfile ? "Local setup" : "Welcome back" }}
        </p>
        <h1 id="auth-title" class="auth-gate__title">
          {{ screenTitle }}
        </h1>
        <p class="auth-gate__subtitle">{{ screenSubtitle }}</p>

        <p v-if="!passkeyAvailable" class="auth-gate__alert" role="alert">
          Passkeys unavailable here. Guest still works.
        </p>

        <form v-if="isCreatingProfile" class="auth-gate__form" @submit.prevent="createProfile">
          <label class="auth-gate__field">
            <span class="auth-gate__label">Name</span>
            <input
              v-model="displayName"
              class="auth-gate__input"
              autocomplete="name"
              :disabled="busy"
              maxlength="40"
              type="text"
            />
          </label>

          <Button
            class="auth-gate__button"
            variant="primary"
            type="submit"
            :loading="busy"
            :disabled="!passkeyAvailable"
            :icon-start="Plus"
          >
            Create passkey
          </Button>

          <Button
            v-if="!guestProfile"
            class="auth-gate__button"
            variant="secondary"
            type="button"
            :loading="busy"
            :disabled="busy"
            :icon-start="CloudOff"
            @click="createGuestProfile"
          >
            Continue as guest
          </Button>

          <Button
            v-if="hasProfiles"
            class="auth-gate__button"
            variant="secondary"
            type="button"
            :disabled="busy"
            :icon-start="KeyRound"
            @click="showUnlockProfile"
          >
            Back to accounts
          </Button>
        </form>

        <div v-else class="auth-gate__profiles">
          <div v-if="showProfileList" class="auth-gate__profile-list" role="list">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              class="auth-gate__profile"
              :class="{ 'auth-gate__profile--selected': selectedProfileId === profile.id }"
              type="button"
              role="listitem"
              :disabled="busy"
              @click="selectedProfileId = profile.id"
            >
              <span class="auth-gate__profile-name">{{ profile.displayName }}</span>
              <span class="auth-gate__profile-meta">{{ profileMeta(profile) }}</span>
            </button>
          </div>

          <Button
            class="auth-gate__button"
            variant="primary"
            type="button"
            :loading="busy"
            :disabled="!canUnlockSelected"
            :icon-start="selectedProfile?.authMode === 'guest' ? CloudOff : KeyRound"
            @click="unlockSelected"
          >
            {{ unlockButtonLabel }}
          </Button>

          <Button
            class="auth-gate__button"
            variant="secondary"
            type="button"
            :disabled="busy || initialImportPending"
            :icon-start="Plus"
            @click="showCreateProfile"
          >
            {{ addAccountLabel }}
          </Button>
        </div>

        <p v-if="status" class="auth-gate__status" aria-live="polite">{{ status }}</p>
        <p v-if="errorMessage" class="auth-gate__alert" role="alert">{{ errorMessage }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
.auth-gate {
  background-color: var(--color-bg);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--color-fg);
  display: grid;
  min-block-size: 100vh;
  padding: clamp(var(--space-lg), 5vw, 56px);
  place-items: center;
  position: relative;
}

@supports (min-block-size: 100svh) {
  .auth-gate {
    min-block-size: 100svh;
  }
}

.auth-gate__shell {
  display: flex;
  inline-size: min(100%, 384px);
  justify-content: center;
}

.auth-gate__update {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: var(--radius-lg);
  display: flex;
  gap: var(--space-md);
  justify-self: end;
  padding: var(--space-sm) var(--space-md);
  position: absolute;
  right: clamp(var(--space-lg), 5vw, 56px);
  top: clamp(var(--space-lg), 5vw, 56px);
  z-index: 1;
}

.auth-gate__update-copy {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.auth-gate__update-button {
  min-block-size: 30px;
}

.auth-gate__surface {
  align-items: center;
  backdrop-filter: blur(28px) saturate(1.08);
  background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 56%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 60px color-mix(in srgb, black 24%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: min(100%, 384px);
  padding: 40px;
  text-align: center;
}

.auth-gate__mark {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 34%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent);
  border-radius: 999px;
  block-size: 52px;
  display: inline-flex;
  inline-size: 52px;
  justify-content: center;
  margin-block-end: var(--space-sm);
}

.auth-gate__mark-icon {
  block-size: 22px;
  color: var(--color-accent);
  inline-size: 22px;
}

.auth-gate__eyebrow {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.auth-gate__title {
  font-size: 44px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}

.auth-gate__subtitle {
  color: var(--color-fg-muted);
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.auth-gate__form,
.auth-gate__profiles {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: 100%;
  margin-block-start: var(--space-lg);
}

.auth-gate__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  text-align: start;
}

.auth-gate__label {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
}

.auth-gate__input {
  background: color-mix(in srgb, var(--color-bg) 52%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 64%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  font: inherit;
  min-block-size: 42px;
  padding: 0 var(--space-md);
}

.auth-gate__input:focus-visible {
  border-color: var(--color-accent);
  outline: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
  outline-offset: 2px;
}

.auth-gate__profile-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.auth-gate__profile {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg) 48%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  min-block-size: 46px;
  padding: 0 var(--space-md);
  text-align: start;
  transition:
    background-color var(--duration-fast) var(--ease),
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.auth-gate__profile:hover {
  background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
}

.auth-gate__profile--selected {
  background: color-mix(in srgb, var(--color-accent) 13%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 68%, var(--color-border));
  outline: 1px solid color-mix(in srgb, var(--color-accent) 42%, transparent);
  outline-offset: -2px;
}

.auth-gate__profile-name {
  font-size: 14px;
  font-weight: 650;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-gate__profile-meta {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 12px;
  white-space: nowrap;
}

.auth-gate__button {
  justify-content: center;
  min-block-size: 42px;
}

.auth-gate__status,
.auth-gate__alert {
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.auth-gate__status {
  color: var(--color-fg-muted);
}

.auth-gate__alert {
  color: var(--color-error);
}

@media (max-width: 760px) {
  .auth-gate {
    align-items: stretch;
    display: flex;
    flex-direction: column;
    isolation: isolate;
    justify-content: center;
    overflow-y: auto;
    padding: calc(env(safe-area-inset-top, 0px) + 40px)
      calc(env(safe-area-inset-right, 0px) + var(--space-lg))
      calc(env(safe-area-inset-bottom, 0px) + 40px)
      calc(env(safe-area-inset-left, 0px) + var(--space-lg));
    place-items: initial;
  }

  .auth-gate::before {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg) 76%, transparent) 0%,
      color-mix(in srgb, var(--color-bg) 58%, transparent) 52%,
      color-mix(in srgb, var(--color-bg) 82%, transparent) 100%
    );
    content: "";
    inset: 0;
    pointer-events: none;
    position: fixed;
    z-index: 0;
  }

  .auth-gate--with-update {
    padding-block-start: calc(env(safe-area-inset-top, 0px) + 96px);
  }

  .auth-gate__shell {
    align-items: center;
    display: flex;
    inline-size: 100%;
    justify-content: center;
    margin-inline: auto;
    max-inline-size: 420px;
    min-block-size: 100%;
    position: relative;
    z-index: 1;
  }

  .auth-gate__update {
    backdrop-filter: blur(18px) saturate(1.08);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 28px color-mix(in srgb, black 14%, transparent);
    gap: var(--space-sm);
    inline-size: auto;
    inset-block-start: calc(env(safe-area-inset-top, 0px) + var(--space-md));
    inset-inline-end: calc(env(safe-area-inset-right, 0px) + var(--space-lg));
    inset-inline-start: calc(env(safe-area-inset-left, 0px) + var(--space-lg));
    justify-content: space-between;
    min-block-size: 44px;
    padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-md);
    position: absolute;
    z-index: 2;
  }

  .auth-gate__update-copy {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .auth-gate__update-button {
    flex: 0 0 auto;
    min-block-size: 34px;
  }

  .auth-gate__surface {
    align-items: stretch;
    backdrop-filter: none;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    gap: var(--space-sm);
    inline-size: 100%;
    padding: 0;
    text-align: start;
  }

  .auth-gate__mark {
    align-self: flex-start;
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
    block-size: 44px;
    inline-size: 44px;
    margin-block-end: var(--space-md);
  }

  .auth-gate__mark-icon {
    block-size: 19px;
    inline-size: 19px;
  }

  .auth-gate__eyebrow {
    font-size: 10px;
  }

  .auth-gate__title {
    font-size: 34px;
    line-height: 1.08;
  }

  .auth-gate__subtitle {
    font-size: 14px;
    max-inline-size: 28rem;
  }

  .auth-gate__form,
  .auth-gate__profiles {
    gap: var(--space-md);
    margin-block-start: 28px;
  }

  .auth-gate__input,
  .auth-gate__button {
    min-block-size: 48px;
  }

  .auth-gate__input {
    background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
    backdrop-filter: blur(18px) saturate(1.08);
  }

  .auth-gate__profile-list {
    gap: var(--space-sm);
    max-block-size: 34dvh;
    overflow-y: auto;
    padding: 2px;
  }

  .auth-gate__profile {
    align-items: flex-start;
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
    flex-direction: column;
    gap: 2px;
    justify-content: center;
    min-block-size: 56px;
    padding: var(--space-sm) var(--space-md);
  }

  .auth-gate__profile-meta {
    white-space: normal;
  }

  .auth-gate__status,
  .auth-gate__alert {
    margin-block-start: var(--space-sm);
    text-align: start;
  }
}

@media (max-width: 360px) {
  .auth-gate__title {
    font-size: 30px;
  }
}
</style>
