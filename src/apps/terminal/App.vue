<script setup vapor lang="ts">
import { inject, nextTick, ref, useTemplateRef, watch, type InputHTMLAttributes } from "vue";

import { AppFrame, ScrollArea } from "~/components/kit";
import { Input } from "~/components/ui";
import { useAppLifecycle } from "~/composables/useAppLifecycle";
import { AppContextInjectionKey } from "~/types/app";
import { useTerminalSession } from "./useTerminalSession";

interface TerminalInputRef {
  nativeElement: HTMLInputElement | null;
  focus: () => void;
}

const ctx = inject(AppContextInjectionKey, null);
const { onPhase } = useAppLifecycle(() => ctx?.handleId);

const { scrollback, cwd, submit, prevHistory, nextHistory, resetHistoryCursor } =
  useTerminalSession(ctx?.handleId ?? "default");

const input = ref<string>("");
const scrollbackRef = useTemplateRef<{ element: HTMLElement | null }>("scrollbackRef");
const inputRef = useTemplateRef<TerminalInputRef>("inputRef");
onPhase("suspended", () => {
  inputRef.value?.nativeElement?.blur();
});

function scrollToBottom(): void {
  const el = scrollbackRef.value?.element;
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

const terminalInputClassNames = {
  root: "terminal__input",
  input: "terminal__input-control",
} as const;

const terminalInputAttrs = {
  autocomplete: "off",
  autocorrect: "off",
  autocapitalize: "off",
  spellcheck: false,
  onKeydown,
} as InputHTMLAttributes;
</script>

<template>
  <AppFrame class="terminal" layout="flex-column" :safe-area="false" :aria-label="'Terminal'">
    <ScrollArea
      ref="scrollbackRef"
      as="ol"
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
    </ScrollArea>

    <form class="terminal__prompt-row" @submit.prevent="onSubmit">
      <Input
        ref="inputRef"
        v-model="input"
        :class-names="terminalInputClassNames"
        :input-attrs="terminalInputAttrs"
        type="text"
        ariaLabel="Terminal input"
        @update:model-value="onInputEdit"
      >
        <template #left>
          <span class="terminal__prompt terminal__input-prompt" aria-hidden="true">
            {{ cwd }} $
          </span>
        </template>
      </Input>
    </form>
  </AppFrame>
</template>

<style scoped lang="scss">
.terminal {
  background: var(--color-bg-elevated);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-size-sm);
  inline-size: 100%;
  line-height: 1.45;
}

.terminal__scrollback {
  flex: 1 1 auto;
  list-style: none;
  margin: 0;
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
  display: flex;
}

.terminal__input {
  border-block-end: 0;
  border-inline: 0;
  border-radius: 0;
  flex: 1 1 auto;
  inline-size: 100%;
  min-inline-size: 4ch;
}

.terminal__input-prompt {
  max-inline-size: min(45vw, 20ch);
}

:deep(.terminal__input:focus-within) {
  border-color: var(--color-border);
  box-shadow: none;
}

:deep(.terminal__input-control) {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  min-block-size: 0;
  min-inline-size: 0;
  outline: none;
  padding: 0;
  width: 100%;
}

:deep(.terminal__input-control:focus-visible) {
  outline: none;
}

// iOS Safari zooms in on focus when font-size < 16px. Setting 16px satisfies
@media (hover: none) and (pointer: coarse) {
  :deep(.terminal__input-control) {
    font-size: 16px;
    transform: scale(0.8125);
    transform-origin: left center;
  }
}
</style>
