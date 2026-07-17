<script setup vapor lang="ts">
import { computed, onUnmounted, shallowRef } from "vue";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { debugWarn } from "~/core/debug";
import type { DesktopContextMenuItemManifest, DesktopPoint } from "~/types/desktop";

const kernel = useKernel();

interface ShellContextMenuItem {
  kind: "shell";
  id: string;
  label: string;
  group: string;
  order: number;
  commandId: string;
  payload?: Readonly<Record<string, unknown>>;
}

interface AppContextMenuItem {
  kind: "app";
  id: string;
  label: string;
  group: string;
  order: number;
  item: DesktopContextMenuItemManifest;
}

type ContextMenuEntry = ShellContextMenuItem | AppContextMenuItem;

const GROUP_ORDER: Record<string, number> = {
  open: 0,
  create: 10,
  customize: 20,
  system: 30,
};

const shellItems: readonly ShellContextMenuItem[] = [
  {
    kind: "shell",
    id: "open-finder",
    label: "Open Finder",
    group: "open",
    order: 0,
    commandId: "app:open",
    payload: { manifestId: "finder" },
  },
  {
    kind: "shell",
    id: "new-terminal-window",
    label: "New Terminal Window",
    group: "open",
    order: 10,
    commandId: "app:spawnNew",
    payload: { manifestId: "terminal" },
  },
  {
    kind: "shell",
    id: "change-wallpaper",
    label: "Change Wallpaper",
    group: "customize",
    order: 0,
    commandId: "settings:openSection",
    payload: { section: "background" },
  },
  {
    kind: "shell",
    id: "add-widgets",
    label: "Add Widgets...",
    group: "customize",
    order: 10,
    commandId: "widgets:openGallery",
  },
  {
    kind: "shell",
    id: "toggle-theme",
    label: "Toggle Theme",
    group: "system",
    order: 0,
    commandId: "theme:toggle",
  },
];

const contributionItems = shallowRef<readonly DesktopContextMenuItemManifest[]>(
  kernel.desktop.contextMenu.list({ surface: "desktop:background" }),
);

const lastPosition = shallowRef<DesktopPoint>({
  x: 0,
  y: 0,
  clientX: 0,
  clientY: 0,
});

function refreshContributionItems(): void {
  contributionItems.value = kernel.desktop.contextMenu.list({ surface: "desktop:background" });
}

const stopContextMenuRegistered = kernel.events.on(
  "desktop.context-menu.registered",
  refreshContributionItems,
);
const stopContextMenuUnregistered = kernel.events.on(
  "desktop.context-menu.unregistered",
  refreshContributionItems,
);

onUnmounted(() => {
  stopContextMenuRegistered();
  stopContextMenuUnregistered();
});

const menuEntries = computed<readonly ContextMenuEntry[]>(() => {
  const appItems: AppContextMenuItem[] = contributionItems.value.map((item) => ({
    kind: "app",
    id: item.id,
    label: item.label,
    group: item.group ?? "create",
    order: item.order ?? 100,
    item,
  }));

  return [...shellItems, ...appItems].sort((a, b) => {
    const groupDelta = groupOrder(a.group) - groupOrder(b.group);
    if (groupDelta !== 0) {
      return groupDelta;
    }
    const orderDelta = a.order - b.order;
    return orderDelta === 0 ? a.label.localeCompare(b.label) : orderDelta;
  });
});

const menuGroups = computed(() => {
  const groups: Array<{ group: string; items: readonly ContextMenuEntry[] }> = [];
  for (const entry of menuEntries.value) {
    const last = groups.at(-1);
    if (last?.group === entry.group) {
      groups[groups.length - 1] = { group: last.group, items: [...last.items, entry] };
    } else {
      groups.push({ group: entry.group, items: [entry] });
    }
  }
  return groups;
});

function groupOrder(group: string): number {
  return GROUP_ORDER[group] ?? 100;
}

function dispatch(id: string, payload?: Readonly<Record<string, unknown>>): void {
  void kernel.commands.dispatch(id, {
    source: "menu",
    ...(payload === undefined ? {} : { payload }),
  });
}

function onContextMenu(event: MouseEvent): void {
  const stage = document.querySelector<HTMLElement>(".desktop-stage");
  const rect = stage?.getBoundingClientRect();
  lastPosition.value = {
    x: rect === undefined ? event.clientX : event.clientX - rect.left,
    y: rect === undefined ? event.clientY : event.clientY - rect.top,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function selectEntry(entry: ContextMenuEntry): void {
  if (entry.kind === "shell") {
    dispatch(entry.commandId, entry.payload);
    return;
  }

  void runContribution(entry.item);
}

async function runContribution(item: DesktopContextMenuItemManifest): Promise<void> {
  const manifestId = item.manifestId;
  if (manifestId === undefined) {
    debugWarn("[desktop-context-menu]", "missing manifestId for contribution", item.id);
    return;
  }

  const controller = new AbortController();
  const handle = kernel.processes.spawn(manifestId, {
    contributionId: item.id,
    surface: item.surface,
    position: lastPosition.value,
  });

  try {
    const action = await item.action();
    if (typeof action !== "function") {
      debugWarn("[desktop-context-menu]", "contribution did not resolve to a function", item.id);
      return;
    }
    await action({
      kernel,
      manifestId,
      handle,
      position: lastPosition.value,
      signal: controller.signal,
    });
  } catch (error) {
    debugWarn("[desktop-context-menu]", "contribution action failed", item.id, error);
  } finally {
    controller.abort();
    kernel.processes.kill(handle.id, "shell");
  }
}
</script>

<template>
  <div class="desktop-context-menu-host">
    <ContextMenu>
      <template #trigger>
        <div
          class="desktop-context-menu-layer"
          aria-hidden="true"
          data-shell-child="context-menu"
          @contextmenu="onContextMenu"
        />
      </template>
      <template #items>
        <template v-for="(group, index) in menuGroups" :key="group.group">
          <ContextMenuSeparator v-if="index > 0" />
          <ContextMenuItem
            v-for="entry in group.items"
            :key="entry.id"
            @select="selectEntry(entry)"
          >
            {{ entry.label }}
          </ContextMenuItem>
        </template>
      </template>
    </ContextMenu>
  </div>
</template>

<style scoped lang="scss">
.desktop-context-menu-host {
  display: contents;
}

.desktop-context-menu-layer {
  inset: 0;
  position: absolute;
  z-index: var(--desktop-widget-layer-z);
}
</style>
