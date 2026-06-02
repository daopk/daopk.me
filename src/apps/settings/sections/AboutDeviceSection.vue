<script setup lang="ts">
import { computed } from "vue";

import { Badge, Panel, SectionHeader } from "~/components/kit";
import Button from "~/components/ui/Button.vue";
import { useSettings } from "~/composables/useSettings";
import { ExternalLink as ExternalLinkIcon, RefreshCw as RefreshIcon } from "~/icons/lucide";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

const settings = useSettings();
const updateState = serviceWorkerUpdateController.state;
const updateCheckState = serviceWorkerUpdateController.checkState;

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const userAgent = computed((): string => {
  if (typeof navigator === "undefined") {
    return "—";
  }
  return navigator.userAgent || "—";
});

const buildTime = computed((): string => {
  const d = new Date(__BUILD_TIME__);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

const isUpdateRefreshing = computed(
  () => updateState.value.kind === "update-available" && updateState.value.refreshing,
);
const isCheckingForUpdates = computed(() => updateCheckState.value.kind === "checking");
const updateButtonVariant = computed<"primary" | "secondary">(() =>
  updateState.value.kind === "update-available" || updateState.value.kind === "refresh-error"
    ? "primary"
    : "secondary",
);
const updateButtonLabel = computed((): string => {
  if (updateState.value.kind === "refresh-error") {
    return "Try again";
  }

  if (updateState.value.kind === "update-available") {
    return "Refresh";
  }

  if (updateCheckState.value.kind === "check-error") {
    return "Check again";
  }

  return "Check for updates";
});
const softwareUpdateTone = computed<"muted" | "success" | "warning" | "danger">(() => {
  if (updateState.value.kind === "update-available") {
    return "warning";
  }

  if (updateState.value.kind === "refresh-error" || updateCheckState.value.kind === "check-error") {
    return "danger";
  }

  if (updateCheckState.value.kind === "up-to-date") {
    return "success";
  }

  return "muted";
});
const softwareUpdateBadgeTone = computed<"neutral" | "accent" | "success" | "danger">(() => {
  switch (softwareUpdateTone.value) {
    case "success":
      return "success";
    case "warning":
      return "accent";
    case "danger":
      return "danger";
    case "muted":
      return "neutral";
  }
  return "neutral";
});
const softwareUpdateStatus = computed((): string => {
  switch (updateState.value.kind) {
    case "update-available":
      return updateState.value.refreshing ? "Applying update..." : "Update available";
    case "refresh-error":
      return `Update couldn't finish. ${updateState.value.message}`;
    case "offline-ready":
      return "Ready offline";
    case "idle":
      break;
  }

  switch (updateCheckState.value.kind) {
    case "checking":
      return "Checking for updates...";
    case "up-to-date":
      return "You're up to date.";
    case "check-error":
      return updateCheckState.value.message;
    case "idle":
      return "";
  }

  return "";
});
const showSoftwareUpdateStatus = computed(() => softwareUpdateStatus.value.length > 0);

function runSoftwareUpdateAction(): void {
  if (updateState.value.kind === "update-available" || updateState.value.kind === "refresh-error") {
    void serviceWorkerUpdateController.refresh();
    return;
  }

  void serviceWorkerUpdateController.checkForUpdate();
}
</script>

<template>
  <article class="about-device" aria-label="About">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      title="About"
      subtitle="Read-only snapshot of what the shell sees. Useful for bug reports and quick diagnostics."
    />

    <Panel as="section" class="about-device__github-card" variant="elevated" padding="lg">
      <div class="about-device__github-copy">
        <div class="about-device__github-heading">
          <h2 class="about-device__github-title">GitHub</h2>
        </div>
        <p class="about-device__github-note">Source code for this WebOS shell and app catalog.</p>
      </div>
      <a
        class="about-device__github-link"
        href="https://github.com/daopk/daopk.me"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>daopk/daopk.me</span>
        <ExternalLinkIcon class="about-device__github-link-icon" aria-hidden="true" />
      </a>
    </Panel>

    <Panel as="section" class="about-device__update-card" variant="elevated" padding="lg">
      <div class="about-device__update-copy">
        <div class="about-device__update-heading">
          <h2 class="about-device__update-title">Software update</h2>
          <Badge
            v-if="showSoftwareUpdateStatus"
            class="about-device__update-status"
            :tone="softwareUpdateBadgeTone"
            :data-tone="softwareUpdateTone"
          >
            {{ softwareUpdateStatus }}
          </Badge>
        </div>
        <p class="about-device__update-note">
          Updates the system shell only. Apps update on their own from the catalog.
        </p>
      </div>
      <Button
        class="about-device__update-action"
        size="sm"
        :variant="updateButtonVariant"
        :icon-start="RefreshIcon"
        :loading="isCheckingForUpdates || isUpdateRefreshing"
        @click="runSoftwareUpdateAction"
      >
        {{ updateButtonLabel }}
      </Button>
    </Panel>

    <Panel as="dl" class="about-device__list" variant="plain" padding="none">
      <div class="about-device__row">
        <dt class="about-device__key">Build time</dt>
        <dd class="about-device__value">{{ buildTime }}</dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Boot count</dt>
        <dd class="about-device__value">{{ settings.bootCount }}</dd>
      </div>
      <div class="about-device__row about-device__row--block">
        <dt class="about-device__key">User-agent</dt>
        <dd class="about-device__value about-device__value--block">
          <code class="about-device__code about-device__code--wrap">{{ userAgent }}</code>
        </dd>
      </div>
    </Panel>
  </article>
</template>

<style scoped lang="scss">
.about-device {
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-xl);
}

.about-device__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
}

