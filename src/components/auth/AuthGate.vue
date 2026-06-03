<script setup lang="ts">
import AuthCreatePanel from "./AuthCreatePanel.vue";
import AuthGateSurface from "./AuthGateSurface.vue";
import AuthUnlockPanel from "./AuthUnlockPanel.vue";
import AuthUpdateBanner from "./AuthUpdateBanner.vue";
import { useAuthGate } from "./useAuthGate";

const emit = defineEmits<{
  authenticated: [];
}>();

const {
  addAccountLabel,
  authGateStyle,
  busy,
  canUnlockSelected,
  canUpdateApp,
  createGuestProfile,
  createProfile,
  displayName,
  errorMessage,
  hasGuestProfile,
  hasProfiles,
  initialImportPending,
  isCreatingProfile,
  isUpdatingApp,
  panelEyebrow,
  panelLabel,
  passkeyAvailable,
  profiles,
  screenSubtitle,
  screenTitle,
  selectProfile,
  selectedProfile,
  selectedProfileId,
  showCreateProfile,
  showProfileList,
  showUnlockProfile,
  status,
  unlockButtonLabel,
  unlockSelected,
  updateApp,
  updateButtonLabel,
  updateMessage,
} = useAuthGate({
  onAuthenticated: () => emit("authenticated"),
});
</script>

<template>
  <main
    class="auth-gate"
    :class="{ 'auth-gate--with-update': canUpdateApp }"
    :style="authGateStyle"
    aria-labelledby="auth-title"
  >
    <AuthUpdateBanner
      v-if="canUpdateApp"
      :message="updateMessage"
      :button-label="updateButtonLabel"
      :loading="isUpdatingApp"
      @update="updateApp"
    />

    <div class="auth-gate__shell">
      <AuthGateSurface
        :label="panelLabel"
        :eyebrow="panelEyebrow"
        :title="screenTitle"
        :subtitle="screenSubtitle"
        :passkey-available="passkeyAvailable"
        :status="status"
        :error-message="errorMessage"
      >
        <AuthCreatePanel
          v-if="isCreatingProfile"
          v-model="displayName"
          :busy="busy"
          :passkey-available="passkeyAvailable"
          :has-profiles="hasProfiles"
          :has-guest-profile="hasGuestProfile"
          @create-passkey="createProfile"
          @create-guest="createGuestProfile"
          @back="showUnlockProfile"
        />

        <AuthUnlockPanel
          v-else
          :profiles="profiles"
          :selected-profile-id="selectedProfileId"
          :selected-profile="selectedProfile"
          :busy="busy"
          :can-unlock-selected="canUnlockSelected"
          :show-profile-list="showProfileList"
          :unlock-button-label="unlockButtonLabel"
          :add-account-label="addAccountLabel"
          :initial-import-pending="initialImportPending"
          @select-profile="selectProfile"
          @unlock="unlockSelected"
          @add-account="showCreateProfile"
        />
      </AuthGateSurface>
    </div>
  </main>
</template>

<style scoped lang="scss">
.auth-gate {
  background-color: var(--color-bg);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  block-size: 100vh;
  color: var(--color-fg);
  display: grid;
  padding: clamp(var(--space-lg), 5vw, 56px);
  place-items: center;
  position: relative;
}

.auth-gate__shell {
  display: flex;
  inline-size: min(100%, 384px);
  justify-content: center;
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
}
</style>
