<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

import { Badge, Panel, SectionHeader } from "~/components/kit";
import Button from "~/components/ui/Button.vue";
import { useBreakpoint } from "~/composables/useBreakpoint";
import { useKernel } from "~/composables/useKernel";
import { useReducedMotion } from "~/composables/useReducedMotion";
import { useSettings } from "~/composables/useSettings";
import { RefreshCw as RefreshIcon } from "~/icons/lucide";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

const kernel = useKernel();
const settings = useSettings();
const { profile, isTouch } = useBreakpoint();
const { reduced } = useReducedMotion();
const updateState = serviceWorkerUpdateController.state;
const updateCheckState = serviceWorkerUpdateController.checkState;

const props = withDefaults(defineProps<{ showHeader?: boolean }>(), {
  showHeader: true,
});

const overridesRef = ref<Record<string, string>>({ ...kernel.theme.currentOverrides() });

const stopTokens = kernel.events.on("tokens.changed", () => {
  overridesRef.value = { ...kernel.theme.currentOverrides() };
});
onUnmounted(stopTokens);

const overrideCount = computed(() => Object.keys(overridesRef.value).length);
const overrideEntries = computed(() => Object.entries(overridesRef.value));

const userAgent = computed((): string => {
  if (typeof navigator === "undefined") {
    return "—";
  }
  return navigator.userAgent || "—";
});

const platform = computed((): string => {
  if (typeof navigator === "undefined") {
    return "—";
  }
  return navigator.platform || "—";
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

const formFactorLabel = computed((): string => {
  const fmt = profile.value.formFactor;
  return fmt.charAt(0).toUpperCase() + fmt.slice(1);
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
      return "Manual check available.";
  }

  return "";
});

function runSoftwareUpdateAction(): void {
  if (updateState.value.kind === "update-available" || updateState.value.kind === "refresh-error") {
    void serviceWorkerUpdateController.refresh();
    return;
  }

  void serviceWorkerUpdateController.checkForUpdate();
}
</script>

<template>
  <article class="about-device" aria-label="About this device">
    <SectionHeader
      v-if="props.showHeader"
      size="page"
      title="About device"
      subtitle="Read-only snapshot of what the shell sees. Useful for bug reports and quick diagnostics."
    />

    <Panel as="dl" class="about-device__list" variant="plain" padding="none">
      <div class="about-device__row">
        <dt class="about-device__key">Build time</dt>
        <dd class="about-device__value">{{ buildTime }}</dd>
      </div>
      <div class="about-device__row about-device__row--action">
        <dt class="about-device__key">Software update</dt>
        <dd class="about-device__value about-device__value--action">
          <Badge
            class="about-device__update-status"
            :tone="softwareUpdateBadgeTone"
            :data-tone="softwareUpdateTone"
          >
            {{ softwareUpdateStatus }}
          </Badge>
          <Button
            size="sm"
            :variant="updateButtonVariant"
            :icon-start="RefreshIcon"
            :loading="isCheckingForUpdates || isUpdateRefreshing"
            @click="runSoftwareUpdateAction"
          >
            {{ updateButtonLabel }}
          </Button>
        </dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Boot count</dt>
        <dd class="about-device__value">{{ settings.bootCount }}</dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Form factor</dt>
        <dd class="about-device__value">
          {{ formFactorLabel }}
          <span class="about-device__sub">({{ isTouch ? "touch" : "no touch" }})</span>
        </dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Theme preference</dt>
        <dd class="about-device__value">
          <code class="about-device__code">{{ settings.theme }}</code>
          <span class="about-device__sub">(resolved: {{ kernel.theme.current() }})</span>
        </dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Reduce motion</dt>
        <dd class="about-device__value">
          <code class="about-device__code">{{ settings.reduceMotion }}</code>
          <span class="about-device__sub">(active: {{ reduced ? "yes" : "no" }})</span>
        </dd>
      </div>
      <div class="about-device__row">
        <dt class="about-device__key">Active overrides</dt>
        <dd class="about-device__value">
          <Badge
            class="about-device__badge"
            :tone="overrideCount === 0 ? 'neutral' : 'accent'"
            :data-empty="overrideCount === 0"
          >
            {{ overrideCount }}
          </Badge>
          <span v-if="overrideCount === 0" class="about-device__sub">
            (stylesheet defaults in use)
          </span>
        </dd>
      </div>
      <div v-if="overrideCount > 0" class="about-device__row about-device__row--block">
        <dt class="about-device__key">Override map</dt>
        <dd class="about-device__value about-device__value--block">
          <ul class="about-device__overrides">
            <li
              v-for="[key, value] in overrideEntries"
              :key="key"
              class="about-device__override-item"
            >
              <code class="about-device__code">{{ key }}</code>
              <span class="about-device__override-sep">→</span>
              <code class="about-device__code">{{ value }}</code>
            </li>
          </ul>
        </dd>
      </div>
      <div class="about-device__row about-device__row--block">
        <dt class="about-device__key">Platform</dt>
        <dd class="about-device__value about-device__value--block">
          <code class="about-device__code about-device__code--wrap">{{ platform }}</code>
        </dd>
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

.about-device__row {
  align-items: baseline;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-md);
  grid-template-columns: minmax(140px, 200px) 1fr;
  padding: var(--space-md);
}

.about-device__row--block {
  align-items: flex-start;
}

.about-device__row--action {
  align-items: center;
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

.about-device__value--action {
  align-items: center;
  justify-content: space-between;
}

.about-device__sub {
  color: var(--color-fg-muted);
  font-size: 12px;
}

.about-device__update-status {
  color: var(--color-fg-muted);
  line-height: 1.4;
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

.about-device__badge {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  border-radius: 999px;
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
  min-width: 24px;
  padding: 2px 8px;
  text-align: center;
}

.about-device__badge[data-empty="true"] {
  background: var(--color-bg-subtle);
  color: var(--color-fg-muted);
}

.about-device__overrides {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  list-style: none;
  margin: 0;
  padding: 0;
}

.about-device__override-item {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.about-device__override-sep {
  color: var(--color-fg-muted);
  font-size: 12px;
}
</style>
