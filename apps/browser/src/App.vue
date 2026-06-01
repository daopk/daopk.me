<script setup lang="ts">
import { inject, ref, watch } from "vue";

import {
  AppFrame,
  AppToolbar,
  EmptyState,
  IconButton,
  ListButton,
  ScrollArea,
  Spinner,
  StatusBanner,
  TextInput,
  ToolbarGroup,
} from "@daopk/kit";
import { Button, ContextMenu, ContextMenuItem } from "@daopk/ui";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Home,
  RefreshCw,
  Search,
  Shield,
} from "@daopk/icons";
import { AppContextInjectionKey } from "@daopk/sdk";

import { BROWSER_QUICK_LINKS, useBrowser } from "./useBrowser";

const ctx = inject(AppContextInjectionKey, null);
const browser = useBrowser({ initialUrl: ctx?.args.url });
const addressInput = ref(browser.address.value);

watch(
  () => browser.address.value,
  (next) => {
    addressInput.value = next;
  },
);

function submitAddress(): void {
  if (browser.navigate(addressInput.value)) {
    addressInput.value = browser.address.value;
  }
}

function goBack(): void {
  if (browser.goBack()) {
    addressInput.value = browser.address.value;
  }
}

function goForward(): void {
  if (browser.goForward()) {
    addressInput.value = browser.address.value;
  }
}

function goHome(): void {
  browser.goHome();
  addressInput.value = browser.address.value;
}

function jumpToHistory(index: number): void {
  if (browser.jumpToHistory(index)) {
    addressInput.value = browser.address.value;
  }
}

function openQuickLink(url: string): void {
  addressInput.value = url;
  submitAddress();
}

function selectAddress(event: FocusEvent): void {
  if (event.currentTarget instanceof HTMLInputElement) {
    event.currentTarget.select();
  }
}

function hideBrokenIcon(event: Event): void {
  if (event.currentTarget instanceof HTMLImageElement) {
    event.currentTarget.hidden = true;
  }
}

function openExternally(): void {
  if (browser.current.value.kind !== "web") {
    return;
  }

  window.open(browser.current.value.url, "_blank", "noopener,noreferrer");
}
</script>

