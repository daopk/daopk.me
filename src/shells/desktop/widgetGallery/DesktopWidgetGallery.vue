<script setup vapor lang="ts">
import { computed, ref, useId } from "vue";

import AppIcon from "~/components/AppIcon.vue";
import { Button, IconButton, ScrollArea, Tabs, TabsList, TabsTrigger } from "~/components/ui";
import Check from "~icons/lucide/check";
import Plus from "~icons/lucide/plus";
import Search from "~icons/lucide/search";
import X from "~icons/lucide/x";
import { SettingsWidgetsIcon as WidgetsIcon } from "~/icons/fluentColor";

import { useDesktopWidgetGallery } from "./useDesktopWidgetGallery";

const panelRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const headingId = useId();

const { view, actions } = useDesktopWidgetGallery({
  panelRef,
  initialFocusRef: searchRef,
});
const queryModel = computed({
  get: () => view.value.query,
  set: actions.setQuery,
});
</script>

<template>
  <div
    v-if="view.isOpen"
    ref="panelRef"
    v-bind="view.panelBindings"
    class="desktop-widget-gallery"
    role="dialog"
    aria-modal="false"
    :aria-labelledby="headingId"
    tabindex="-1"
  >
    <div class="desktop-widget-gallery__header" @pointerdown="actions.handlePanelPointerDown">
      <span class="desktop-widget-gallery__header-icon" aria-hidden="true">
        <WidgetsIcon />
      </span>
      <div class="desktop-widget-gallery__heading">
        <h2 :id="headingId">Widgets</h2>
        <p>Drag desktop widgets onto the wallpaper, or add them to desktop surfaces.</p>
      </div>
      <IconButton
        class="desktop-widget-gallery__close"
        ariaLabel="Close"
        size="xs"
        variant="plain"
        @click="actions.close"
        @pointerdown.stop
      >
        <X aria-hidden="true" />
      </IconButton>
    </div>

    <label class="desktop-widget-gallery__search">
      <Search class="desktop-widget-gallery__search-icon" aria-hidden="true" />
      <input ref="searchRef" v-model="queryModel" type="search" placeholder="Search widgets" />
    </label>

    <Tabs
      class="desktop-widget-gallery__tabs-root"
      :model-value="view.activeSurface"
      variant="pills"
      size="xs"
      ariaLabel="Widget surface"
      @update:model-value="actions.selectSurface"
    >
      <TabsList class="desktop-widget-gallery__tabs">
        <TabsTrigger v-for="tab in view.surfaceTabs" :key="tab.id" :value="tab.id">
          {{ tab.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <ScrollArea
      class="desktop-widget-gallery__list"
      scrollbars="y"
      :viewport-attrs="{ 'aria-live': 'polite' }"
    >
      <section class="desktop-widget-gallery__list-content">
        <p v-if="view.empty" class="desktop-widget-gallery__empty">No widgets match this view.</p>
        <article
          v-for="item in view.items"
          v-else
          :key="`${view.activeSurface}::${item.id}`"
          class="desktop-widget-gallery__item"
          :data-visible="item.visible || undefined"
          :data-widget-id="item.id"
        >
          <button
            type="button"
            class="desktop-widget-gallery__preview"
            :disabled="item.visible || !item.desktopPlaceable"
            :aria-label="item.desktopPlaceable ? `Drag ${item.title} to desktop` : item.title"
            @pointerdown="actions.handleItemPointerDown(item, $event)"
          >
            <AppIcon
              :icon="item.icon"
              :fallback="WidgetsIcon"
              class="desktop-widget-gallery__preview-icon"
            />
            <span class="desktop-widget-gallery__preview-size">{{ item.sizeLabel }}</span>
          </button>

          <div class="desktop-widget-gallery__item-body">
            <div class="desktop-widget-gallery__item-title-line">
              <h3>{{ item.title }}</h3>
              <span v-if="item.visible" class="desktop-widget-gallery__added">
                <Check aria-hidden="true" />
                Added
              </span>
            </div>
            <p class="desktop-widget-gallery__item-description">{{ item.description }}</p>
            <p class="desktop-widget-gallery__item-meta">
              {{ item.provider.label }} · {{ item.surfaceLabel }}
            </p>
          </div>

          <div class="desktop-widget-gallery__actions">
            <Button
              v-if="item.visible"
              variant="ghost"
              size="sm"
              @click="actions.setItemVisible(item, false)"
              >Remove</Button
            >
            <Button
              v-else
              variant="solid"
              color="blue"
              size="sm"
              @click="actions.setItemVisible(item, true)"
            >
              <template #left><Plus aria-hidden="true" /></template>
              Add
            </Button>
          </div>
        </article>
      </section>
    </ScrollArea>
  </div>

  <Teleport to="body">
    <div
      v-if="view.dragPreview"
      class="desktop-widget-gallery__drag-ghost"
      :style="view.dragPreview.style"
      aria-hidden="true"
    >
      {{ view.dragPreview.label }}
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.desktop-widget-gallery {
  background: color-mix(in srgb, var(--color-bg-elevated) 94%, transparent);
  backdrop-filter: blur(var(--blur-md, 12px));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  inline-size: min(380px, calc(100vw - 32px));
  inset-block-start: calc(var(--menubar-height) + 16px);
  inset-inline-end: 16px;
  max-block-size: calc(100vh - var(--menubar-height) - 32px);
  padding: var(--space-md);
  position: fixed;
  z-index: var(--dialog-content-z);
}

.desktop-widget-gallery__header {
  align-items: flex-start;
  cursor: grab;
  display: flex;
  gap: var(--space-sm);
  touch-action: none;
  user-select: none;
}

.desktop-widget-gallery--dragging,
.desktop-widget-gallery--dragging .desktop-widget-gallery__header {
  cursor: grabbing;
}

.desktop-widget-gallery__header-icon {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  padding: var(--space-xs);

  svg {
    block-size: 24px;
    inline-size: 24px;
  }
}

.desktop-widget-gallery__heading {
  flex: 1 1 auto;
  min-inline-size: 0;

  h2 {
    font-size: 18px;
    font-weight: 650;
    line-height: 1.1;
    margin: 0;
  }

  p {
    color: var(--color-fg-muted);
    font-size: 12px;
    line-height: 1.4;
    margin: 4px 0 0;
  }
}

.desktop-widget-gallery__close {
  background: transparent;
  border: 0;
  color: var(--color-fg-muted);
  flex: 0 0 auto;

  &:hover,
  &:focus-visible {
    background: var(--color-bg-subtle);
    color: var(--color-fg);
    outline: none;
  }

  svg {
    block-size: 16px;
    inline-size: 16px;
  }
}

.desktop-widget-gallery__search {
  align-items: center;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-xs);
  padding: 0 var(--space-sm);

  &:focus-within {
    border-color: var(--color-accent);
  }

  input {
    background: transparent;
    border: 0;
    color: var(--color-fg);
    flex: 1 1 auto;
    font-size: 13px;
    min-inline-size: 0;
    outline: none;
    padding: var(--space-sm) 0;
  }
}

.desktop-widget-gallery__search-icon {
  block-size: 14px;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  inline-size: 14px;
}

.desktop-widget-gallery__tabs-root {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 2px;
}

.desktop-widget-gallery__tabs {
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-widget-gallery__tabs :deep(button) {
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  font-size: 12px;
  min-block-size: 28px;

  &[aria-selected="true"] {
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font-weight: 600;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
}

.desktop-widget-gallery__list {
  flex: 1 1 auto;
  min-block-size: 0;
  padding-inline-end: 2px;
}

.desktop-widget-gallery__list-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.desktop-widget-gallery__empty {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  font-size: 13px;
  margin: 0;
  padding: var(--space-md);
  text-align: center;
}

.desktop-widget-gallery__item {
  align-items: center;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 72px minmax(0, 1fr) auto;
  padding: var(--space-sm);

  &[data-visible] {
    border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border));
  }
}

.desktop-widget-gallery__preview {
  align-items: center;
  aspect-ratio: 1;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent),
    var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: grab;
  display: flex;
  inline-size: 72px;
  justify-content: center;
  position: relative;

  &:disabled {
    cursor: default;
    opacity: 0.82;
  }
}

