<script setup lang="ts">
interface DialogActionsProps {
  align?: "end" | "between" | "stretch";
}

withDefaults(defineProps<DialogActionsProps>(), {
  align: "end",
});
</script>

<template>
  <div class="ds-dialog-actions" :class="`ds-dialog-actions--${align}`">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-block-start: var(--space-md);
}

.ds-dialog-actions--end {
  justify-content: flex-end;
}

.ds-dialog-actions--between {
  justify-content: space-between;
}

.ds-dialog-actions--stretch > :deep(*) {
  flex: 1 1 0;
}

// Stack into a full-width column on narrow / touch dialogs so each action is
// an easy tap target.
@media (max-width: 420px) {
  .ds-dialog-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
