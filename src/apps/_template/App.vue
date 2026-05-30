<script setup lang="ts">
import { AppToolbar, Badge, EmptyState } from "~/components/kit";
</script>

<template>
  <article class="template-app">
    <AppToolbar class="template-app__toolbar" density="comfortable" variant="plain">
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
</style>
