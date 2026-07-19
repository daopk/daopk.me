<script setup vapor lang="ts">
import Icon from "~/icons/Icon.vue";
import {
  FinderFileIcon,
  FinderFolderIcon,
  FinderImageFileIcon,
  FinderPdfFileIcon,
  FinderTextFileIcon,
} from "~/icons/fluentColor";
import { detectVfsFileType, vfsFileTypeInputFromPath } from "~/core/vfs/fileTypes";
import SearchIcon from "~icons/lucide/search";
import { computed, ref, useId, watch, type VaporComponent } from "vue";

import AppIcon from "~/components/AppIcon.vue";
import { Input, Modal, ScrollArea, type ModalFocusTrapOptions } from "~/components/ui";
import type { AppManifest } from "~/types/app";
import type { CommandManifest } from "~/types/command";
import type { SearchHit, SearchKind, SearchVfsMetadata } from "~/types/search";
import type { SpotlightRecentEntry } from "~/core/spotlight/SpotlightRecentsStore";

import { useKernel } from "~/composables/useKernel";
import { useReducedMotion } from "~/composables/useReducedMotion";

interface DispatchPayload {
  kind: SearchKind;
  id: string;
}

const props = defineProps<{
  query: string;
  hits: ReadonlyArray<SearchHit>;
  recents?: ReadonlyArray<SpotlightRecentEntry>;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "update:query", value: string): void;
  (e: "dispatch", payload: DispatchPayload): void;
  (e: "close"): void;
}>();

const kernel = useKernel();
const { reduced } = useReducedMotion();

const inputId = useId();
const listboxId = useId();
const optionIdPrefix = useId();

const SPOTLIGHT_CONTENT_BASE_Z_INDEX = 1501;
const focusTrapOptions: ModalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" },
};

const modalClassNames = computed(() => ({
  root: ["spotlight", { "spotlight--reduced": reduced.value }],
  overlay: "spotlight__overlay",
  panel: "spotlight__panel",
  header: "spotlight__sr-only",
  body: "spotlight__body",
}));

interface Row {
  kind: SearchKind;
  id: string;
  title: string;
  hint: string;
  icon: VaporComponent | undefined;
  badge: string;
  snippet: string;
  vfs: SearchVfsMetadata | null;
  sectionLabel: string | null;
}

function resolveAsRow(
  kind: Exclude<SearchKind, "vfs">,
  id: string,
): Omit<Row, "sectionLabel"> | null {
  if (kind === "command") {
    const manifest = kernel.commands.list().find((c): c is CommandManifest => c.id === id);
    if (!manifest) return null;
    return {
      kind,
      id,
      title: manifest.title,
      hint: manifest.hint ?? "",
      icon: manifest.icon,
      badge: "Cmd",
      snippet: "",
      vfs: null,
    };
  }
  const manifest = kernel.apps.list().find((a): a is AppManifest => a.id === id);
  if (!manifest) return null;
  return {
    kind,
    id,
    title: manifest.name,
    hint: manifest.category,
    icon: manifest.icon,
    badge: "App",
    snippet: "",
    vfs: null,
  };
}

function resolveVfsRow(hit: SearchHit): Omit<Row, "sectionLabel"> | null {
  if (hit.vfs === undefined) {
    return null;
  }

  return {
    kind: "vfs",
    id: hit.id,
    title: hit.title,
    hint: hit.hint ?? hit.vfs.path,
    icon: hit.vfs.entryKind === "directory" ? FinderFolderIcon : fileIconFor(hit.vfs),
    badge:
      hit.vfs.entryKind === "directory"
        ? "Folder"
        : detectVfsFileType(vfsFileTypeInputFromPath(hit.vfs.path, hit.vfs.mimeType)) === "pdf"
          ? "PDF"
          : "File",
    snippet: hit.vfs.snippet ?? "",
    vfs: hit.vfs,
  };
}

function fileIconFor(metadata: SearchVfsMetadata): VaporComponent {
  if (detectVfsFileType(vfsFileTypeInputFromPath(metadata.path, metadata.mimeType)) === "pdf") {
    return FinderPdfFileIcon;
  }

  if (metadata.mimeType?.startsWith("image/") === true) {
    return FinderImageFileIcon;
  }

  if (metadata.mimeType?.startsWith("text/") === true) {
    return FinderTextFileIcon;
  }

  return FinderFileIcon;
}

const isQueryEmpty = computed((): boolean => props.query.trim().length === 0);

