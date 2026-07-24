<script setup vapor lang="ts">
import { Button } from "~/components/ui";
import AlertCircle from "~icons/lucide/alert-circle";
import Loader2 from "~icons/lucide/loader-2";
import RefreshCw from "~icons/lucide/refresh-cw";

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
    class="blocking-update"
    :aria-busy="!failed"
    :aria-live="failed ? undefined : 'polite'"
    :role="failed ? 'alert' : 'status'"
  >
    <div class="blocking-update__surface">
      <div class="blocking-update__mark" :class="{ 'blocking-update__mark--failed': failed }">
        <AlertCircle v-if="failed" class="blocking-update__icon" aria-hidden="true" />
        <Loader2
          v-else
          class="blocking-update__icon blocking-update__icon--spin"
          aria-hidden="true"
        />
      </div>

      <p class="blocking-update__eyebrow">
        {{ failed ? "Update failed" : "Updating" }}
      </p>
      <h1 :id="titleId" class="blocking-update__title">
        {{ failed ? "Update couldn't finish" : "Updating WebOS" }}
      </h1>
      <p class="blocking-update__subtitle">
        {{
          failed
            ? errorMessage || "Try again when you're back online."
            : "Applying the newest web version."
        }}
      </p>

      <Button
        v-if="failed"
        class="blocking-update__retry"
        variant="solid"
        color="blue"
        type="button"
        @click="emit('retry')"
      >
        <template #left><RefreshCw aria-hidden="true" /></template>
        Retry update
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.blocking-update {
  align-items: center;
  color: var(--color-fg);
  display: grid;
  inline-size: min(100%, 420px);
  justify-self: center;
  place-items: center;
}

.blocking-update__surface {
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

.blocking-update__mark {
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

.blocking-update__mark--failed {
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-bg));
  border-color: color-mix(in srgb, var(--color-error) 32%, var(--color-border));
}

.blocking-update__icon {
  block-size: 22px;
  color: var(--color-accent);
  inline-size: 22px;
}

.blocking-update__mark--failed .blocking-update__icon {
  color: var(--color-error);
}

.blocking-update__icon--spin {
  animation: blocking-update-spin 1s linear infinite;
}

.blocking-update__eyebrow {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.blocking-update__title {
  font-size: 44px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}

.blocking-update__subtitle {
  color: var(--color-fg-muted);
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.blocking-update__retry {
  inline-size: 100%;
  margin-block-start: var(--space-lg);
}

@keyframes blocking-update-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .blocking-update {
    align-items: stretch;
    inline-size: 100%;
    max-inline-size: 420px;
    position: relative;
    z-index: 1;
  }

  .blocking-update__surface {
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

  .blocking-update__mark {
    align-self: flex-start;
    backdrop-filter: blur(18px) saturate(1.08);
    background: color-mix(in srgb, var(--color-bg-elevated) 54%, transparent);
    block-size: 44px;
    inline-size: 44px;
    margin-block-end: var(--space-md);
  }

  .blocking-update__icon {
    block-size: 19px;
    inline-size: 19px;
  }

  .blocking-update__eyebrow {
    font-size: 10px;
  }

  .blocking-update__title {
    font-size: 34px;
    line-height: 1.08;
  }

  .blocking-update__subtitle {
    font-size: 14px;
    max-inline-size: 28rem;
  }

  .blocking-update__retry {
    margin-block-start: 28px;
  }
}

@media (max-width: 360px) {
  .blocking-update__title {
    font-size: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blocking-update__icon--spin {
    animation: none;
  }
}
</style>
