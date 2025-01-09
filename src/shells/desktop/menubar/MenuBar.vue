<script setup lang="ts">
import MenuBarBrand from "./MenuBarBrand.vue";
import MenuBarApps from "./MenuBarApps.vue";
import MenuBarStatus from "./MenuBarStatus.vue";
</script>

<template>
  <header class="menu-bar" aria-label="Desktop menu bar">
    <div class="menu-bar__inner">
      <nav class="menu-bar__menus" aria-label="System menus">
        <MenuBarBrand />
        <MenuBarApps />
      </nav>
      <MenuBarStatus />
    </div>
  </header>
</template>

<style scoped lang="scss">
.menu-bar {
  background: var(--menubar-bg-translucent);
  border-bottom: 1px solid var(--color-border);
  padding-top: max(0px, env(safe-area-inset-top, 0));
  padding-inline: var(--space-md);
  position: sticky;
  top: 0;
  z-index: var(--menubar-z);
}

.menu-bar__inner {
  align-items: center;
  display: flex;
  justify-content: space-between;
  min-block-size: var(--menubar-height);
}

.menu-bar__menus {
  align-items: center;
  display: inline-flex;
  gap: var(--space-xs);
}

@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .menu-bar {
    backdrop-filter: blur(var(--menubar-blur));
    -webkit-backdrop-filter: blur(var(--menubar-blur));
  }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .menu-bar {
    background: var(--color-bg-elevated);
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-bar {
    animation: none;
    transition: none;
  }
}
</style>