.about-device__github-card,
.about-device__update-card {
  align-items: center;
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: minmax(0, 1fr) auto;
}

.about-device__github-copy,
.about-device__update-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-inline-size: 0;
}

.about-device__github-heading,
.about-device__update-heading {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.about-device__github-title,
.about-device__update-title {
  color: var(--color-fg);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.3;
  margin: 0;
}

.about-device__github-link {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  display: inline-flex;
  font-size: var(--font-size-xs);
  gap: var(--space-xs);
  justify-self: end;
  min-block-size: var(--control-height-sm);
  padding: var(--space-2xs) var(--space-sm);
  text-decoration: none;
  transition:
    border-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.about-device__github-link:hover,
.about-device__github-link:focus-visible {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.about-device__github-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.about-device__github-link-icon {
  block-size: 14px;
  flex-shrink: 0;
  inline-size: 14px;
}

.about-device__update-action {
  justify-self: end;
}

.about-device__row {
  align-items: baseline;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-md);
  grid-template-columns: 100px minmax(0, 1fr);
  padding: var(--space-md);
}

.about-device__row--block {
  align-items: flex-start;
}

.about-device__key {
  color: var(--color-fg-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 0;
  text-transform: uppercase;
}

.about-device__value {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: var(--space-xs);
  margin: 0;
}

.about-device__value--block {
  display: block;
}

.about-device__sub {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.about-device__update-status {
  color: var(--color-fg-muted);
  line-height: 1.4;
}

.about-device__github-note,
.about-device__update-note {
  color: var(--color-fg-muted);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

.about-device__update-status[data-tone="success"] {
  color: var(--color-success);
}

.about-device__update-status[data-tone="warning"] {
  color: var(--color-fg);
  font-weight: 600;
}

.about-device__update-status[data-tone="danger"] {
  color: var(--color-error);
  font-weight: 600;
}

.about-device__code {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 6px;
}

.about-device__code--wrap {
  display: inline-block;
  line-height: 1.5;
  padding: var(--space-xs) var(--space-sm);
  word-break: break-all;
}

@media (max-width: 640px) {
  .about-device__github-card,
  .about-device__update-card {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .about-device__github-link,
  .about-device__update-action {
    justify-self: start;
  }
}
</style>