.desktop-widget-gallery__preview-icon {
  block-size: 28px;
  inline-size: 28px;
}

.desktop-widget-gallery__preview-size {
  background: color-mix(in srgb, var(--color-bg-elevated) 88%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  font-size: 10px;
  inset-block-end: 4px;
  inset-inline-end: 4px;
  line-height: 1;
  padding: 2px 4px;
  position: absolute;
}

.desktop-widget-gallery__item-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-inline-size: 0;
}

.desktop-widget-gallery__item-title-line {
  align-items: center;
  display: flex;
  gap: var(--space-xs);

  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-widget-gallery__added {
  align-items: center;
  color: var(--color-accent);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  gap: 3px;

  svg {
    block-size: 12px;
    inline-size: 12px;
  }
}

.desktop-widget-gallery__item-description,
.desktop-widget-gallery__item-meta {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-widget-gallery__item-meta {
  font-size: 11px;
}

.desktop-widget-gallery__actions {
  align-items: center;
  display: flex;
  justify-content: flex-end;
}

.desktop-widget-gallery__drag-ghost {
  align-items: center;
  background: color-mix(in srgb, var(--color-bg-elevated) 78%, transparent);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  color: var(--color-fg);
  display: flex;
  font-size: 13px;
  font-weight: 600;
  inset: 0 auto auto 0;
  justify-content: center;
  pointer-events: none;
  position: fixed;
  z-index: var(--dialog-content-z);
}

@media (max-width: 768px) {
  .desktop-widget-gallery {
    display: none;
  }
}
</style>
