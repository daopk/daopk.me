<script setup vapor lang="ts">
import { Button } from "~/components/ui";
import { AlertCircle, Loader2, RefreshCw } from "~/icons/lucide";

defineProps<{
  failed: boolean;
  errorMessage: string;
  titleId: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <section
    class="auth-auto-update"
    :aria-busy="!failed"
    :aria-live="failed ? undefined : 'polite'"
    :role="failed ? 'alert' : 'status'"
  >
    <div class="auth-auto-update__surface">
      <div class="auth-auto-update__mark" :class="{ 'auth-auto-update__mark--failed': failed }">
        <AlertCircle v-if="failed" class="auth-auto-update__icon" aria-hidden="true" />
        <Loader2
          v-else
          class="auth-auto-update__icon auth-auto-update__icon--spin"
          aria-hidden="true"
        />
      </div>

      <p class="auth-auto-update__eyebrow">
        {{ failed ? "Update failed" : "Updating" }}
      </p>
      <h1 :id="titleId" class="auth-auto-update__title">
        {{ failed ? "Update couldn't finish" : "Updating WebOS" }}
      </h1>
      <p class="auth-auto-update__subtitle">
        {{
          failed
            ? errorMessage || "Try again when you're back online."
            : "Applying the newest web version."
        }}
      </p>

      <Button
        v-if="failed"
        class="auth-auto-update__retry"
        variant="solid"
        color="blue"
        type="button"
        @click="emit('retry')"
      >
        <template #left><RefreshCw size="1em" aria-hidden="true" /></template>
        Retry update
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.auth-auto-update {
  align-items: center;
  color: var(--color-fg);
  display: grid;
  inline-size: min(100%, 420px);
  justify-self: center;
  place-items: center;
}

.auth-auto-update__surface {
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

.auth-auto-update__mark {
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

.auth-auto-update__mark--failed {
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-bg));
  border-color: color-mix(in srgb, var(--color-error) 32%, var(--color-border));
}

.auth-auto-update__icon {
  block-size: 22px;
  color: var(--color-accent);
  inline-size: 22px;
}

.auth-auto-update__mark--failed .auth-auto-update__icon {
  color: var(--color-error);
}

.auth-auto-update__icon--spin {
  animation: auth-auto-update-spin 1s linear infinite;
}

.auth-auto-update__eyebrow {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.auth-auto-update__title {
  font-size: 44px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}

.auth-auto-update__subtitle {
  color: var(--color-fg-muted);
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.auth-auto-update__retry {
  inline-size: 100%;
  margin-block-start: var(--space-lg);
}

@keyframes auth-auto-update-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .auth-auto-update {
    align-items: stretch;
    inline-size: 100%;
    max-inline-size: 420px;
    position: relative;
    z-index: 1;
  }

  .auth-auto-update__surface {
    align-items: stretch;
    backdrop-filter: none;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    inline-size: 100%;
    padding: 0;
    text-align: start;
  }

  .auth-auto-update__mark {
    align-self: flex-start;
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
    block-size: 44px;
    inline-size: 44px;
    margin-block-end: var(--space-md);
  }

  .auth-auto-update__icon {
    block-size: 19px;
    inline-size: 19px;
  }

  .auth-auto-update__eyebrow {
    font-size: 10px;
  }

  .auth-auto-update__title {
    font-size: 34px;
    line-height: 1.08;
  }

  .auth-auto-update__subtitle {
    font-size: 14px;
    max-inline-size: 28rem;
  }

  .auth-auto-update__retry {
    margin-block-start: 28px;
  }
}

@media (max-width: 360px) {
  .auth-auto-update__title {
    font-size: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-auto-update__icon--spin {
    animation: none;
  }
}
</style>
