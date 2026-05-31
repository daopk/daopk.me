<script setup lang="ts">
import { computed } from "vue";

import ExternalAppIcon from "~/components/app/ExternalAppIcon.vue";
import { StatusBanner } from "~/components/kit";
import { Button, Dialog } from "~/components/ui";
import type { InstallConsentInfo } from "~/core/apps/installExternalApp";
import { AlertCircle } from "~/icons/lucide";
import type { AppPermission } from "~/types/app";

const props = withDefaults(
  defineProps<{ open: boolean; info: InstallConsentInfo | null; busy?: boolean }>(),
  {
    busy: false,
  },
);

const emit = defineEmits<{
  "update:open": [next: boolean];
  confirm: [];
  cancel: [];
}>();

const PERMISSION_LABELS: Record<AppPermission, string> = {
  "vfs.read": "Read your files",
  "vfs.write": "Modify your files",
  "storage.write": "Store data on this device",
  "shortcut.global": "Register global shortcuts",
  "notifications.post": "Send notifications",
  "network.fetch": "Make network requests",
};

const title = computed(() =>
  props.info ? `${props.info.isUpdate ? "Update" : "Install"} ${props.info.manifest.name}?` : "",
);
const permissions = computed<AppPermission[]>(() => props.info?.manifest.permissions ?? []);

function onUpdateOpen(next: boolean): void {
  emit("update:open", next);
  if (!next && !props.busy) {
    emit("cancel");
  }
}
</script>

<template>
  <Dialog :open="props.open" :title="title" :dismissible="!props.busy" @update:open="onUpdateOpen">
    <div v-if="props.info" class="install-consent">
      <div class="install-consent__identity">
        <span class="install-consent__icon">
          <ExternalAppIcon :icon="props.info.manifest.icon" :label="props.info.manifest.name" />
        </span>
        <span class="install-consent__copy">
          <span class="install-consent__name">{{ props.info.manifest.name }}</span>
          <span class="install-consent__version">v{{ props.info.manifest.version }}</span>
        </span>
      </div>

      <p v-if="props.info.manifest.description" class="install-consent__description">
        {{ props.info.manifest.description }}
      </p>

      <dl class="install-consent__facts">
        <div class="install-consent__fact">
          <dt class="install-consent__fact-label">Runs from</dt>
          <dd class="install-consent__fact-value">{{ props.info.entryOrigin }}</dd>
        </div>
        <div class="install-consent__fact">
          <dt class="install-consent__fact-label">Manifest</dt>
          <dd class="install-consent__fact-value">{{ props.info.manifestUrl }}</dd>
        </div>
      </dl>

      <div v-if="permissions.length > 0" class="install-consent__permissions">
        <span class="install-consent__permissions-title">Requests permission to</span>
        <ul class="install-consent__permissions-list">
          <li v-for="permission in permissions" :key="permission">
            {{ PERMISSION_LABELS[permission] }}
          </li>
        </ul>
        <span class="install-consent__permissions-note">
          You'll still be asked to approve each capability the first time it's used.
        </span>
      </div>

      <StatusBanner as="p" class="install-consent__warning" tone="warning" role="alert">
        <AlertCircle class="install-consent__warning-icon" aria-hidden="true" />
        External apps run with full access to this workspace and its data. Only install apps from
        sources you trust.
      </StatusBanner>

      <div class="install-consent__actions">
        <Button size="sm" :disabled="props.busy" @click="emit('cancel')">Cancel</Button>
        <Button size="sm" variant="primary" :loading="props.busy" @click="emit('confirm')">
          {{ props.info.isUpdate ? "Update" : "Install" }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.install-consent {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.install-consent__identity {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.install-consent__icon {
  block-size: 44px;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  inline-size: 44px;
}

.install-consent__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.install-consent__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-consent__version {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.install-consent__description {
  color: var(--color-fg);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.install-consent__facts {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
}

.install-consent__fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.install-consent__fact-label {
  color: var(--color-fg-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.install-consent__fact-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  margin: 0;
  overflow-wrap: anywhere;
}

.install-consent__permissions {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.install-consent__permissions-title {
  font-size: 13px;
  font-weight: 600;
}

.install-consent__permissions-list {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 2px;
  margin: 0;
  padding-inline-start: var(--space-lg);
}

.install-consent__permissions-note {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.install-consent__warning {
  align-items: flex-start;
  background: color-mix(in srgb, var(--color-warning-soft, #b8860b) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning-soft, #b8860b) 30%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: flex;
  font-size: 13px;
  gap: var(--space-sm);
  line-height: 1.45;
  margin: 0;
  padding: var(--space-md);
}

.install-consent__warning-icon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
  margin-block-start: 1px;
}

.install-consent__actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
