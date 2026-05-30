<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ListButton,
  StatusBanner,
  Textarea,
  TextInput,
  ToolbarGroup,
} from "~/components/kit";
import { Button } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useVfs } from "~/composables/useVfs";
import { SlidesAppIcon } from "~/icons/fluentColor";
import { Play, Save } from "~/icons/lucide";
import { AppContextInjectionKey } from "~/types/app";

import { parseSlideDeckPath } from "./paths";
import { useSlidesLibrary, type SlidesDeck } from "./useSlidesLibrary";
import { useSlidevRuntime } from "./useSlidevRuntime";

const ctx = inject(AppContextInjectionKey, null);
const kernel = useKernel();
const vfs = useVfs();
const library = useSlidesLibrary({ vfs });
const runtime = useSlidevRuntime({
  requestNetworkAccess: async () => {
    const decision = await kernel.permissions.request("slides", "network.fetch", { source: "app" });
    return decision.granted;
  },
});

const decks = ref<readonly SlidesDeck[]>([]);
const activeDeck = ref<SlidesDeck | null>(null);
const source = ref("");
const savedSource = ref("");
const titleDraft = ref("Untitled Slides");
const loading = ref(false);
const message = ref("Loading decks...");
const error = ref("");

let previewWriteHandle: ReturnType<typeof globalThis.setTimeout> | undefined;

const dirty = computed(() => source.value !== savedSource.value);
const canSave = computed(() => activeDeck.value !== null && dirty.value && !loading.value);
const statusText = computed(() => {
  if (error.value.length > 0) {
    return error.value;
  }
  if (runtime.error.value.length > 0) {
    return runtime.error.value;
  }
  if (dirty.value) {
    return "Unsaved changes.";
  }

  return message.value;
});

const stopOpenRequests = kernel.events.on("slides.open.requested", (payload) => {
  const target = payload.path ?? payload.slug;
  if (target !== undefined) {
    void openDeck(target);
  }
});

onMounted(() => {
  void initialize();
});

onUnmounted(() => {
  stopOpenRequests();
  clearPreviewWrite();
  runtime.dispose();
});

watch(source, () => {
  if (!runtime.ready.value) {
    return;
  }

  clearPreviewWrite();
  previewWriteHandle = globalThis.setTimeout(() => {
    void runtime.writeSlides(source.value);
  }, 250);
});

async function initialize(): Promise<void> {
  await refreshDecks();
  const initialPath = typeof ctx?.args.path === "string" ? ctx.args.path : "";
  if (initialPath.length > 0) {
    await openDeck(initialPath);
    return;
  }

  const first = decks.value[0];
  if (first !== undefined) {
    await openDeck(first.filePath);
  } else {
    message.value = "Create a deck to start writing.";
  }
}

async function refreshDecks(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    decks.value = await library.listDecks();
  } catch (refreshError) {
    error.value = messageFromError(refreshError);
  } finally {
    loading.value = false;
  }
}

async function createDeck(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const deck = await library.createDeck(titleDraft.value);
    await refreshDecks();
    await openDeck(deck.filePath, { skipDirtyCheck: true });
    titleDraft.value = "Untitled Slides";
  } catch (createError) {
    error.value = messageFromError(createError);
  } finally {
    loading.value = false;
  }
}

async function openDeck(
  target: string,
  options: { readonly skipDirtyCheck?: boolean } = {},
): Promise<void> {
  if (!options.skipDirtyCheck && dirty.value && !window.confirm("Discard unsaved slide changes?")) {
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const opened = await library.openDeck(target);
    activeDeck.value = opened.deck;
    source.value = opened.source;
    savedSource.value = opened.source;
    message.value = `Opened ${opened.deck.title}.`;
  } catch (openError) {
    error.value = messageFromError(openError);
  } finally {
    loading.value = false;
  }
}

async function saveDeck(): Promise<void> {
  const deck = activeDeck.value;
  if (deck === null) {
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const saved = await library.saveDeck(deck.filePath, source.value);
    activeDeck.value = saved;
    savedSource.value = source.value;
    message.value = `Saved ${saved.title}.`;
    await refreshDecks();
    if (runtime.ready.value) {
      await runtime.writeSlides(source.value);
    }
  } catch (saveError) {
    error.value = messageFromError(saveError);
  } finally {
    loading.value = false;
  }
}

