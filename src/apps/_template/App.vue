<script setup lang="ts">
import { Wallpaper } from "~/icons/lucide";
</script>

<template>
  <article class="template-app">
    <Wallpaper aria-hidden="true" :stroke-width="2" color="currentColor" />
    <p>Starter App — wired for Phase&nbsp;3+ integration.</p>
  </article>
</template>

<style scoped lang="scss">
.template-app {
  align-items: center;
  backdrop-filter: blur(12px);
  background-color: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.09);
  // corners curved to nest against the window's rounded bottom chrome.
  border-radius: 0 0 0.875rem 0.875rem;
  color: rgba(248, 250, 252, 0.95);
  display: grid;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  gap: 0.75rem;
  justify-items: center;
  padding: 1rem 1.5rem;
  text-align: center;
}
</style>
