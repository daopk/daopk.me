<script setup lang="ts">
import { Icon } from "@iconify/vue";

import type { ExternalAppIcon } from "~/types/externalApp";

/**
 * Renders an external app's icon: a remote image (loaded with no referrer) or an
 * Iconify icon by name. This is the "string-keyed icon registry" the
 * `AppManifest.icon` contract anticipated for serializable/remote manifests.
 * Sizing is controlled by the container (the host passes a class), mirroring how
 * built-in icons are rendered in the dock and Settings.
 */
const props = defineProps<{ icon: ExternalAppIcon; label?: string }>();
</script>

<template>
  <img
    v-if="props.icon.type === 'url'"
    class="external-app-icon"
    :src="props.icon.src"
    :alt="props.label ?? ''"
    referrerpolicy="no-referrer"
    decoding="async"
    loading="lazy"
    draggable="false"
  />
  <Icon v-else class="external-app-icon" :icon="props.icon.name" mode="svg" aria-hidden="true" />
</template>

<style scoped>
.external-app-icon {
  block-size: 100%;
  display: block;
  inline-size: 100%;
  object-fit: contain;
}
</style>