async function startPreview(): Promise<void> {
  const deck = activeDeck.value;
  if (deck === null) {
    return;
  }

  const started = await runtime.startDeck({ slug: deck.slug, source: source.value });
  if (started) {
    message.value = `Previewing ${deck.title}.`;
  }
}

function isActive(deck: SlidesDeck): boolean {
  return activeDeck.value?.filePath === deck.filePath;
}

function deckLabel(deck: SlidesDeck): string {
  const parsed = parseSlideDeckPath(deck.filePath);
  return parsed?.slug ?? deck.slug;
}

function clearPreviewWrite(): void {
  if (previewWriteHandle !== undefined) {
    globalThis.clearTimeout(previewWriteHandle);
    previewWriteHandle = undefined;
  }
}

function messageFromError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
</script>

<template>
  <AppFrame class="slides-app" layout="grid" :safe-area="false" aria-label="Slides">
    <AppToolbar class="slides-app__header">
      <SlidesAppIcon class="slides-app__icon" aria-hidden="true" />
      <div class="slides-app__title">
        <h1>Slides</h1>
        <p>{{ activeDeck?.title ?? "Slidev decks in WebOS" }}</p>
      </div>
      <template #end>
        <ToolbarGroup class="slides-app__actions" label="Deck actions">
          <IconButton
            label="Save deck"
            size="sm"
            :icon="Save"
            :disabled="!canSave"
            aria-label="Save deck"
            title="Save deck"
            @click="saveDeck"
          />
          <IconButton
            label="Start preview"
            size="sm"
            variant="subtle"
            :icon="Play"
            :disabled="activeDeck === null || runtime.status.value === 'installing'"
            aria-label="Start preview"
            title="Start preview"
            @click="startPreview"
          />
        </ToolbarGroup>
      </template>
    </AppToolbar>

    <div class="slides-app__workspace">
      <aside class="slides-app__sidebar" aria-label="Slide decks">
        <form class="slides-app__new" @submit.prevent="createDeck">
          <label for="slides-new-title">New deck</label>
          <TextInput
            id="slides-new-title"
            v-model="titleDraft"
            autocomplete="off"
            :disabled="loading"
          />
          <Button type="submit" size="sm" :disabled="loading">Create</Button>
        </form>

        <nav class="slides-app__deck-list" aria-label="Decks">
          <ListButton
            v-for="deck in decks"
            :key="deck.filePath"
            class="slides-app__deck"
            :class="{ 'slides-app__deck--active': isActive(deck) }"
            :active="isActive(deck)"
            @click="openDeck(deck.filePath)"
          >
            <strong>{{ deck.title }}</strong>
            <span>{{ deckLabel(deck) }}</span>
          </ListButton>
        </nav>
      </aside>

      <main class="slides-app__editor">
        <Textarea
          v-model="source"
          class="slides-app__textarea"
          variant="plain"
          resize="none"
          spellcheck="false"
          :disabled="activeDeck === null"
          aria-label="Slidev Markdown"
        />
      </main>

      <aside class="slides-app__preview" aria-label="Slide preview">
        <iframe
          v-if="runtime.ready.value"
          class="slides-app__iframe"
          title="Slidev preview"
          :src="runtime.previewUrl.value"
          sandbox="allow-scripts allow-same-origin"
          allow="cross-origin-isolated; fullscreen"
          referrerpolicy="no-referrer"
        />
        <EmptyState v-else class="slides-app__preview-state">
          <strong>{{ runtime.status.value }}</strong>
          <span>{{ statusText }}</span>
        </EmptyState>
        <section class="slides-app__log" aria-label="WebContainer log">
          <header class="slides-app__log-header">
            <strong>WebContainer</strong>
            <span>{{ runtime.logs.value.length }} lines</span>
          </header>
          <ol v-if="runtime.logs.value.length > 0" class="slides-app__log-list">
            <li v-for="(entry, index) in runtime.logs.value" :key="`${index}:${entry}`">
              {{ entry }}
            </li>
          </ol>
          <p v-else class="slides-app__log-empty">No runtime logs yet.</p>
        </section>
      </aside>
    </div>

    <StatusBanner as="footer" class="slides-app__status">
      <span>{{ statusText }}</span>
    </StatusBanner>
  </AppFrame>
