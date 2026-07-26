<script setup vapor lang="ts">
import { computed } from "vue";

import { useToast } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useShellBrowserChromeSync } from "~/shells/shared/useShellBrowserChromeSync";

import SnapPreview from "./SnapPreview.vue";
import Window from "./Window.vue";
import { useDesktopWindowStage } from "./useDesktopWindowStage";
import { useDesktopWindowSession } from "./useDesktopWindowSession";

const kernel = useKernel();
const toast = useToast();
const stage = useDesktopWindowStage();
const session = useDesktopWindowSession({
  kernel,
  stage,
  notifyLaunchFailed: (manifest) => {
    toast.error({
      title: "Couldn't open app",
      description: `${manifest.name} failed to start. Please try again.`,
    });
  },
  notifyUnavailable: (manifestId) => {
    toast.error({ title: "App unavailable", description: `"${manifestId}" isn't installed.` });
  },
});

const browserPath = computed(() => session.state.value.browserPath);
const browserTitle = computed(() => session.state.value.browserTitle);

useShellBrowserChromeSync(browserPath, browserTitle);
</script>

<template>
  <div ref="hostRef" class="window-host">
    <Transition name="snap-preview">
      <SnapPreview
        v-if="session.state.value.snapPreview"
        :edge="session.state.value.snapPreview.edge"
        :stage="session.state.value.snapPreview.stage"
      />
    </Transition>
    <template v-for="record in session.state.value.windows" :key="record.id">
      <Window
        v-if="!record.minimized"
        :record="record"
        :stage-bounds="stage.stageBounds"
        :stage-offset="stage.stageOffset.value"
        @frame:outcome="session.send"
        @close:window="(windowId) => session.send({ type: 'close-window', windowId })"
        @maximize:window="(windowId) => session.send({ type: 'toggle-maximize', windowId })"
        @minimize:window="(windowId) => session.send({ type: 'minimize-window', windowId })"
        @title:window="(windowId, title) => session.send({ type: 'set-title', windowId, title })"
        @content-size:window="
          (windowId, size) => session.send({ type: 'report-content-size', windowId, size })
        "
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.window-host {
  block-size: 100%;
  inline-size: 100%;
  pointer-events: none;
  position: relative;
}

.window-host :deep(.window) {
  pointer-events: auto;
}

.window-host :deep(.snap-preview-enter-from),
.window-host :deep(.snap-preview-leave-to) {
  opacity: 0;
}

.window-host :deep(.snap-preview-enter-active),
.window-host :deep(.snap-preview-leave-active) {
  transition: opacity var(--window-snap-preview-duration) var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .window-host :deep(.snap-preview-enter-active),
  .window-host :deep(.snap-preview-leave-active) {
    transition: none;
  }
}
</style>
