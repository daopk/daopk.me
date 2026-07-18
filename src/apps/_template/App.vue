<script setup vapor lang="ts">
import {
  AppFrame,
  AppToolbar,
  ScrollArea,
  SectionHeader,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import { Alert, Button } from "~/components/ui";
import { RefreshCw } from "~/icons/lucide";

// Mirrors the title (and, if needed, a back action) into the mobile header.
// No-ops on the desktop window, which titles itself from the app manifest.
useAppChrome({ title: () => "Template" });
</script>

<template>
  <!--
    Canonical app skeleton. Compose every app from kit layout primitives + ui
    controls so it inherits tokens, density and safe-area behavior on both
    shells. See src/components/kit/README.md for the full recipe.
  -->
  <AppFrame class="template-app" layout="flex-column" aria-label="Template">
    <AppToolbar class="template-app__toolbar" density="comfortable">
      <ToolbarTitle title="Template" subtitle="A token-based app shell" />
      <template #end>
        <Button size="sm" variant="surface">
          <template #left><RefreshCw size="1em" aria-hidden="true" /></template>
          Action
        </Button>
      </template>
    </AppToolbar>

    <ScrollArea class="template-app__body" safe-area>
      <Alert color="blue" variant="surface" role="status">
        Replace this skeleton with your app content.
      </Alert>
      <SectionHeader title="Section" subtitle="Group related controls under section headers." />
    </ScrollArea>
  </AppFrame>
</template>

<style scoped lang="scss">
.template-app__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.template-app__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}
</style>