</template>

<style scoped lang="scss">
.slides-app {
  background: var(--color-bg);
  color: var(--color-fg);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}

.slides-app__header {
  align-items: center;
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-md);
  min-width: 0;
  padding: var(--space-md) var(--space-lg);
}

.slides-app__icon {
  flex: 0 0 auto;
  height: 32px;
  width: 32px;
}

.slides-app__title {
  flex: 1 1 auto;
  min-width: 0;

  h1,
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h1 {
    font-size: 16px;
    font-weight: 700;
  }

  p {
    color: var(--color-fg-muted);
    font-size: 12px;
  }
}

.slides-app__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}

.slides-app__workspace {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(260px, 1fr) minmax(280px, 42%);
  min-height: 0;
}

.slides-app__sidebar,
.slides-app__preview {
  min-height: 0;
  overflow: auto;
}

.slides-app__sidebar {
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
}

.slides-app__new {
  display: grid;
  gap: var(--space-sm);

  label {
    color: var(--color-fg-muted);
    font-size: 12px;
  }

  input {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-fg);
    font: inherit;
    min-width: 0;
    padding: var(--space-sm);
  }
}

.slides-app__deck-list {
  display: grid;
  gap: var(--space-xs);
}

.slides-app__deck {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: grid;
  font: inherit;
  gap: 2px;
  padding: var(--space-sm);
  text-align: left;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--color-fg-muted);
    font-size: 12px;
  }
}

.slides-app__deck:hover,
.slides-app__deck:focus-visible,
.slides-app__deck--active {
  background: var(--color-bg-elevated);
  border-color: var(--color-border);
}

.slides-app__deck--active {
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.slides-app__editor {
  min-height: 0;
  min-width: 0;
}

.slides-app__textarea {
  background: var(--color-bg);
  border: 0;
  color: var(--color-fg);
  font-family: var(--font-mono);
  font-size: 13px;
  height: 100%;
  line-height: 1.55;
  outline: 0;
  padding: var(--space-lg);
  resize: none;
  width: 100%;
}

.slides-app__textarea:focus-visible {
  outline: 0;
}

.slides-app__preview {
  background: var(--color-bg-subtle);
  border-left: 1px solid var(--color-border);
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(132px, 30%);
  min-width: 0;
  overflow: hidden;
}

.slides-app__iframe {
  border: 0;
  display: block;
  height: 100%;
  width: 100%;
}

.slides-app__preview-state {
  display: grid;
  gap: var(--space-sm);
  min-height: 0;
  overflow: auto;
  padding: var(--space-lg);

  strong {
    text-transform: capitalize;
  }

  span {
    color: var(--color-fg-muted);
    line-height: 1.5;
  }
}

.slides-app__log {
  border-top: 1px solid var(--color-border);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.slides-app__log-header {
  align-items: center;
  background: var(--color-bg-elevated);
  display: flex;
  gap: var(--space-sm);
  justify-content: space-between;
  min-width: 0;
  padding: var(--space-xs) var(--space-md);

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 12px;
  }

  span {
    color: var(--color-fg-muted);
    font-size: 11px;
  }
}

.slides-app__log-list,
.slides-app__log-empty {
  color: var(--color-fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-sm) var(--space-md);
}

.slides-app__log-list {
  list-style: none;
  white-space: pre-wrap;
}

.slides-app__log-empty {
  align-content: start;
  display: grid;
}

.slides-app__status {
  background: var(--color-bg-subtle);
  border-top: 1px solid var(--color-border);
  border-block-end: 0;
  border-inline: 0;
  border-radius: 0;
  color: var(--color-fg-muted);
  font-size: 12px;
  min-height: 28px;
  padding-block-start: var(--space-sm);
  padding-block-end: calc(var(--space-sm) + var(--mobile-shell-app-bottom-padding, 0px));
  padding-inline: var(--space-lg);
}

@media (max-width: 860px) {
  .slides-app__workspace {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(300px, 1fr) minmax(220px, 36%);
  }

  .slides-app__sidebar,
  .slides-app__preview {
    border-left: 0;
    border-right: 0;
  }
}
</style>
