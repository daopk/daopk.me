<script setup vapor lang="ts">
import type { ShellId } from "~/types/shell";

defineProps<{
  readonly shellId: ShellId;
  readonly previewStyle: Record<string, string>;
  readonly wallpaperEffectStyle: Record<string, string>;
}>();
</script>

<template>
  <div class="background__preview background__stage" :data-shell="shellId" aria-hidden="true">
    <span class="background__stage-wallpaper" :style="[previewStyle, wallpaperEffectStyle]" />
    <span v-if="shellId === 'desktop'" class="background__stage-menubar">
      <span class="background__stage-dot" />
      <span class="background__stage-line background__stage-line--short" />
      <span class="background__stage-line" />
    </span>
    <span v-if="shellId === 'desktop'" class="background__stage-window">
      <span class="background__stage-titlebar">
        <span class="background__stage-control" />
        <span class="background__stage-control" />
        <span class="background__stage-control" />
      </span>
      <span class="background__stage-window-body">
        <span class="background__stage-row background__stage-row--wide" />
        <span class="background__stage-row" />
        <span class="background__stage-row background__stage-row--short" />
      </span>
    </span>
    <span v-else class="background__stage-phone">
      <span class="background__stage-mobile-status">
        <span class="background__stage-mobile-pill" />
        <span class="background__stage-mobile-dot" />
        <span class="background__stage-mobile-dot" />
      </span>
      <span class="background__stage-mobile-grid">
        <span v-for="i in 9" :key="i" class="background__stage-mobile-icon" />
      </span>
      <span class="background__stage-mobile-indicator" />
    </span>
    <span v-if="shellId === 'desktop'" class="background__stage-dock">
      <span />
      <span />
      <span />
      <span />
    </span>
  </div>
</template>

<style scoped lang="scss">
.background__stage {
  background: var(--color-bg);
  block-size: 320px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  position: relative;
}

.background__stage-wallpaper {
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.background__stage-menubar {
  align-items: center;
  background: var(--menubar-bg-translucent, color-mix(in srgb, var(--color-bg) 70%, transparent));
  backdrop-filter: blur(var(--menubar-blur, 12px));
  border-block-end: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  display: flex;
  gap: var(--space-sm);
  inset-block-start: 0;
  inset-inline: 0;
  min-block-size: 28px;
  padding-inline: var(--space-md);
  position: absolute;
  z-index: 2;
}

.background__stage-dot {
  background: var(--color-accent);
  block-size: 7px;
  border-radius: 999px;
  box-shadow: 0 0 18px color-mix(in srgb, var(--color-accent) 55%, transparent);
  inline-size: 7px;
}

.background__stage-line {
  background: color-mix(in srgb, var(--color-fg) 26%, transparent);
  block-size: 5px;
  border-radius: 999px;
  inline-size: 52px;
}

.background__stage-line--short {
  inline-size: 26px;
}

.background__stage-window {
  background: color-mix(in srgb, var(--color-bg-elevated) 86%, transparent);
  backdrop-filter: blur(18px);
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  inset-block: 58px 66px;
  inset-inline: 42px 54px;
  overflow: hidden;
  position: absolute;
  z-index: 2;
}

.background__stage-titlebar {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-subtle) 78%, transparent);
  border-block-end: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  display: flex;
  gap: 6px;
  min-block-size: 30px;
  padding-inline: var(--space-md);
}

.background__stage-control {
  background: color-mix(in srgb, var(--color-fg) 18%, transparent);
  block-size: 8px;
  border-radius: 999px;
  inline-size: 8px;
}

.background__stage-window-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-sm);
  justify-content: center;
  padding: var(--space-lg);
}

.background__stage-row {
  background: color-mix(in srgb, var(--color-fg) 14%, transparent);
  block-size: 8px;
  border-radius: 999px;
  inline-size: 58%;
}

.background__stage-row--wide {
  inline-size: 78%;
}

.background__stage-row--short {
  inline-size: 34%;
}

.background__stage-dock {
  align-items: center;
  background: var(--dock-bg, color-mix(in srgb, var(--color-bg) 70%, transparent));
  backdrop-filter: blur(var(--dock-blur, 12px));
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: var(--radius-sm);
  display: flex;
  gap: var(--space-sm);
  inset-block-end: var(--space-md);
  inset-inline-start: 50%;
  padding: var(--space-sm);
  position: absolute;
  transform: translateX(-50%);
  z-index: 2;
}

.background__stage-dock span {
  background: var(--color-bg-elevated);
  block-size: 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  inline-size: 20px;
}

.background__stage-phone {
  background: color-mix(in srgb, var(--color-bg-elevated) 72%, transparent);
  backdrop-filter: blur(18px);
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: 28px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  inset-block: 24px;
  inset-inline: 28%;
  overflow: hidden;
  padding: var(--space-md);
  position: absolute;
  z-index: 2;
}

.background__stage-mobile-status {
  align-items: center;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  min-block-size: 18px;
}

.background__stage-mobile-pill,
.background__stage-mobile-dot,
.background__stage-mobile-icon,
.background__stage-mobile-indicator {
  background: color-mix(in srgb, var(--color-fg) 22%, transparent);
}

.background__stage-mobile-pill {
  border-radius: 999px;
  block-size: 5px;
  inline-size: 30px;
  margin-inline-end: auto;
}

.background__stage-mobile-dot {
  block-size: 5px;
  border-radius: 999px;
  inline-size: 5px;
}

.background__stage-mobile-grid {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-sm);
  grid-template-columns: repeat(3, 1fr);
  padding-block: var(--space-xl);
}

.background__stage-mobile-icon {
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.background__stage-mobile-icon:nth-child(3n + 1) {
  background: color-mix(in srgb, var(--color-accent) 28%, var(--color-bg-elevated));
}

.background__stage-mobile-indicator {
  align-self: center;
  block-size: 4px;
  border-radius: 999px;
  inline-size: 46px;
}

@container (max-width: 760px) {
  .background__stage {
    block-size: 230px;
  }

  .background__stage-window {
    inset-block: 54px 62px;
    inset-inline: var(--space-lg);
  }

  .background__stage-phone {
    border-radius: 22px;
    inset-block: var(--space-md);
    inset-inline: 22%;
  }
}
</style>
