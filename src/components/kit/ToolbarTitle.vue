<script setup lang="ts">
interface ToolbarTitleProps {
  title: string;
  subtitle?: string;
  align?: "start" | "center";
}

withDefaults(defineProps<ToolbarTitleProps>(), {
  subtitle: undefined,
  align: "start",
});
</script>

<template>
  <div class="ds-kit-toolbar-title" :class="`ds-kit-toolbar-title--${align}`">
    <span class="ds-kit-toolbar-title__title">{{ title }}</span>
    <span v-if="subtitle" class="ds-kit-toolbar-title__subtitle">{{ subtitle }}</span>
  </div>
</template>

<style scoped lang="scss">
.ds-kit-toolbar-title {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  min-inline-size: 0;
}

.ds-kit-toolbar-title--center {
  align-items: center;
  text-align: center;
}

.ds-kit-toolbar-title__title {
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--leading-tight);
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-kit-toolbar-title__subtitle {
  color: var(--color-fg-muted);
  font-size: var(--font-size-xs);
  line-height: var(--leading-tight);
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
