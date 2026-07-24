<script setup vapor lang="ts">
import { AppFrame } from "@daopk/kit";
import { Progress } from "@daopk/ui";

import FinderDeleteDialog from "./components/FinderDeleteDialog.vue";
import FinderEntries from "./components/FinderEntries.vue";
import FinderPreviewPane from "./components/FinderPreviewPane.vue";
import FinderToolbar from "./components/FinderToolbar.vue";
import { useFinderSession } from "./composables/useFinderSession";

const session = useFinderSession();
</script>

<template>
  <AppFrame as="section" class="finder" layout="flex-column" aria-label="Finder">
    <div class="finder__chrome">
      <FinderToolbar :state="session.state.value.toolbar" @intent="session.send" />
      <Progress
        v-if="session.state.value.loading"
        class="finder__loading-bar"
        indeterminate
        size="sm"
        ariaLabel="Loading folder"
      />
    </div>

    <div class="finder__body">
      <FinderEntries :state="session.state.value.entries" @intent="session.send" />

      <FinderPreviewPane
        v-if="session.state.value.previewPane"
        :state="session.state.value.previewPane"
      />
    </div>

    <FinderDeleteDialog :state="session.state.value.deleteConfirmation" @intent="session.send" />
  </AppFrame>
</template>

<style scoped lang="scss">
.finder {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  inline-size: 100%;
  min-block-size: 0;
}

.finder__chrome {
  flex: 0 0 auto;
  position: relative;
}

.finder__loading-bar {
  border-radius: 0;
  inset-block-end: 0;
  inset-inline: 0;
  position: absolute;
}

.finder__body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 32%);
  min-block-size: 0;
}

@media (max-width: 640px) {
  .finder__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
}
</style>