<template>
  <AppFrame class="browser" layout="flex-column" :safe-area="false" aria-label="Browser">
    <AppToolbar class="browser__toolbar" wrap>
      <template #start>
        <ToolbarGroup class="browser__nav" label="Navigation controls">
          <ContextMenu :modal="false">
            <template #trigger>
              <IconButton
                label="Back"
                size="sm"
                :icon="ArrowLeft"
                :disabled="!browser.canGoBack.value"
                title="Back"
                @click="goBack"
              />
            </template>
            <template #items>
              <ContextMenuItem v-if="browser.backHistory.value.length === 0" disabled>
                No back history
              </ContextMenuItem>
              <ContextMenuItem
                v-for="item in browser.backHistory.value"
                :key="`back-${item.index}`"
                @select="jumpToHistory(item.index)"
              >
                <span class="browser__history-item">
                  <span class="browser__history-title">{{ item.entry.title }}</span>
                  <span v-if="item.entry.kind === 'web'" class="browser__history-url">
                    {{ item.entry.url }}
                  </span>
                </span>
              </ContextMenuItem>
            </template>
          </ContextMenu>
          <ContextMenu :modal="false">
            <template #trigger>
              <IconButton
                label="Forward"
                size="sm"
                :icon="ArrowRight"
                :disabled="!browser.canGoForward.value"
                title="Forward"
                @click="goForward"
              />
            </template>
            <template #items>
              <ContextMenuItem v-if="browser.forwardHistory.value.length === 0" disabled>
                No forward history
              </ContextMenuItem>
              <ContextMenuItem
                v-for="item in browser.forwardHistory.value"
                :key="`forward-${item.index}`"
                @select="jumpToHistory(item.index)"
              >
                <span class="browser__history-item">
                  <span class="browser__history-title">{{ item.entry.title }}</span>
                  <span v-if="item.entry.kind === 'web'" class="browser__history-url">
                    {{ item.entry.url }}
                  </span>
                </span>
              </ContextMenuItem>
            </template>
          </ContextMenu>
          <IconButton
            label="Reload"
            size="sm"
            :icon="RefreshCw"
            :disabled="!browser.canPreview.value"
            title="Reload"
            @click="browser.reload"
          />
          <IconButton label="Home" size="sm" :icon="Home" title="Home" @click="goHome" />
        </ToolbarGroup>
      </template>

      <form class="browser__address" role="search" @submit.prevent="submitAddress">
        <label class="browser__address-label" for="browser-address">URL</label>
        <img
          v-if="browser.faviconUrl.value"
          :key="browser.faviconUrl.value"
          class="browser__favicon"
          :src="browser.faviconUrl.value"
          alt=""
          decoding="async"
          @error="hideBrokenIcon"
        />
        <Shield
          v-else-if="browser.isSecure.value"
          class="browser__address-icon"
          aria-hidden="true"
        />
        <Globe v-else class="browser__address-icon" aria-hidden="true" />
        <TextInput
          id="browser-address"
          v-model="addressInput"
          class="browser__address-input"
          variant="plain"
          type="text"
          autocomplete="url"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          inputmode="url"
          placeholder="Search or enter address"
          @focus="selectAddress"
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          :icon-start="Search"
          aria-label="Go"
          title="Go"
        />
      </form>

      <template #end>
        <IconButton
          label="Open externally"
          size="sm"
          :icon="ExternalLink"
          :disabled="browser.current.value.kind !== 'web'"
          title="Open externally"
          @click="openExternally"
        />
      </template>
    </AppToolbar>

    <ScrollArea as="nav" axis="horizontal" class="browser__bookmarks" aria-label="Bookmarks">
      <ListButton
        v-for="link in BROWSER_QUICK_LINKS"
        :key="link.url"
        class="browser__bookmark"
        :aria-label="`${link.label}: ${link.url}`"
        @click="openQuickLink(link.url)"
      >
        <template #icon>
          <span class="browser__bookmark-icon" aria-hidden="true">{{ link.iconLabel }}</span>
        </template>
        <span class="browser__bookmark-label">{{ link.label }}</span>
      </ListButton>
    </ScrollArea>

    <main class="browser__viewport">
      <EmptyState
        v-if="browser.current.value.kind === 'start'"
        class="browser__start"
        title="Start"
      >
        <ul class="browser__quick-links" aria-label="Quick links">
          <li v-for="link in BROWSER_QUICK_LINKS" :key="link.url">
            <ListButton class="browser__quick-link" @click="openQuickLink(link.url)">
              <template #icon>
                <span class="browser__quick-link-icon" aria-hidden="true">
                  {{ link.iconLabel }}
                </span>
              </template>
              <span>{{ link.label }}</span>
              <template #end>
                <ExternalLink aria-hidden="true" :size="14" :stroke-width="2" />
              </template>
            </ListButton>
          </li>
        </ul>
      </EmptyState>

      <EmptyState
        v-else-if="browser.previewBlocked.value"
        class="browser__blocked"
        title="This site could not be embedded."
      >
        <template #icon>
          <span class="browser__blocked-mark" aria-hidden="true">
            <ExternalLink :size="32" :stroke-width="1.9" />
          </span>
        </template>
        <p class="browser__blocked-copy">{{ browser.current.value.url }}</p>
        <Button
          variant="primary"
          :icon-start="ExternalLink"
          aria-label="Open current site externally"
          @click="openExternally"
        >
          Open externally
        </Button>
      </EmptyState>

      <iframe
        v-else
        :key="browser.iframeKey.value"
        class="browser__frame"
        :src="browser.iframeSrc.value ?? undefined"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        allow="
          accelerometer;
          autoplay;
          clipboard-write;
          encrypted-media;
          gyroscope;
          picture-in-picture;
          web-share;
        "
        allowfullscreen
        credentialless="credentialless"
        referrerpolicy="no-referrer"
        title="Browser content"
        @error="browser.markPreviewError"
        @load="browser.finishLoad"
      />
    </main>

    <StatusBanner as="footer" class="browser__status">
      <Spinner v-if="browser.isLoading.value" size="sm" />
      {{ browser.message.value }}
    </StatusBanner>
  </AppFrame>
</template>

<style scoped lang="scss">
.browser {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-sm);
  inline-size: 100%;
  min-block-size: 0;
}

