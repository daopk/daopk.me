<script setup lang="ts">
import { onMounted } from "vue";

import type { DesktopRendererComponentProps, VfsPath } from "@daopk/sdk";

import DesktopStickyNote from "./DesktopStickyNote.vue";
import { usePinnedDesktopNotes } from "./usePinnedDesktopNotes";

defineProps<DesktopRendererComponentProps>();

const pinnedNotes = usePinnedDesktopNotes();

onMounted(() => {
  if (!pinnedNotes.isHydrated()) {
    pinnedNotes.hydrate();
  }
});

function onMissing(path: VfsPath): void {
  pinnedNotes.unpin(path);
}
</script>

<template>
  <div class="notes-desktop-layer" aria-label="Pinned notes">
    <DesktopStickyNote
      v-for="note in pinnedNotes.notes.value"
      :key="note.path"
      :note="note"
      :stage-size="stageSize"
      @missing="onMissing"
    />
  </div>
</template>

<style scoped lang="scss">
.notes-desktop-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
}
</style>