const rows = computed<Row[]>((): Row[] => {
  if (isQueryEmpty.value) {
    const recentRows: Row[] = [];
    for (const r of props.recents ?? []) {
      const resolved = resolveAsRow(r.kind, r.id);
      if (!resolved) continue;
      recentRows.push({
        ...resolved,
        sectionLabel: recentRows.length === 0 ? "Recent" : null,
      });
    }
    return recentRows;
  }

  const apps: Row[] = [];
  const files: Row[] = [];
  const commands: Row[] = [];
  for (const hit of props.hits) {
    const resolved = hit.kind === "vfs" ? resolveVfsRow(hit) : resolveAsRow(hit.kind, hit.id);
    if (!resolved) continue;
    if (hit.kind === "app") {
      apps.push({ ...resolved, sectionLabel: apps.length === 0 ? "Apps" : null });
    } else if (hit.kind === "vfs") {
      files.push({ ...resolved, sectionLabel: files.length === 0 ? "Files" : null });
    } else {
      commands.push({ ...resolved, sectionLabel: commands.length === 0 ? "Commands" : null });
    }
  }
  return [...apps, ...files, ...commands];
});

const activeIndex = ref(0);

watch(
  () => rows.value.length,
  (len): void => {
    // empty) so `aria-activedescendant` never points at a dead id.
    if (activeIndex.value >= len) {
      activeIndex.value = len === 0 ? 0 : len - 1;
    }
  },
);

watch(
  () => props.query,
  (): void => {
    // hit is highlighted by default. `aria-activedescendant` updates
    activeIndex.value = 0;
  },
);

function rowDomId(index: number): string {
  return `${optionIdPrefix}-${index}`;
}

const activeRowId = computed((): string | null => {
  if (rows.value.length === 0) return null;
  return rowDomId(activeIndex.value);
});

function onInput(value: string): void {
  emit("update:query", value);
}

function moveActive(delta: number): void {
  const len = rows.value.length;
  if (len === 0) return;
  activeIndex.value = (activeIndex.value + delta + len) % len;
}

function dispatchActive(): void {
  const row = rows.value[activeIndex.value];
  if (!row) return;
  emit("dispatch", { kind: row.kind, id: row.id });
}

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveActive(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveActive(-1);
      break;
    case "Home":
      event.preventDefault();
      activeIndex.value = 0;
      break;
    case "End":
      event.preventDefault();
      activeIndex.value = Math.max(0, rows.value.length - 1);
      break;
    case "Enter":
      event.preventDefault();
      dispatchActive();
      break;
  }
}

function close(): void {
  emit("close");
}

function onRowClick(index: number): void {
  activeIndex.value = index;
  dispatchActive();
}

function onRowHover(index: number): void {
  activeIndex.value = index;
}
</script>

<template>
  <Modal
    :open="true"
    title="Spotlight"
    size="640px"
    :base-z-index="SPOTLIGHT_CONTENT_BASE_Z_INDEX"
    :teleport="false"
    :show-close-button="false"
    initial-focus=".spotlight__input-native"
    :focus-trap-options="focusTrapOptions"
    :overlay-props="{ color: 'var(--spotlight-scrim)' }"
    :class-names="modalClassNames"
    @close="close"
  >
    <div class="spotlight__content" @keydown="onKeydown">
      <div class="spotlight__inputRow">
        <Icon
          :icon="SearchIcon"
          class="spotlight__inputIcon"
          :size="18"
          :stroke-width="2"
          aria-hidden="true"
        />
        <Input
          :id="inputId"
          class="spotlight__input"
          :class-names="{ input: 'spotlight__input-native' }"
          :model-value="query"
          :placeholder="placeholder ?? 'Search apps and commands'"
          :ariaLabel="placeholder ?? 'Search apps and commands'"
          :input-attrs="{
            role: 'combobox',
            'aria-expanded': rows.length > 0,
            'aria-controls': rows.length > 0 ? listboxId : undefined,
            'aria-activedescendant': activeRowId ?? undefined,
            'aria-autocomplete': 'list',
            autocomplete: 'off',
            spellcheck: false,
          }"
          @update:model-value="onInput"
        />
      </div>
      <ScrollArea class="spotlight__results" scrollbars="y">
        <p v-if="rows.length === 0" class="spotlight__empty">
          {{ isQueryEmpty ? "Start typing to search" : "No results" }}
        </p>
        <ul v-else :id="listboxId" class="spotlight__listbox" role="listbox">
          <template v-for="(row, index) in rows" :key="`${row.kind}:${row.id}`">
            <li v-if="row.sectionLabel" class="spotlight__sectionLabel" role="presentation">
              {{ row.sectionLabel }}
            </li>
            <li
              :id="rowDomId(index)"
              role="option"
              class="spotlight__option"
              :class="{ 'spotlight__option--active': index === activeIndex }"
              :aria-selected="index === activeIndex"
              @mousedown.prevent="onRowClick(index)"
              @mousemove="onRowHover(index)"
            >
              <AppIcon
                v-if="row.icon"
                :icon="row.icon"
                class="spotlight__optionIcon"
                :size="18"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span class="spotlight__optionText">
                <span class="spotlight__optionTitle">{{ row.title }}</span>
                <span v-if="row.hint" class="spotlight__optionHint">{{ row.hint }}</span>
                <span v-if="row.snippet" class="spotlight__optionSnippet">{{ row.snippet }}</span>
              </span>
              <span class="spotlight__optionKindBadge">
                {{ row.badge }}
              </span>
            </li>
          </template>
        </ul>
      </ScrollArea>
    </div>
  </Modal>
