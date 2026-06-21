<script setup lang="ts">
import { Shield } from "~/icons/lucide";

defineProps<{
  label: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  passkeyAvailable: boolean;
  errorMessage: string;
}>();
</script>

<template>
  <section class="auth-gate__surface" :aria-label="label">
    <div class="auth-gate__mark" aria-hidden="true">
      <Shield class="auth-gate__mark-icon" />
    </div>

    <p class="auth-gate__eyebrow">
      {{ eyebrow }}
    </p>
    <h1 id="auth-title" class="auth-gate__title">
      {{ title }}
    </h1>
    <p class="auth-gate__subtitle">{{ subtitle }}</p>

    <p v-if="!passkeyAvailable" class="auth-gate__alert" role="alert">
      Passkeys unavailable here. Guest still works.
    </p>

    <slot />

    <p v-if="errorMessage" class="auth-gate__alert" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<style scoped lang="scss">
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

.auth-gate__alert {
  color: var(--color-error);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

@media (max-width: 760px) {
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
