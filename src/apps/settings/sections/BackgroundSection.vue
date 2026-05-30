<script setup lang="ts">
import { computed, ref } from "vue";
import { Upload as UploadIcon } from "~/icons/lucide";

import { ActionRow, Badge, Panel, SectionHeader, StatusBanner } from "~/components/kit";
import Button from "~/components/ui/Button.vue";
import Switch from "~/components/ui/Switch.vue";
import { useActiveShell } from "~/composables/useActiveShell";
import { useKernel } from "~/composables/useKernel";
import { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";

import BackgroundStagePreview from "./background/BackgroundStagePreview.vue";
import BackgroundTileGrid from "./background/BackgroundTileGrid.vue";
import { useWallpaperBlur } from "./background/useWallpaperBlur";
import { previewStyleForTile, useWallpaperTiles } from "./background/wallpaperTiles";

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const kernel = useKernel();
const { shellId } = useActiveShell();
const wallpaperStore = useWallpaperStore();
const desktopActiveIdRef = kernel.settings.use("desktopWallpaperActiveId");
const mobileActiveIdRef = kernel.settings.use("mobileWallpaperActiveId");
const activeIdRef = computed(() =>
  shellId.value === "mobile" ? mobileActiveIdRef.value : desktopActiveIdRef.value,
);
const { activeTile, activeTileDescription, activeTileName, builtins, tiles, wallpaperCountLabel } =
  useWallpaperTiles({
    activeIdRef,
    kernel,
    shellId,
    wallpaperStore,
  });
const { blurEnabled, blurPreviewStyle, setBlurEnabled } = useWallpaperBlur(kernel);

const activePreviewStyle = computed<Record<string, string>>(() => {
  const tile = activeTile.value;
  return tile ? previewStyleForTile(tile) : {};
});

function selectTile(id: string): void {
  if (id === activeIdRef.value) {
    return;
  }
  setActiveWallpaperId(id);
}

function setActiveWallpaperId(id: string): void {
  if (shellId.value === "mobile") {
    kernel.settings.set("mobileWallpaperActiveId", id);
    return;
  }
  kernel.settings.set("desktopWallpaperActiveId", id);
}

const status = ref<{ tone: "info" | "error"; message: string } | null>(null);
const isUploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function handleFile(file: File): Promise<void> {
  // without this short-circuit a second drop could race the first through
  if (isUploading.value) {
    status.value = { tone: "info", message: "Already processing an image." };
    return;
  }
  status.value = null;
  isUploading.value = true;
  try {
    const result = await wallpaperStore.upload(file);
    if (result.ok) {
      status.value = { tone: "info", message: `Uploaded "${result.meta.name}".` };
      setActiveWallpaperId(result.meta.id);
    } else {
      status.value = { tone: "error", message: result.message };
    }
  } finally {
    isUploading.value = false;
  }
}

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void handleFile(file);
  }
  input.value = "";
}

function triggerFilePicker(): void {
  fileInput.value?.click();
}

const isDragOver = ref(false);

function onDragEnter(event: DragEvent): void {
  event.preventDefault();
  isDragOver.value = true;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault();
  isDragOver.value = false;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  isDragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    void handleFile(file);
  }
}

async function removeUserTile(id: string, event: Event): Promise<void> {
  event.stopPropagation();
  status.value = null;
  const fallbackId = builtins.value[0]!.id;
  if (desktopActiveIdRef.value === id) {
    kernel.settings.set("desktopWallpaperActiveId", fallbackId);
  }
  if (mobileActiveIdRef.value === id) {
    kernel.settings.set("mobileWallpaperActiveId", fallbackId);
  }
  await wallpaperStore.remove(id);
}
</script>