.browser__toolbar {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  min-block-size: 48px;
  padding-block: var(--space-xs);
  padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
}

.browser__nav {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
}

.browser__address {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-xs);
  min-inline-size: 120px;
  padding-block: 2px;
  padding-inline: var(--space-sm) 2px;
}

.browser__address:focus-within {
  border-color: var(--color-accent);
}

.browser__address-label {
  block-size: 1px;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.browser__address-icon {
  block-size: 15px;
  color: var(--color-fg-muted);
  flex: 0 0 auto;
  inline-size: 15px;
}

.browser__favicon {
  block-size: 16px;
  flex: 0 0 auto;
  inline-size: 16px;
}

.browser__address-input {
  background: transparent;
  border: 0;
  color: var(--color-fg);
  flex: 1 1 auto;
  font: inherit;
  min-inline-size: 4ch;
  outline: none;
  padding: 0;
}

.browser__address-input:focus-visible {
  outline: none;
}

.browser__bookmarks {
  align-items: center;
  background: var(--color-bg);
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-xs);
  min-block-size: 38px;
  padding-block: var(--space-xs);
  padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
}

.browser__bookmark {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  gap: var(--space-xs);
  min-block-size: 28px;
  padding: 2px var(--space-sm);
}

.browser__bookmark:hover,
.browser__bookmark:focus-visible {
  background: var(--color-bg-subtle);
  border-color: var(--color-border);
}

.browser__bookmark:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.browser__bookmark-icon,
.browser__quick-link-icon {
  align-items: center;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 24%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-accent);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  justify-content: center;
}

.browser__bookmark-icon {
  block-size: 18px;
  inline-size: 18px;
}

.browser__bookmark-label {
  max-inline-size: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser__history-item {
  display: grid;
  gap: 1px;
  min-inline-size: 0;
}

.browser__history-title {
  color: var(--color-fg);
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser__history-url {
  color: var(--color-fg-muted);
  font-size: 11px;
  max-inline-size: 34ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser__viewport {
  flex: 1 1 auto;
  min-block-size: 0;
  position: relative;
}

.browser__start {
  align-items: center;
  block-size: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  inline-size: 100%;
  justify-content: center;
  padding: var(--space-xl);
}

.browser__quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.browser__quick-link {
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  gap: var(--space-xs);
  min-block-size: 34px;
  padding: var(--space-xs) var(--space-md);
}

.browser__quick-link-icon {
  block-size: 20px;
  inline-size: 20px;
}

.browser__quick-link:hover,
.browser__quick-link:focus-visible {
  border-color: var(--color-accent);
}

.browser__quick-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.browser__blocked {
  align-items: center;
  block-size: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  inline-size: 100%;
  justify-content: center;
  padding: var(--space-xl);
  text-align: center;
}

.browser__blocked-mark {
  align-items: center;
  background: color-mix(in srgb, var(--color-fg-muted) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-fg-muted) 22%, transparent);
  border-radius: var(--radius-full);
  color: var(--color-fg-muted);
  display: inline-flex;
  block-size: 64px;
  inline-size: 64px;
  justify-content: center;
}

.browser__blocked-copy {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  margin: 0;
  max-inline-size: min(56ch, 100%);
  overflow-wrap: anywhere;
}

.browser__frame {
  background: var(--color-bg-elevated);
  block-size: 100%;
  border: 0;
  display: block;
  inline-size: 100%;
}

.browser__status {
  align-items: center;
  background: var(--color-bg-subtle);
  border-block-start: 1px solid var(--color-border);
  border-block-end: 0;
  border-inline: 0;
  border-radius: 0;
  color: var(--color-fg-muted);
  display: flex;
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  gap: var(--space-xs);
  min-block-size: 28px;
  overflow: hidden;
  padding-block-start: var(--space-xs);
  padding-block-end: calc(var(--space-xs) + var(--mobile-shell-app-bottom-padding, 0px));
  padding-inline-end: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-sm) + var(--mobile-shell-app-safe-area-left, 0px));
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .browser__toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .browser__toolbar :deep(.ds-kit-toolbar__section--main) {
    flex-basis: 100%;
    order: 2;
  }

  .browser__address {
    flex-basis: 100%;
  }

  .browser__bookmark-label {
    max-inline-size: 10ch;
  }
}
</style>