</template>

<style lang="scss">
.spotlight {
  align-items: flex-start;
  block-size: 100%;
  display: flex;
  inline-size: 100%;
  inset: 0;
  justify-content: center;
  padding-block-start: 12vh;
  position: fixed;
  z-index: var(--spotlight-z);
}

.spotlight__body,
.spotlight__content {
  display: contents;
}

.spotlight-presence-enter-active,
.spotlight-presence-leave-active {
  transition: opacity 220ms var(--ease);

  .spotlight__panel {
    transition:
      opacity 220ms var(--ease),
      transform 220ms var(--ease);
  }
}

.spotlight-presence-enter-from,
.spotlight-presence-leave-to {
  opacity: 0;

  .spotlight__panel {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
}

.spotlight--reduced {
  &.spotlight-presence-enter-active,
  &.spotlight-presence-leave-active {
    transition: opacity var(--duration-fast) linear;

    .spotlight__panel {
      transition: opacity var(--duration-fast) linear;
    }
  }

  &.spotlight-presence-enter-from,
  &.spotlight-presence-leave-to {
    .spotlight__panel {
      transform: none;
    }
  }
}

.spotlight__panel {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  inline-size: min(640px, 92vw);
  max-block-size: 60vh;
  overflow: hidden;
}

.spotlight__sr-only {
  block-size: 1px;
  clip: rect(0 0 0 0);
  inline-size: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
}

.spotlight__inputRow {
  align-items: center;
  border-block-end: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
}

.spotlight__inputIcon {
  color: var(--color-fg-muted);
  flex: 0 0 auto;
}

.spotlight__input {
  background: transparent;
  border: 0;
  flex: 1 1 auto;
  height: auto;
  padding: 0;
}

.spotlight__input:hover,
.spotlight__input:focus-within {
  border-color: transparent;
  box-shadow: none;
}

.spotlight__input-native {
  color: var(--color-fg);
  font-family: var(--font-family-base);
  font-size: 17px;
  letter-spacing: -0.01em;
  outline: 0;
  padding: 0;

  &::placeholder {
    color: var(--color-fg-muted);
  }
}

.spotlight__results {
  flex: 1 1 auto;
  min-block-size: 0;
  padding: var(--space-sm) 0;
}

.spotlight__empty {
  color: var(--color-fg-muted);
  font-size: 14px;
  margin: 0;
  padding: var(--space-lg);
  text-align: center;
}

.spotlight__listbox {
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

.spotlight__sectionLabel {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: var(--space-md) var(--space-lg) var(--space-xs);
  text-transform: uppercase;
}

.spotlight__option {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  transition: background var(--duration-fast) var(--ease);

  &--active {
    background: var(--color-bg-subtle);
  }
}

.spotlight__optionIcon {
  flex: 0 0 auto;
}

.spotlight__optionText {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.spotlight__optionTitle {
  color: var(--color-fg);
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotlight__optionHint,
.spotlight__optionSnippet {
  color: var(--color-fg-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotlight__optionSnippet {
  color: var(--color-fg-subtle, var(--color-fg-muted));
}

.spotlight__optionKindBadge {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  text-transform: uppercase;

  .spotlight__option--active & {
    background: var(--color-bg);
  }
}
</style>