<template>
  <article
    class="background"
    :class="{ 'background--drag-over': isDragOver }"
    aria-label="Background settings"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <SectionHeader v-if="props.showHeader" class="background__header">
      <h2 class="background__title">Background</h2>
      <template #actions>
        <Badge class="background__count">{{ wallpaperCountLabel }}</Badge>
      </template>
    </SectionHeader>

    <section class="background__hero" aria-labelledby="background-current-label">
      <BackgroundStagePreview
        :shell-id="shellId"
        :preview-style="activePreviewStyle"
        :wallpaper-effect-style="blurPreviewStyle"
      />

      <Panel as="aside" class="background__control-panel" variant="elevated" padding="none">
        <div class="background__current">
          <span id="background-current-label" class="background__meta-label">Current</span>
          <strong class="background__current-name">{{ activeTileName }}</strong>
          <span class="background__current-description">{{ activeTileDescription }}</span>
        </div>

        <div class="background__upload-zone">
          <div class="background__upload-copy">
            <span class="background__meta-label">Personal wallpaper</span>
            <span class="background__upload-format">PNG, JPG, or WebP</span>
          </div>
          <Button
            id="background-upload-trigger"
            variant="secondary"
            :loading="isUploading"
            :icon-start="UploadIcon"
            aria-controls="background-file-input"
            @click="triggerFilePicker"
          >
            {{ isUploading ? "Processing…" : "Upload image" }}
          </Button>
          <input
            id="background-file-input"
            ref="fileInput"
            class="background__file-input"
            type="file"
            accept="image/*"
            aria-labelledby="background-upload-trigger"
            @change="onFileInput"
          />
        </div>

        <section class="background__blur" aria-labelledby="background-blur-label">
          <ActionRow as="div" class="background__toggle-row">
            <template #copy>
              <div class="background__toggle-copy">
                <h3 id="background-blur-label" class="background__group-title">Blur</h3>
                <p class="background__hint">Soften the wallpaper behind the interface.</p>
              </div>
            </template>
            <Switch
              data-testid="background-blur-switch"
              :model-value="blurEnabled"
              aria-labelledby="background-blur-label"
              @update:model-value="setBlurEnabled"
            />
          </ActionRow>
        </section>

        <StatusBanner
          v-if="status"
          as="p"
          class="background__status"
          :tone="status.tone"
          :class="{ 'background__status--error': status.tone === 'error' }"
        >
          {{ status.message }}
        </StatusBanner>
      </Panel>
    </section>

    <section class="background__group" aria-labelledby="background-wallpaper-label">
      <div class="background__group-header">
        <div>
          <h3 id="background-wallpaper-label" class="background__group-title">Wallpaper Library</h3>
          <p class="background__hint">{{ wallpaperCountLabel }}</p>
        </div>
      </div>

      <BackgroundTileGrid
        :tiles="tiles"
        :active-id="activeIdRef"
        @select="selectTile"
        @remove="removeUserTile"
      />
    </section>
  </article>
</template>

<style scoped lang="scss">
.background {
  container-type: inline-size;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  inline-size: 100%;
  margin-inline: auto;
  max-inline-size: var(--settings-content-max, 1160px);
  padding: var(--space-xl);
  position: relative;
}

.background--drag-over::before {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border: 2px dashed var(--color-accent);
  border-radius: var(--radius-sm);
  content: "";
  inset: var(--space-md);
  pointer-events: none;
  position: absolute;
  z-index: 3;
}

.background__header {
  align-items: center;
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
}

.background__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background__count {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.background__hint {
  color: var(--color-fg-muted);
  font-size: 12px;
  margin: 0;
}

.background__hero {
  align-items: stretch;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(420px, 760px) minmax(280px, 360px);
  justify-content: center;
}

.background__control-panel {
  background: color-mix(in srgb, var(--color-bg-elevated) 90%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-inline-size: 0;
  padding: var(--space-lg);
}

.background__current {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;
}

.background__meta-label {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
}

.background__current-name {
  font-size: 17px;
  font-weight: 650;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background__current-description,
.background__upload-format {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.background__upload-zone {
  align-items: center;
  background: var(--color-bg);
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: var(--radius-sm);
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  padding: var(--space-md);
}

.background--drag-over .background__upload-zone {
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg));
  border-color: var(--color-accent);
}

.background__upload-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.background__blur {
  border-block-start: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-block-start: var(--space-lg);
}

.background__toggle-row {
  align-items: center;
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
  min-inline-size: 0;
}

.background__toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-inline-size: 0;
}

.background__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.background__group-header {
  align-items: center;
  display: flex;
  gap: var(--space-md);
  justify-content: space-between;
}

.background__group-title {
  color: var(--color-fg);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0;
}

.background__file-input {
  display: none;
}

.background__status {
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, var(--color-border));
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font-size: 12px;
  margin: 0;
  padding: var(--space-sm) var(--space-md);
}

.background__status--error {
  background: color-mix(in srgb, var(--color-error) 8%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 24%, var(--color-border));
  color: var(--color-error);
}

@container (max-width: 760px) {
  .background__header {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .background__hero {
    grid-template-columns: 1fr;
  }

  .background__upload-zone {
    align-items: stretch;
    flex-direction: column;
  }

  .background__toggle-row {
    align-items: flex-start;
  }
}

@media (max-width: 760px) {
  .background {
    gap: var(--space-lg);
  }
}
</style>
