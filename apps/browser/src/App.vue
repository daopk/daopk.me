<script setup vapor lang="ts">
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

<style scoped lang="scss" src="./styles/browser-app.scss"></style>
