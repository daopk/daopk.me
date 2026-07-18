<script setup vapor lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { Modal, type ModalFocusTrapOptions } from "ropav/modal";

import { Button } from "~/components/ui";
import { useActiveShell } from "~/composables/useActiveShell";
import AuthAutoUpdateScreen from "~/components/auth/AuthAutoUpdateScreen.vue";
import { PasskeyService, ProfileAuthError } from "~/core/profile/PasskeyService";
import { ProfileStore } from "~/core/profile/ProfileStore";
import {
  DEFAULT_WALLPAPER_DESKTOP_URL,
  DEFAULT_WALLPAPER_MOBILE_URL,
} from "~/core/theme/wallpapers";
import { useKernel } from "~/composables/useKernel";
import Lock from "~icons/lucide/lock";
import LogOut from "~icons/lucide/log-out";
import Unlock from "~icons/lucide/unlock";

import { useAuthAutoUpdate } from "./useAuthAutoUpdate";

const kernel = useKernel();
const locked = kernel.profile.useLocked();
const profile = kernel.profile.current();
const { shellId } = useActiveShell();
const store = new ProfileStore();
const passkeys = new PasskeyService();
const autoUpdate = useAuthAutoUpdate(computed(() => locked.value));

const busy = ref(false);
const errorMessage = ref("");

const isGuest = computed(() => profile.authMode === "guest");
const unlockLabel = computed(() => (isGuest.value ? "Unlock Guest" : "Unlock Desktop"));
const subtitle = computed(() =>
  isGuest.value ? "Guest session" : profile.encrypted ? "Passkey required" : "Passkey protected",
);
const lockScreenStyle = computed<Record<string, string>>(() => ({
  backgroundImage: [
    "linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 34%, transparent) 0%, color-mix(in srgb, var(--color-bg) 72%, transparent) 100%)",
    `url("${
      shellId.value === "mobile" ? DEFAULT_WALLPAPER_MOBILE_URL : DEFAULT_WALLPAPER_DESKTOP_URL
    }")`,
  ].join(", "),
}));
const dialogLabel = computed(() =>
  autoUpdate.visible.value ? "Updating WebOS" : `Session locked for ${profile.displayName}`,
);

const SESSION_LOCK_CONTENT_BASE_Z_INDEX = 1800;
const focusTrapOptions: ModalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" },
};
const modalClassNames = {
  root: "session-lock",
  overlay: "session-lock__overlay",
  panel: "session-lock__modal-panel",
  body: "session-lock__modal-body",
};
const modalStyles = computed(() => ({ root: lockScreenStyle.value }));

function describeError(error: unknown): string {
  if (error instanceof ProfileAuthError || error instanceof Error) {
    return error.message;
  }
  return "Unlock failed.";
}

async function unlockDesktop(): Promise<void> {
  if (busy.value || !locked.value) {
    return;
  }

  if (isGuest.value) {
    kernel.profile.unlock();
    return;
  }

  if (!passkeys.isAvailable()) {
    errorMessage.value = "Passkeys are not available in this browser context.";
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    const record = store.get(profile.profileId);
    if (!record || record.authMode !== "passkey") {
      throw new Error("This profile could not be found.");
    }
    const session = await passkeys.unlockProfile(record);
    kernel.profile.unlock(session);
  } catch (error: unknown) {
    errorMessage.value = describeError(error);
  } finally {
    busy.value = false;
  }
}

function signOut(): void {
  void kernel.profile.signOut();
}

onUnmounted(() => {
  store.dispose();
});
</script>

