<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  FormField,
  IconButton,
  ListButton,
  ScrollArea,
  Spinner,
  StatusBanner,
  Textarea,
  TextInput,
  ToolbarGroup,
  ToolbarTitle,
} from "@daopk/kit";
import { Button, Dialog, DialogActions } from "@daopk/ui";
import { Play, Save } from "@daopk/icons";
import { AppContextInjectionKey, toErrorMessage, useKernel, useVfs } from "@daopk/sdk";

import { parseSlideDeckPath } from "@daopk/content";
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
const discardDialogOpen = ref(false);
const pendingDeckTarget = ref<string | null>(null);

let previewWriteHandle: ReturnType<typeof globalThis.setTimeout> | undefined;

const dirty = computed(() => source.value !== savedSource.value);
const canSave = computed(() => activeDeck.value !== null && dirty.value && !loading.value);
const activeDeckTitle = computed(() => activeDeck.value?.title ?? "No deck selected");
const activeDeckSubtitle = computed(() =>
  activeDeck.value === null ? "Create or select a deck" : deckLabel(activeDeck.value),
);
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
    error.value = toErrorMessage(refreshError);
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
    error.value = toErrorMessage(createError);
  } finally {
    loading.value = false;
  }
}

async function openDeck(
  target: string,
  options: { readonly skipDirtyCheck?: boolean } = {},
): Promise<void> {
  if (!options.skipDirtyCheck && dirty.value) {
    pendingDeckTarget.value = target;
    discardDialogOpen.value = true;
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
    error.value = toErrorMessage(openError);
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
    error.value = toErrorMessage(saveError);
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

function confirmDiscardOpen(): void {
  const target = pendingDeckTarget.value;
  discardDialogOpen.value = false;
  pendingDeckTarget.value = null;
  if (target !== null) {
    void openDeck(target, { skipDirtyCheck: true });
  }
}

function cancelDiscardOpen(): void {
  discardDialogOpen.value = false;
  pendingDeckTarget.value = null;
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
</script>

<template>
  <AppFrame class="slides-app" layout="grid" :safe-area="false" aria-label="Slides">
    <AppToolbar class="slides-app__header">
      <ToolbarTitle
        class="slides-app__title"
        :title="activeDeckTitle"
        :subtitle="activeDeckSubtitle"
      />
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
          <FormField label="New deck" for="slides-new-title">
            <TextInput
              id="slides-new-title"
              v-model="titleDraft"
              autocomplete="off"
              :disabled="loading"
            />
          </FormField>
          <Button type="submit" size="sm" :disabled="loading">Create</Button>
        </form>

        <ScrollArea as="nav" class="slides-app__deck-list" aria-label="Decks">
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
        </ScrollArea>
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
          <template v-if="loading || runtime.status.value === 'installing'" #icon>
            <Spinner />
          </template>
          <strong>{{ runtime.status.value }}</strong>
          <span>{{ statusText }}</span>
        </EmptyState>
        <section class="slides-app__log" aria-label="WebContainer log">
          <header class="slides-app__log-header">
            <strong>WebContainer</strong>
            <span>{{ runtime.logs.value.length }} lines</span>
          </header>
          <ScrollArea v-if="runtime.logs.value.length > 0" as="ol" class="slides-app__log-list">
            <li v-for="(entry, index) in runtime.logs.value" :key="`${index}:${entry}`">
              {{ entry }}
            </li>
          </ScrollArea>
          <p v-else class="slides-app__log-empty">No runtime logs yet.</p>
        </section>
      </aside>
    </div>

    <StatusBanner as="footer" class="slides-app__status">
      <span>{{ statusText }}</span>
    </StatusBanner>

    <Dialog
      v-model:open="discardDialogOpen"
      title="Discard unsaved changes?"
      description="Switching decks will discard the unsaved slide changes."
      @close="cancelDiscardOpen"
    >
      <DialogActions>
        <Button size="sm" @click="cancelDiscardOpen">Cancel</Button>
        <Button size="sm" variant="danger" @click="confirmDiscardOpen">Discard</Button>
      </DialogActions>
    </Dialog>
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

.slides-app__title {
  flex: 1 1 auto;
  min-width: 0;
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

.slides-app__sidebar {
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 0;
  overflow: hidden;
  padding: var(--space-md);
}

.slides-app__new {
  display: grid;
  gap: var(--space-sm);
}

.slides-app__deck-list {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-xs);
  min-height: 0;
}

.slides-app__deck {
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: grid;
  font: inherit;
  gap: var(--space-2xs);
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
    font-size: var(--font-size-xs);
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
  min-height: 0;
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
    font-size: var(--font-size-xs);
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
  font-size: var(--font-size-xs);
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
