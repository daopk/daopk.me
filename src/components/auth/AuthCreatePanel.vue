<script setup lang="ts">
import { Button } from "~/components/ui";
import { CloudOff, KeyRound, Plus } from "~/icons/lucide";

const props = defineProps<{
  modelValue: string;
  busy: boolean;
  passkeyAvailable: boolean;
  hasProfiles: boolean;
  hasGuestProfile: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [next: string];
  "create-passkey": [];
  "create-guest": [];
  back: [];
}>();

function updateName(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <form class="auth-gate__form" @submit.prevent="emit('create-passkey')">
    <label class="auth-gate__field">
      <span class="auth-gate__label">Name</span>
      <input
        :value="props.modelValue"
        class="auth-gate__input"
        autocomplete="name"
        :disabled="busy"
        maxlength="40"
        type="text"
        @input="updateName"
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
      v-if="!hasGuestProfile"
      class="auth-gate__button"
      variant="secondary"
      type="button"
      :loading="busy"
      :disabled="busy"
      :icon-start="CloudOff"
      @click="emit('create-guest')"
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
      @click="emit('back')"
    >
      Back to accounts
    </Button>
  </form>
</template>

<style scoped lang="scss">
.auth-gate__form {
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

.auth-gate__button {
  justify-content: center;
  min-block-size: 42px;
}

@media (max-width: 760px) {
  .auth-gate__form {
    gap: var(--space-md);
    margin-block-start: 28px;
  }

  .auth-gate__input,
  .auth-gate__button {
    min-block-size: 48px;
  }

  .auth-gate__input {
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  }
}
</style>
