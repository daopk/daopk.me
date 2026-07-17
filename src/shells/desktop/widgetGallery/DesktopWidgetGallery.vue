<script setup vapor lang="ts">
import { ref } from "vue";

import AppIcon from "~/components/AppIcon.vue";
import { Button } from "~/components/ui";
import { Check, Plus, Search, X } from "~/icons/lucide";
import { SettingsWidgetsIcon as WidgetsIcon } from "~/icons/fluentColor";

import { useDesktopWidgetGallery } from "./useDesktopWidgetGallery";

const panelRef = ref<HTMLElement | null>(null);

const {
  open,
  query,
  activeSurface,
  surfaceTabs,
  filteredItems,
  hasItems,
  panelDragging,
  panelStyle,
  startPanelDrag,
  dragging,
  dragStyle,
  startDesktopDrag,
  close,
  show,
  hide,
} = useDesktopWidgetGallery({ panelRef });
</script>

<template>
  <aside
    v-if="open"
    ref="panelRef"
    class="desktop-widget-gallery"
    :class="{ 'desktop-widget-gallery--dragging': panelDragging }"
    :style="panelStyle"
    aria-label="Widget gallery"
  >
    <header class="desktop-widget-gallery__header" @pointerdown="startPanelDrag">
      <span class="desktop-widget-gallery__header-icon" aria-hidden="true">
        <WidgetsIcon />
      </span>
      <div class="desktop-widget-gallery__heading">
        <h2>Widgets</h2>
        <p>Drag desktop widgets onto the wallpaper, or add them to desktop surfaces.</p>
      </div>
      <button
        type="button"
        class="desktop-widget-gallery__close"
        aria-label="Close"
        @click="close"
        @pointerdown.stop
      >
        <X aria-hidden="true" />
      </button>
    </header>

    <label class="desktop-widget-gallery__search">
      <Search class="desktop-widget-gallery__search-icon" aria-hidden="true" />
      <input v-model="query" type="search" placeholder="Search widgets" />
    </label>

    <div class="desktop-widget-gallery__tabs" role="tablist" aria-label="Widget surface">
      <button
        v-for="tab in surfaceTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeSurface === tab.id"
        @click="activeSurface = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="desktop-widget-gallery__list" aria-live="polite">
      <p v-if="!hasItems" class="desktop-widget-gallery__empty">No widgets match this view.</p>
      <article
        v-for="item in filteredItems"
        v-else
        :key="`${activeSurface}::${item.id}`"
        class="desktop-widget-gallery__item"
        :data-visible="item.visible || undefined"
        :data-widget-id="item.id"
      >
        <button
          type="button"
          class="desktop-widget-gallery__preview"
          :disabled="item.visible || !item.desktopPlaceable"
          :aria-label="item.desktopPlaceable ? `Drag ${item.title} to desktop` : item.title"
          @pointerdown="startDesktopDrag(item, $event)"
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
          <Button v-if="item.visible" variant="ghost" size="sm" @click="hide(item)">Remove</Button>
          <Button v-else variant="primary" size="sm" :icon-start="Plus" @click="show(item)">
            Add
          </Button>
        </div>
      </article>
    </section>
  </aside>

  <Teleport to="body">
    <div
      v-if="dragging"
      class="desktop-widget-gallery__drag-ghost"
      :style="dragStyle"
      aria-hidden="true"
    >
      {{ dragging.item.title }}
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
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  padding: 4px;

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

.desktop-widget-gallery__tabs {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: 2px;
  padding: 2px;
}

.desktop-widget-gallery__tabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-widget-gallery__tabs button {
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
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-sm);
  min-block-size: 0;
  overflow-y: auto;
  padding-inline-end: 2px;
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
