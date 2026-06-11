<script setup lang="ts">
import { AppToolbar, IconButton } from "@daopk/kit";
import { Button } from "@daopk/ui";
import { FileText, FolderOpen, RefreshCw, Save } from "@daopk/icons";

defineProps<{
  browseDisabled: boolean;
  canPreview: boolean;
  canSave: boolean;
  dirty: boolean;
  loading: boolean;
  previewOpen: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  browse: [];
  revert: [];
  save: [];
  togglePreview: [];
}>();
</script>

<template>
  <AppToolbar class="editor__toolbar" wrap>
    <IconButton
      class="editor__browse-button"
      size="sm"
      label="Browse files"
      :icon="FolderOpen"
      :disabled="browseDisabled"
      @click="emit('browse')"
    />

    <template #end>
      <div class="editor__actions">
        <Button
          size="sm"
          variant="primary"
          :icon-start="Save"
          :disabled="!canSave"
          :loading="saving"
          @click="emit('save')"
        >
          Save
        </Button>
        <Button
          size="sm"
          :icon-start="RefreshCw"
          :disabled="!dirty || loading || saving"
          @click="emit('revert')"
        >
          Revert
        </Button>
        <IconButton
          size="sm"
          label="Toggle Markdown preview"
          :icon="FileText"
          :active="previewOpen && canPreview"
          :disabled="!canPreview"
          :pressed="previewOpen && canPreview"
          @click="emit('togglePreview')"
        />
      </div>
    </template>
  </AppToolbar>
</template>
