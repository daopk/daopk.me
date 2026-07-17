<script setup vapor lang="ts">
import { onScopeDispose } from "vue";

import Spotlight from "~/components/spotlight/Spotlight.vue";
import { useKernel } from "~/composables/useKernel";
import { useShortcut } from "~/composables/useShortcut";
import { useSpotlight } from "~/composables/useSpotlight";
import type { SearchKind } from "~/types/search";

const { open, query, hits, recents, openSpotlight, closeSpotlight, toggle, setQuery, dispatch } =
  useSpotlight();
const kernel = useKernel();

const stopMetaK = useShortcut().listen("Meta+K", (event: KeyboardEvent) => {
  // Block the browser's default ⌘K (Chrome: focus address bar). The
  event.preventDefault();
  toggle();
});

const stopCtrlK = useShortcut().listen("Ctrl+K", (event: KeyboardEvent) => {
  event.preventDefault();
  toggle();
});

const stopOpenRequested = kernel.events.on("spotlight.open.requested", () => {
  openSpotlight();
});

onScopeDispose(() => {
  stopMetaK();
  stopCtrlK();
  stopOpenRequested();
});

function onUpdateQuery(value: string): void {
  setQuery(value);
}

function onDispatch(payload: { kind: SearchKind; id: string }): void {
  void dispatch(payload.kind, payload.id);
}

function onClose(): void {
  closeSpotlight();
}
</script>

<template>
  <Transition name="spotlight-presence">
    <Spotlight
      v-if="open"
      :query="query"
      :hits="hits"
      :recents="recents"
      @update:query="onUpdateQuery"
      @dispatch="onDispatch"
      @close="onClose"
    />
  </Transition>
</template>
