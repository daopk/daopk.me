<script setup vapor lang="ts">
/**
 * Account section.
 *
 * Local account management surface for the active passkey-backed profile.
 * Lock is intentionally soft: it keeps running app state in memory and
 * renders the shell-level lock overlay. Sign out is the destructive path that
 * closes apps and reloads into AuthGate.
 */

import { computed, ref } from "vue";

import { Panel, SectionHeader, StatusBanner, TextInput } from "~/components/kit";
import { Button, Dialog } from "~/components/ui";
import { useSettingsI18n } from "~/apps/settings/i18n/useSettingsI18n";
import { useKernel } from "~/composables/useKernel";
import { AlertCircle, CloudOff, KeyRound, Lock, LogOut, Shield, Trash2 } from "~/icons/lucide";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const { t } = useSettingsI18n();
const profile = kernel.profile.current();
const deleteDialogOpen = ref(false);
const deleteConfirmationText = ref("");
const deletingAccount = ref(false);
const deleteError = ref("");

const protectionLabel = computed(() => {
  if (profile.authMode === "guest") {
    return t("settings.account.guestAccount");
  }
  return profile.encrypted
    ? t("settings.account.encryptedProfile")
    : t("settings.account.passkeyProtected");
});
const storageLabel = computed(() =>
  profile.authMode === "guest"
    ? t("settings.account.guestStorage")
    : t("settings.account.browserStorage"),
);
const canConfirmDelete = computed(() => deleteConfirmationText.value === profile.displayName);
const deleteDialogDescription = computed(() =>
  t("settings.account.deleteDialogDescription", { name: profile.displayName }),
);

function lockSession(): void {
  void kernel.profile.lock();
}

function signOut(): void {
  void kernel.profile.signOut();
}

function describeDeleteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return t("settings.account.deleteFailed");
}

function requestDeleteAccount(): void {
  deleteConfirmationText.value = "";
  deleteError.value = "";
  deleteDialogOpen.value = true;
}

function cancelDeleteAccount(): void {
  if (deletingAccount.value) {
    return;
  }
  deleteDialogOpen.value = false;
  deleteConfirmationText.value = "";
  deleteError.value = "";
}

async function confirmDeleteAccount(): Promise<void> {
  if (!canConfirmDelete.value || deletingAccount.value) {
    return;
  }

  deletingAccount.value = true;
  deleteError.value = "";

  try {
    await kernel.profile.deleteCurrentAccount();
  } catch (error: unknown) {
    deleteError.value = describeDeleteError(error);
    deletingAccount.value = false;
  }
}
</script>

<template>
  <article class="account" :aria-label="t('settings.account.ariaLabel')">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      :title="t('settings.account.title')"
      :subtitle="t('settings.account.subtitle')"
    />

    <Panel
      as="section"
      class="account__summary"
      variant="elevated"
      padding="none"
      aria-labelledby="account-current-title"
    >
      <div class="account__avatar" aria-hidden="true">
        <Shield class="account__avatar-icon" />
      </div>

      <div class="account__identity">
        <h3 id="account-current-title" class="account__name">{{ profile.displayName }}</h3>
        <p class="account__meta">{{ profile.profileId }}</p>
      </div>

      <div class="account__actions">
        <Button
          class="account__action"
          variant="secondary"
          type="button"
          :icon-start="Lock"
          @click="lockSession"
        >
          {{ t("settings.account.lockSession") }}
        </Button>
        <Button
          class="account__action"
          variant="primary"
          type="button"
          :icon-start="LogOut"
          @click="signOut"
        >
          {{ t("settings.account.signOut") }}
        </Button>
      </div>
    </Panel>

    <Panel
      as="dl"
      class="account__facts"
      variant="plain"
      padding="none"
      :aria-label="t('settings.account.currentDetails')"
    >
      <Panel as="div" class="account__fact" variant="elevated" padding="none">
        <dt class="account__fact-label">
          <KeyRound class="account__fact-icon" aria-hidden="true" />
          {{ t("settings.account.protection") }}
        </dt>
        <dd class="account__fact-value">{{ protectionLabel }}</dd>
      </Panel>

      <Panel as="div" class="account__fact" variant="elevated" padding="none">
        <dt class="account__fact-label">
          <CloudOff class="account__fact-icon" aria-hidden="true" />
          {{ t("settings.account.storage") }}
        </dt>
        <dd class="account__fact-value">{{ storageLabel }}</dd>
      </Panel>
    </Panel>

    <Panel
      as="section"
      class="account__danger"
      variant="elevated"
      padding="none"
      aria-labelledby="account-danger-title"
    >
      <div class="account__danger-copy">
        <h3 id="account-danger-title" class="account__danger-title">
          {{ t("settings.account.deleteTitle") }}
        </h3>
        <p class="account__danger-text">
          {{ t("settings.account.deleteCopy") }}
        </p>
      </div>
      <Button
        class="account__danger-button"
        variant="danger"
        type="button"
        :icon-start="Trash2"
        @click="requestDeleteAccount"
      >
        {{ t("settings.account.deleteButton") }}
      </Button>
    </Panel>

    <Dialog
      v-model:open="deleteDialogOpen"
      :title="t('settings.account.deleteDialogTitle')"
      :description="deleteDialogDescription"
      :dismissible="!deletingAccount"
      @close="cancelDeleteAccount"
    >
      <div class="account__delete-dialog">
        <StatusBanner as="p" class="account__delete-warning" tone="warning" role="alert">
          <AlertCircle class="account__delete-warning-icon" aria-hidden="true" />
          {{ t("settings.account.deleteWarning") }}
        </StatusBanner>

        <label class="account__delete-field">
          <span class="account__delete-label">
            {{ t("settings.account.deleteConfirmLabel", { name: profile.displayName }) }}
          </span>
          <TextInput
            v-model="deleteConfirmationText"
            class="account__delete-input"
            autocomplete="off"
            :disabled="deletingAccount"
            :spellcheck="false"
            type="text"
          />
        </label>

        <StatusBanner
          v-if="deleteError"
          as="p"
          class="account__delete-error"
          tone="error"
          role="alert"
        >
          {{ deleteError }}
        </StatusBanner>

        <div class="account__dialog-actions">
          <Button size="sm" :disabled="deletingAccount" @click="cancelDeleteAccount">
            {{ t("settings.account.cancel") }}
          </Button>
          <Button
            size="sm"
            class="account__danger-button"
            variant="danger"
            :disabled="!canConfirmDelete"
            :icon-start="Trash2"
            :loading="deletingAccount"
            @click="confirmDeleteAccount"
          >
            {{ t("settings.account.deleteConfirmButton") }}
          </Button>
        </div>
      </div>
    </Dialog>
  </article>
