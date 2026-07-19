# `ui` layer

`src/runtime/ui.ts` exposes this directory as the stable `@daopk/ui` runtime
entry. Standard controls are direct re-exports from Ropav; applications should
use Ropav's props, events, slots and built-in behavior instead of adding a
daopk compatibility wrapper.

Direct Ropav exports currently include alerts, aspect ratios, avatars, badges,
buttons and button links, cards, color swatches, form controls, modal, numeric
inputs, overlays, popover, progress, scroll area, tabs, toast and tooltip.
Importing through `@daopk/ui` keeps first-party apps on the host's single
Ropav/Vue runtime copy.

The façade includes the media/layout helpers `AspectRatio` and `Overlay`, the
identity and color primitives `Avatar` and `ColorSwatch`, navigation-aware
`ButtonLink`, and typed `NumberInput`. Their related public prop/part/value
types are exported from the same entry; `Modal` likewise exposes its focus
trap, sizing, slot, and close-reason types.

Use the Ropav `ScrollArea` from this layer for custom scrollbar behavior,
programmatic scrolling and boundary events. Use `kit/ScrollArea` for app-shell
layout that needs semantic tags or mobile safe-area padding.

The local components in this directory are limited to daopk-specific
composition:

- `DropdownMenu` and `ContextMenu` preserve the shell's menu item/submenu API
  while composing `ropav/dropdown-menu` behavior.
- `HoverCard` composes Ropav hover disclosure and floating positioning for the
  richer preview surface used by the shell.
- `ToastHost` applies the daopk viewport class and safe-area styling around
  Ropav's `ToastViewport`. It must be rendered below a `ToastProvider`.

## Styling

Ropav's base stylesheet is loaded once by `src/main.ts`. `ropavBridge.scss`
maps only Ropav's public CSS custom properties to the existing daopk tokens.
Use each component's `class`, `classNames` and `styles` APIs for the few local
visual adjustments a consumer needs; do not depend on Ropav's internal DOM.

Portaled components inherit `#app-overlays` from the root
`TeleportProvider`. Their `teleportTo` prop is the explicit local override.

## Example

```vue
<script setup lang="ts">
import { Button, Modal, useToast } from "@daopk/ui";

const toast = useToast();
</script>

<template>
  <Button variant="solid" @click="toast.success({ title: 'Saved' })">Save</Button>
  <Modal :open="false" title="Preferences" />
</template>
```

`useToast()` requires an ancestor `ToastProvider`; the root application owns
that provider and a single `ToastHost`.

## Verification

Behavioral integration tests in this directory mount the public Ropav exports
through the native Vapor runtime. Relevant gates are:

```sh
pnpm run typecheck:root
pnpm run typecheck:test
pnpm exec vitest run src/components/ui
```
