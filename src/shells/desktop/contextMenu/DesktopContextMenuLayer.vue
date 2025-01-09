<script setup lang="ts">
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";

const kernel = useKernel();

function dispatch(id: string, payload?: Readonly<Record<string, unknown>>): void {
  void kernel.commands.dispatch(id, {
    source: "menu",
    ...(payload === undefined ? {} : { payload }),
  });
}
</script>

<template>
  <ContextMenu>
    <template #trigger>
      <div class="desktop-context-menu-layer" aria-hidden="true" data-shell-child="context-menu" />
    </template>
    <template #items>
      <ContextMenuItem @select="dispatch('app:open', { manifestId: 'finder' })">
        Open Finder
      </ContextMenuItem>
      <ContextMenuItem @select="dispatch('app:spawnNew', { manifestId: 'terminal' })">
        New Terminal Window
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="dispatch('settings:openSection', { section: 'background' })">
        Change Wallpaper
      </ContextMenuItem>
      <ContextMenuItem @select="dispatch('widgets:openGallery')">Add Widgets...</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="dispatch('theme:toggle')">Toggle Theme</ContextMenuItem>
    </template>
  </ContextMenu>
</template>

<style scoped lang="scss">
.desktop-context-menu-layer {
  inset: 0;
  position: absolute;
  z-index: var(--desktop-widget-layer-z);
}
</style>