</template>

<style scoped lang="scss">
.account {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.account__summary {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-md);
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: var(--space-lg);
}

.account__avatar {
  align-items: center;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 36%, transparent);
  border-radius: var(--radius-md);
  block-size: 48px;
  display: inline-flex;
  inline-size: 48px;
  justify-content: center;
}

.account__avatar-icon {
  block-size: 24px;
  color: var(--color-accent);
  inline-size: 24px;
}

.account__identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.account__name {
  font-size: 16px;
  font-weight: 650;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account__meta {
  color: var(--color-fg-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  margin: 0;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.account__actions {
  display: inline-grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(2, max-content);
  justify-content: end;
}

.account__action {
  justify-content: center;
  min-block-size: 36px;
  white-space: nowrap;
}

.account__facts {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.account__fact {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: var(--space-md);
}

.account__fact-label {
  align-items: center;
  color: var(--color-fg-muted);
  display: flex;
  font-size: 12px;
  font-weight: 700;
  gap: var(--space-xs);
  text-transform: uppercase;
}

.account__fact-icon {
  block-size: 14px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 14px;
}

.account__fact-value {
  color: var(--color-fg);
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.account__danger {
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--color-error-soft) 40%, var(--color-border));
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  padding: var(--space-md);
}

.account__danger-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.account__danger-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
}

.account__danger-text {
  color: var(--color-fg-muted);
  font-size: 13px;
  line-height: 1.4;
  margin: 0;
}

.account__danger-button {
  color: var(--color-error-soft);
  flex: 0 0 auto;
}

.account__delete-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.account__delete-warning {
  align-items: flex-start;
  background: color-mix(in srgb, var(--color-error-soft) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error-soft) 30%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: flex;
  font-size: 13px;
  gap: var(--space-sm);
  line-height: 1.5;
  margin: 0;
  padding: var(--space-md);
}

.account__delete-warning-icon {
  block-size: 16px;
  color: var(--color-error-soft);
  flex: 0 0 auto;
  inline-size: 16px;
  margin-block-start: 1px;
}

.account__delete-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.account__delete-label {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
}

.account__delete-input {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  font: inherit;
  min-block-size: 38px;
  padding: 0 var(--space-md);
}

.account__delete-input:focus-visible {
  border-color: var(--color-error-soft);
  outline: 2px solid color-mix(in srgb, var(--color-error-soft) 30%, transparent);
  outline-offset: 2px;
}

.account__delete-error {
  color: var(--color-error-soft);
  font-size: 13px;
  line-height: 1.4;
  margin: 0;
}

.account__dialog-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .account {
    padding: var(--space-lg);
  }

  .account__summary,
  .account__facts {
    grid-template-columns: 1fr;
  }

  .account__summary {
    align-items: stretch;
  }

  .account__actions {
    grid-template-columns: 1fr;
    inline-size: 100%;
  }

  .account__action,
  .account__danger-button {
    inline-size: 100%;
  }

  .account__danger,
  .account__dialog-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
