<script setup vapor lang="ts">
import { Button, Radio, RadioGroup, ScrollArea } from "~/components/ui";
import CloudOff from "~icons/lucide/cloud-off";
import KeyRound from "~icons/lucide/key-round";
import Plus from "~icons/lucide/plus";
import type { ProfileRecord } from "~/types/profile";

import { profileMeta } from "./authGateLabels";

defineProps<{
  profiles: ProfileRecord[];
  selectedProfileId: string | null;
  selectedProfile: ProfileRecord | null;
  busy: boolean;
  canUnlockSelected: boolean;
  showProfileList: boolean;
  unlockButtonLabel: string;
  addAccountLabel: string;
  initialImportPending: boolean;
}>();

const emit = defineEmits<{
  "select-profile": [profileId: string];
  unlock: [];
  "add-account": [];
}>();

const profileRadioClassNames = {
  indicator: "auth-gate__profile-indicator",
  label: "auth-gate__profile-label",
} as const;

function selectProfile(value: string | number | null): void {
  if (value === null) return;
  emit("select-profile", String(value));
}
</script>

<template>
  <div class="auth-gate__profiles">
    <ScrollArea v-if="showProfileList" class="auth-gate__profile-list" scrollbars="y">
      <RadioGroup
        class="auth-gate__profile-options"
        :model-value="selectedProfileId"
        aria-label="Profiles"
        :disabled="busy"
        @update:model-value="selectProfile"
      >
        <Radio
          v-for="profile in profiles"
          :key="profile.id"
          class="auth-gate__profile"
          :class="{ 'auth-gate__profile--selected': selectedProfileId === profile.id }"
          :value="profile.id"
          :class-names="profileRadioClassNames"
        >
          <span class="auth-gate__profile-name">{{ profile.displayName }}</span>
          <span class="auth-gate__profile-meta">{{ profileMeta(profile) }}</span>
        </Radio>
      </RadioGroup>
    </ScrollArea>

    <Button
      class="auth-gate__button"
      variant="solid"
      color="blue"
      type="button"
      :loading="busy"
      :disabled="!canUnlockSelected"
      @click="emit('unlock')"
    >
      <template #left>
        <component
          :is="selectedProfile?.authMode === 'guest' ? CloudOff : KeyRound"
          aria-hidden="true"
        />
      </template>
      {{ unlockButtonLabel }}
    </Button>

    <Button
      class="auth-gate__button"
      variant="surface"
      type="button"
      :disabled="busy || initialImportPending"
      @click="emit('add-account')"
    >
      <template #left><Plus aria-hidden="true" /></template>
      {{ addAccountLabel }}
    </Button>
  </div>
</template>

<style scoped lang="scss">
.auth-gate__profiles {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  inline-size: 100%;
  margin-block-start: var(--space-lg);
}

.auth-gate__profile-list {
  inline-size: 100%;
}

.auth-gate__profile-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

:deep(.auth-gate__profile-indicator) {
  display: none;
}

:deep(.auth-gate__profile-label) {
  display: contents;
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

.auth-gate__profile:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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

@media (max-width: 760px) {
  .auth-gate__profiles {
    gap: var(--space-md);
    margin-block-start: 28px;
  }

  .auth-gate__button {
    min-block-size: 48px;
  }

  .auth-gate__profile-list {
    max-block-size: 34dvh;
    padding: 2px;
  }

  .auth-gate__profile-options {
    gap: var(--space-sm);
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
}
</style>
