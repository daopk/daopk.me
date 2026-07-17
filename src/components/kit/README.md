# Component kit

The app-composition layer built around Ropav. Apps import behavior and controls
directly from `~/components/ui` (the stable Ropav façade) and use `kit` only for
daopk-specific layout and shell chrome. `kit` never re-exports `ui`.

```text
~/components/ui    →  rp-*       Ropav controls and interactive primitives
~/components/kit   →  ds-kit-*   daopk layout and app chrome
```

## Choosing the layer

| Layer | Owns                                         | Examples                                                                                                               |
| ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ui`  | Ropav behavior, accessibility, and controls  | `Button`, `Modal`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Tabs`, `Tooltip`, `ToastProvider` |
| `kit` | Product-specific layout and app-shell chrome | `AppFrame`, `AppToolbar`, `Panel`, `SectionHeader`, `ScrollArea`, `EmptyState`, `DataTable`, `ActionRow`               |

Rules:

- Use the Ropav export from `ui` directly for every form control, button,
  status component, floating layer, or composite keyboard widget.
- Use `kit` for product-specific layout or app chrome.
- Style Ropav through its public tokens and Styles API. Do not reimplement its
  state, focus, keyboard, portal, dismissal, or validation behavior.
- First-party runtime apps consume the same surfaces through `@daopk/ui` and
  `@daopk/kit`.

The dev-only [Kit Gallery](../../apps/_kit-gallery) is the interactive reference
for both layers. See the [ui README](../ui/README.md) for Ropav exports and
integration details.

## Tokens, density, and safe areas

`src/assets/scss/tokens/**` remains the product styling authority. The Ropav
bridge in [`../ui/ropavBridge.scss`](../ui/ropavBridge.scss) maps those product
tokens to Ropav's public variables, including touch-aware control sizes.

`ShellHost` writes `data-shell` and `data-pointer` on `<html>`. Desktop controls
stay compact while mobile/coarse-pointer controls use a touch-friendly floor.
Do not hardcode control sizes in individual callsites.

The mobile shell exposes `--mobile-shell-app-safe-area-*` and
`--mobile-shell-app-bottom-padding`. Consume them through:

- `AppFrame.safeArea`: `true` (default), `"all"`, `"bottom"`, or `false`.
- `ScrollArea.safeArea`: pads scroll content beyond the home indicator.

## Accessibility

- Let Ropav own keyboard, focus, ARIA, portal, and dismissal behavior.
- Ropav `IconButton` requires `ariaLabel`; decorative icons use `aria-hidden`.
- Tables expose their documented table/row/header/cell roles.
- Respect reduced motion and preserve visible focus indicators.

For forms, compose Ropav `Field` with the direct control. Pass the slot's
accessibility bindings to the control rather than adding a wrapper:

```vue
<Field label="Email" description="Work address" :error="emailError" required>
  <template #default="control">
    <Input v-model="email" type="email" v-bind="control" />
  </template>
</Field>
```

## App recipe

```vue
<script setup lang="ts">
import { AppFrame, AppToolbar, ScrollArea, ToolbarTitle, useAppChrome } from "~/components/kit";
import { Button } from "~/components/ui";

useAppChrome({ title: () => "My App" });
</script>

<template>
  <AppFrame layout="flex-column" aria-label="My App">
    <AppToolbar density="comfortable">
      <ToolbarTitle title="My App" />
      <template #end>
        <Button size="sm">Action</Button>
      </template>
    </AppToolbar>
    <ScrollArea safe-area><!-- content --></ScrollArea>
  </AppFrame>
</template>
```

`useAppChrome()` synchronizes the mobile header title/back action and is a no-op
in the desktop window. Its state is cleared on unmount.

## Kit API

| Component                       | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `AppFrame`                      | App root, layout, background, and safe-area policy |
| `AppToolbar`                    | Top/bottom app bar with start/default/end slots    |
| `ToolbarGroup` / `ToolbarTitle` | Toolbar grouping and title metadata                |
| `Panel`                         | Product surface container                          |
| `SectionHeader` / `GroupLabel`  | Page, section, and group headings                  |
| `ScrollArea`                    | Tokenized scroll container with safe-area support  |
| `Separator` / `Spinner`         | Layout separator and loading indicator             |
| `EmptyState`                    | Product empty placeholder                          |
| `DataTable`                     | ARIA table layout wrapper                          |
| `ActionRow` / `ListButton`      | Product setting row and selectable list item       |
| `PreviewHost`                   | Resolves an app preview provider                   |
