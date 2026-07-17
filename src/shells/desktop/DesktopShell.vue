<script setup vapor lang="ts">
import { useTemplateRef } from "vue";

import Dock from "./dock/Dock.vue";
import DesktopContextMenuLayer from "./contextMenu/DesktopContextMenuLayer.vue";
import MenuBar from "./menubar/MenuBar.vue";
import PermissionPromptHost from "./permissionPrompt/PermissionPromptHost.vue";
import DesktopRenderLayer from "./renderLayer/DesktopRenderLayer.vue";
import SpotlightHost from "./spotlight/SpotlightHost.vue";
import DesktopWidgetGallery from "./widgetGallery/DesktopWidgetGallery.vue";
import Wallpaper from "~/components/wallpaper/Wallpaper.vue";
import DesktopWidgetLayer from "./widgetLayer/DesktopWidgetLayer.vue";
import WindowHost from "./windowManager/WindowHost.vue";
import { useDesktopBrowserZoomGuard } from "./useDesktopBrowserZoomGuard";

const shellRef = useTemplateRef<HTMLElement>("shellRef");

useDesktopBrowserZoomGuard(shellRef);
</script>

<template>
  <div ref="shellRef" class="desktop-shell" data-shell="desktop">
    <Wallpaper shell-id="desktop" />
    <MenuBar />
    <Dock />
    <main class="desktop-stage" aria-label="Desktop workspace">
      <DesktopContextMenuLayer />
      <DesktopWidgetLayer />
      <DesktopRenderLayer />
      <WindowHost />
    </main>
    <!--
      SpotlightHost mounts as a sibling so its overlay can sit above the
      menubar/dock/window stage without inheriting their stacking
      contexts. The host owns its own z-index via tokens.
    -->
    <SpotlightHost />
    <PermissionPromptHost />
    <DesktopWidgetGallery />
  </div>
</template>

<style scoped lang="scss">
.desktop-shell {
  inset: 0;
  overflow: hidden;
  position: fixed;
}

.desktop-stage {
  inset: calc(var(--menubar-height) + max(0px, env(safe-area-inset-top, 0))) 0 0 0;
  overflow: hidden;
  position: absolute;
  z-index: 1;
}
</style>
