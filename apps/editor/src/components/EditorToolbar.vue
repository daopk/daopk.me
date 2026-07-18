<script setup vapor lang="ts">
import { AppToolbar } from "@daopk/kit";
import { Button, IconButton } from "@daopk/ui";
import FileText from "~icons/lucide/file-text";
import FolderOpen from "~icons/lucide/folder-open";
import RefreshCw from "~icons/lucide/refresh-cw";
import Save from "~icons/lucide/save";

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
      ariaLabel="Browse files"
      :disabled="browseDisabled"
      @click="emit('browse')"
    >
      <FolderOpen aria-hidden="true" />
    </IconButton>

    <template #end>
      <div class="editor__actions">
        <Button
          size="sm"
          variant="solid"
          color="blue"
          :disabled="!canSave"
          :loading="saving"
          @click="emit('save')"
        >
          <template #left><Save aria-hidden="true" /></template>
          Save
        </Button>
        <Button size="sm" :disabled="!dirty || loading || saving" @click="emit('revert')">
          <template #left><RefreshCw aria-hidden="true" /></template>
          Revert
        </Button>
        <IconButton
          size="sm"
          ariaLabel="Toggle Markdown preview"
          :variant="previewOpen && canPreview ? 'surface' : 'ghost'"
          :disabled="!canPreview"
          :aria-pressed="previewOpen && canPreview"
          @click="emit('togglePreview')"
        >
          <FileText aria-hidden="true" />
        </IconButton>
      </div>
    </template>
  </AppToolbar>
</template>
