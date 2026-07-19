<script setup vapor lang="ts">
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "~/components/ui";
import Info from "~icons/lucide/info";
import Lock from "~icons/lucide/lock";
import LogOut from "~icons/lucide/log-out";
import Palette from "~icons/lucide/palette";
import Search from "~icons/lucide/search";
import Settings from "~icons/lucide/settings";
import { useKernel } from "~/composables/useKernel";
import type { CommandDispatchOptions } from "~/types/command";

const kernel = useKernel();

function launchApp(manifestId: string): void {
  kernel.events.emit("app.launch.requested", { manifestId, source: "menu" });
}

function openSpotlight(): void {
  kernel.events.emit("spotlight.open.requested", { source: "menu" });
}

function dispatchCommand(
  id: string,
  payload?: NonNullable<CommandDispatchOptions["payload"]>,
): void {
  void kernel.commands.dispatch(id, {
    source: "menu",
    ...(payload === undefined ? {} : { payload }),
  });
}
</script>

<template>
  <span class="brand-menu-host">
    <DropdownMenu>
      <template #trigger>
        <Button type="button" class="brand" variant="plain" size="xs" aria-label="WebOS menu">
          <span class="brand__wordmark">WebOS</span>
          <span class="brand__dot" aria-hidden="true" />
        </Button>
      </template>

      <template #items>
        <DropdownMenuLabel class="ds-dropdown-menu__label">WebOS</DropdownMenuLabel>
        <DropdownMenuItem
          text-value="About"
          @select="dispatchCommand('settings:openSection', { section: 'about' })"
        >
          <Info class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>About</span>
        </DropdownMenuItem>
        <DropdownMenuItem text-value="System Settings" @select="launchApp('settings')">
          <Settings class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>System Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem text-value="Spotlight" @select="openSpotlight">
          <Search class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>Spotlight</span>
        </DropdownMenuItem>
        <DropdownMenuItem text-value="Toggle Theme" @select="dispatchCommand('theme:toggle')">
          <Palette class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>Toggle Theme</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem text-value="Lock Desktop" @select="dispatchCommand('system:lock')">
          <Lock class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>Lock Desktop</span>
        </DropdownMenuItem>
        <DropdownMenuItem text-value="Sign Out" @select="dispatchCommand('system:signOut')">
          <LogOut class="ds-dropdown-menu__item-icon" aria-hidden="true" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenu>
  </span>
</template>

<style scoped lang="scss">
.brand-menu-host {
  display: contents;
}

.brand {
  align-items: center;
  appearance: none;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--menubar-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: var(--menubar-font-size);
  font-weight: 600;
  gap: var(--space-sm);
  letter-spacing: 0;
  margin: 0;
  block-size: calc(var(--menubar-height) - 6px);
  min-block-size: calc(var(--menubar-height) - 6px);
  padding: 0 var(--space-sm);
  transition:
    background-color var(--duration-fast) var(--ease),
    color var(--duration-fast) var(--ease);
}

.brand:hover,
.brand[data-state="open"] {
  background: var(--color-bg-subtle);
}

.brand:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-accent-sheen) 75%, transparent);
  outline-offset: 2px;
}

.brand__dot {
  background: var(--color-accent);
  border-radius: 50%;
  box-shadow: 0 0 4px var(--color-accent);
  flex-shrink: 0;
  height: 6px;
  width: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .brand__dot {
    box-shadow: 0 0 3px var(--color-accent);
  }
}
</style>
