<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, useTemplateRef, watchEffect } from "vue";

import SessionLockOverlay from "~/components/auth/SessionLockOverlay.vue";
import ToastHost from "~/components/ui/ToastHost.vue";
import { runAutorunManifests } from "~/core/boot/autorun";
import {
  consumeInitialAppUrlIntent,
  isFirstPartyAppProtocolUrl,
  parseAppProtocolIntent,
} from "~/core/routing/appUrlIntents";
import { useBreakpoint } from "~/composables/useBreakpoint";
import { useKernel } from "~/composables/useKernel";
import { peekShellStickyOverride, pickShell, type PickedShell } from "~/shells/shellRegistry";

const kernel = useKernel();
const breakpoint = useBreakpoint();
const hostRef = useTemplateRef<HTMLElement>("hostRef");

const bootstrapSticky = peekShellStickyOverride();
// Shell selection is a boot-time snapshot. Resize/orientation profile updates
// may change CSS metadata below, but must not swap the mounted shell.
const picked: PickedShell = pickShell(breakpoint.profile.value, bootstrapSticky);

// Mirror the active shell + pointer onto <html> so token-level rules
// (control-height touch density in `_tokens.scss`) and app styles can react
// without prop drilling. Kept here because ShellHost is the canonical place
// that resolves which shell is live.
watchEffect(() => {
  const root = document.documentElement;
  root.dataset.shell = picked.shellId;

  const pointer = breakpoint.profile.value.pointerCoarse;
  if (pointer) {
    root.dataset.pointer = pointer;
  } else {
    delete root.dataset.pointer;
  }
});

let lastReadyShellId: PickedShell["shellId"] | null = null;

function onShellReady(shellRoot: Element): void {
  const shellId = picked.shellId;

  if (lastReadyShellId === shellId) {
    return;
  }
  lastReadyShellId = shellId;

  const profileSnapshot = breakpoint.profile.value;

  kernel.events.emit("shell.changed", {
    shellId,
    profile: { ...profileSnapshot },
  });

  void nextTick(() => {
    focusShellMain(shellRoot);
  });

  // cancels any pending callback before tearing down (HMR / tests).
  kernel.boot.scheduleIdleAfterShellReady(() => {
    consumeInitialAppUrlIntent(kernel);
    void runAutorunManifests(kernel);
  });
}

function onShellAfterEnter(shellRoot: Element): void {
  onShellReady(shellRoot);
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick, true);

  void nextTick(() => {
    const shellRoot = hostRef.value?.firstElementChild;
    if (shellRoot) {
      onShellReady(shellRoot);
    }
  });
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick, true);
});

function anchorFromClick(event: MouseEvent): HTMLAnchorElement | null {
  if (!(event.target instanceof Element)) {
    return null;
  }

  const anchor = event.target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function onDocumentClick(event: MouseEvent): void {
  if (event.button !== 0 || event.defaultPrevented) {
    return;
  }

  const href = anchorFromClick(event)?.getAttribute("href");
  if (href === undefined || href === null) {
    return;
  }

  const intent = parseAppProtocolIntent(href);
  if (intent.kind !== "app") {
    if (isFirstPartyAppProtocolUrl(href)) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  kernel.events.emit("app.launch.requested", {
    manifestId: intent.manifestId,
    source: "deeplink",
    ...(intent.args === undefined ? {} : { args: intent.args }),
  });
}

function focusShellMain(rootEl: Element): void {
  if (!(rootEl instanceof HTMLElement)) {
    return;
  }

  let target: HTMLElement | null =
    rootEl.tagName.toLowerCase() === "main" ? rootEl : rootEl.querySelector("main");

  if (!(target instanceof HTMLElement)) {
    target = rootEl;
  }

  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}
</script>

<template>
  <div ref="hostRef" class="shell-host">
    <Transition mode="out-in" name="shell-fade" @after-enter="onShellAfterEnter">
      <component :is="picked.component" :key="picked.shellId" />
    </Transition>
    <SessionLockOverlay />
    <ToastHost />
  </div>
</template>

<style scoped lang="scss">
.shell-host {
  block-size: 100vh;
  isolation: isolate;
}

.shell-fade-enter-active,
.shell-fade-leave-active {
  transition: none;
}

.shell-fade-enter-from,
.shell-fade-leave-to {
  opacity: 1;
}
</style>
