<script setup vapor lang="ts">
import { Button, Input } from "~/components/ui";
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

const nameInputClassNames = { input: "auth-gate__input-control" } as const;
</script>

<template>
  <form class="auth-gate__form" @submit.prevent="emit('create-passkey')">
    <label class="auth-gate__field">
      <span class="auth-gate__label">Name</span>
      <Input
        :model-value="props.modelValue"
        class="auth-gate__input"
        :disabled="busy"
        type="text"
        :class-names="nameInputClassNames"
        :input-attrs="{ autocomplete: 'name', maxlength: 40 }"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </label>

    <Button
      class="auth-gate__button"
      variant="solid"
      color="blue"
      type="submit"
      :loading="busy"
      :disabled="!passkeyAvailable"
    >
      <template #left><Plus size="1em" aria-hidden="true" /></template>
      Create passkey
    </Button>

    <Button
      v-if="!hasGuestProfile"
      class="auth-gate__button"
      variant="surface"
      type="button"
      :loading="busy"
      :disabled="busy"
      @click="emit('create-guest')"
    >
      <template #left><CloudOff size="1em" aria-hidden="true" /></template>
      Continue as guest
    </Button>

    <Button
      v-if="hasProfiles"
      class="auth-gate__button"
      variant="surface"
      type="button"
      :disabled="busy"
      @click="emit('back')"
    >
      <template #left><KeyRound size="1em" aria-hidden="true" /></template>
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

.auth-gate__input-control {
  background: color-mix(in srgb, var(--color-bg) 52%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-border) 64%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  font: inherit;
  min-block-size: 42px;
  padding: 0 var(--space-md);
}

.auth-gate__input-control:focus-visible {
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

  .auth-gate__input-control {
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 58%, transparent);
  }
}
</style>