<template>
  <Modal
    :open="locked"
    :aria-label="dialogLabel"
    size="100%"
    :base-z-index="SESSION_LOCK_CONTENT_BASE_Z_INDEX"
    teleport-to="body"
    :close-on-overlay-click="false"
    :close-on-escape="false"
    :show-close-button="false"
    initial-focus=".session-lock__unlock, .auth-auto-update__retry"
    :focus-trap-options="focusTrapOptions"
    :overlay-props="{ color: 'transparent' }"
    :class-names="modalClassNames"
    :styles="modalStyles"
  >
    <AuthAutoUpdateScreen
      v-if="autoUpdate.visible.value"
      title-id="session-lock-title"
      :failed="autoUpdate.failed.value"
      :error-message="autoUpdate.errorMessage.value"
      @retry="autoUpdate.retry"
    />

    <div v-else class="session-lock__surface">
      <div class="session-lock__mark" aria-hidden="true">
        <Lock class="session-lock__mark-icon" />
      </div>

      <p class="session-lock__eyebrow">Locked</p>
      <h2 id="session-lock-title" class="session-lock__title">{{ profile.displayName }}</h2>
      <p class="session-lock__subtitle">{{ subtitle }}</p>

      <p v-if="errorMessage" class="session-lock__error" role="alert">{{ errorMessage }}</p>

      <form class="session-lock__actions" @submit.prevent="unlockDesktop">
        <Button
          class="session-lock__button session-lock__unlock"
          variant="solid"
          color="blue"
          type="submit"
          :loading="busy"
        >
          <template #left><Unlock aria-hidden="true" /></template>
          {{ unlockLabel }}
        </Button>
        <Button
          class="session-lock__button"
          variant="surface"
          type="button"
          :disabled="busy"
          @click="signOut"
        >
          <template #left><LogOut aria-hidden="true" /></template>
          Sign Out
        </Button>
      </form>
    </div>
  </Modal>
</template>

<style lang="scss">
.session-lock {
  align-items: center;
  background-color: var(--color-bg);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  color: var(--color-fg);
  display: grid;
  inset: 0;
  justify-content: center;
  min-block-size: 100dvh;
  padding: clamp(var(--space-lg), 5vw, 56px);
  place-items: center;
  position: fixed;
  z-index: calc(var(--context-menu-z) + 100);
}

.session-lock__modal-panel {
  background: transparent;
  block-size: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  inline-size: 100%;
  max-block-size: 100%;
}

.session-lock__modal-body {
  align-items: center;
  display: grid;
  flex: 1 1 auto;
  justify-content: center;
  min-block-size: 0;
  overflow-y: auto;
  padding: 0;
  place-items: center;
}

.session-lock__surface {
  align-items: center;
  backdrop-filter: blur(28px) saturate(1.08);
  background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 56%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 60px color-mix(in srgb, black 24%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: min(384px, 100%);
  padding: 40px;
  text-align: center;
}

.session-lock__mark {
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

.session-lock__mark-icon {
  block-size: 22px;
  color: var(--color-accent);
  inline-size: 22px;
}

.session-lock__eyebrow {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.session-lock__title {
  font-size: 44px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}

.session-lock__subtitle {
  color: var(--color-fg-muted);
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.session-lock__error {
  color: var(--color-error);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.session-lock__actions {
  display: grid;
  gap: var(--space-xs);
  inline-size: 100%;
  margin-block-start: var(--space-lg);
}

.session-lock__button {
  justify-content: center;
  min-block-size: 42px;
}

@media (max-width: 760px) {
  .session-lock {
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

  .session-lock::before {
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

  .session-lock__surface {
    align-items: stretch;
    backdrop-filter: none;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    inline-size: 100%;
    margin-inline: auto;
    max-inline-size: 420px;
    padding: 0;
    position: relative;
    text-align: start;
    z-index: 1;
  }

  .session-lock__mark {
    align-self: flex-start;
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
    block-size: 44px;
    inline-size: 44px;
    margin-block-end: var(--space-md);
  }

  .session-lock__mark-icon {
    block-size: 19px;
    inline-size: 19px;
  }

  .session-lock__eyebrow {
    font-size: 10px;
  }

  .session-lock__title {
    font-size: 34px;
    line-height: 1.08;
  }

  .session-lock__subtitle {
    font-size: 14px;
  }

  .session-lock__error {
    margin-block-start: var(--space-sm);
    text-align: start;
  }

  .session-lock__actions {
    gap: var(--space-md);
    margin-block-start: 28px;
  }

  .session-lock__button {
    min-block-size: 48px;
  }
}

@media (max-width: 360px) {
  .session-lock__title {
    font-size: 30px;
  }
}
</style>
