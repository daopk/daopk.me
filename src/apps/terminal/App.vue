<script setup lang="ts">
import { inject, nextTick, ref, useTemplateRef, watch } from "vue";

import { useAppLifecycle } from "~/composables/useAppLifecycle";
import { AppContextInjectionKey } from "~/types/app";
import { useTerminalSession } from "./useTerminalSession";

const ctx = inject(AppContextInjectionKey, null);
const { onPhase } = useAppLifecycle(() => ctx?.handleId);

const { scrollback, cwd, submit, prevHistory, nextHistory, resetHistoryCursor } =
  useTerminalSession(ctx?.handleId ?? "default");

const input = ref<string>("");
const scrollbackRef = useTemplateRef<HTMLElement>("scrollbackRef");
const inputRef = useTemplateRef<HTMLInputElement>("inputRef");
onPhase("suspended", () => {
  inputRef.value?.blur();
});

function scrollToBottom(): void {
  const el = scrollbackRef.value;
  if (!el) {
    return;
  }
  el.scrollTop = el.scrollHeight;
}

watch(
  () => scrollback.value.length,
  () => {
    void nextTick(scrollToBottom);
  },
);

async function onSubmit(): Promise<void> {
  const line = input.value;
  input.value = "";
  await submit(line);
  await nextTick();
  inputRef.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const prev = prevHistory();
    if (prev !== undefined) {
      input.value = prev;
    }
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const next = nextHistory();
    if (next !== undefined) {
      input.value = next;
    }
    return;
  }
  if (event.key === "l" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void submit("clear");
  }
}

function onInputEdit(): void {
  resetHistoryCursor();
}
</script>

<template>
  <section class="terminal" :aria-label="'Terminal'">
    <ol
      ref="scrollbackRef"
      class="terminal__scrollback"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      <li
        v-for="(entry, idx) in scrollback"
        :key="`${entry.ts}-${idx}`"
        class="terminal__line"
        :class="`terminal__line--${entry.kind}`"
      >
        <span v-if="entry.kind === 'input'" class="terminal__prompt" aria-hidden="true">$</span>
        <span class="terminal__text">{{ entry.text }}</span>
      </li>
    </ol>

    <form class="terminal__prompt-row" @submit.prevent="onSubmit">
      <span class="terminal__prompt" aria-hidden="true">{{ cwd }} $</span>
      <input
        ref="inputRef"
        v-model="input"
        class="terminal__input"
        type="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Terminal input"
        @keydown="onKeydown"
        @input="onInputEdit"
      />
    </form>
  </section>
</template>

<style scoped lang="scss">
.terminal {
  background: var(--color-bg-elevated);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  inline-size: 100%;
  line-height: 1.45;
}

.terminal__scrollback {
  flex: 1 1 auto;
  list-style: none;
  margin: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-block: var(--space-sm);
  padding-inline-end: calc(var(--space-md) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-md) + var(--mobile-shell-app-safe-area-left, 0px));
}

.terminal__line {
  display: flex;
  gap: var(--space-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.terminal__line--input {
  color: var(--color-fg);
}

.terminal__line--output {
  color: var(--color-fg);
}

.terminal__line--error {
  color: var(--color-error-soft);
}

.terminal__line--system {
  color: var(--color-fg-muted);
  font-style: italic;
}

.terminal__prompt {
  color: var(--color-accent);
  flex: 0 1 auto;
  max-inline-size: 45%;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal__text {
  flex: 1 1 auto;
}

.terminal__prompt-row {
  align-items: center;
  border-block-start: 1px solid var(--color-border);
  display: flex;
  gap: var(--space-xs);
  padding-block-end: calc(var(--space-sm) + var(--mobile-shell-app-bottom-padding, 0px));
  padding-block-start: var(--space-sm);
  padding-inline-end: calc(var(--space-md) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-md) + var(--mobile-shell-app-safe-area-left, 0px));
}

.terminal__input {
  background: transparent;
  border: none;
  color: inherit;
  flex: 1 1 auto;
  font: inherit;
  min-inline-size: 4ch;
  outline: none;
  padding: 0;
}

.terminal__input:focus-visible {
  outline: none;
}

// iOS Safari zooms in on focus when font-size < 16px. Setting 16px satisfies
@media (hover: none) and (pointer: coarse) {
  .terminal__input {
    font-size: 16px;
    transform: scale(0.8125);
    transform-origin: left center;
  }
}
</style>
