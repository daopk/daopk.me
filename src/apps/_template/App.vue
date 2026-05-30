<script setup lang="ts">
import { AppToolbar, Badge, EmptyState } from "~/components/kit";
import { Wallpaper } from "~/icons/lucide";
</script>

<template>
  <article class="template-app">
    <AppToolbar class="template-app__toolbar" density="comfortable" variant="plain">
      <div class="template-app__title-group">
        <Wallpaper class="template-app__icon" aria-hidden="true" />
        <h2 class="template-app__title">Starter App</h2>
      </div>
      <template #end>
        <Badge tone="accent">Template</Badge>
      </template>
    </AppToolbar>

    <EmptyState title="Ready" description="A token-based shell for the next app." />
  </article>
</template>

<style scoped lang="scss">
.template-app {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  min-block-size: 0;
}

.template-app__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.template-app__title-group {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.template-app__icon {
  block-size: 20px;
  color: var(--color-accent);
  flex: 0 0 auto;
  inline-size: 20px;
}

.template-app__title {
  font-size: 14px;
  font-weight: 650;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
