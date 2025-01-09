<script setup lang="ts">
import { CloudOff } from "~/icons/lucide";

import WidgetHost from "~/components/widgets/WidgetHost.vue";
import { useOnlineStatus } from "~/composables/useOnlineStatus";

const { isOffline } = useOnlineStatus();
</script>

<template>
  <div class="menubar-status">
    <WidgetHost surface="desktop:menubar" />
    <span v-if="isOffline" class="menubar-status__offline" role="status" aria-label="Offline">
      <CloudOff class="menubar-status__offline-icon" aria-hidden="true" :size="13" />
      <span>offline</span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.menubar-status {
  align-items: center;
  display: inline-flex;
  font-size: var(--menubar-font-size);
  gap: var(--space-md);
}

.menubar-status__offline {
  align-items: center;
  color: var(--menubar-fg-muted);
  display: inline-flex;
  gap: 4px;
  text-transform: lowercase;
}

.menubar-status__offline-icon {
  flex: 0 0 auto;
}
</style>
