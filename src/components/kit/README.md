# Component kit

The design-system layer apps build on. It is split into **two independent
layers** with separate imports and a clear boundary. Apps import from each
directly; there is no shared barrel and `kit` never re-exports `ui`.

```
~/components/ui    →  ds-*       interactive / behaviorally complex primitives
~/components/kit   →  ds-kit-*   layout, app-chrome, and plain-HTML controls
```

## kit vs ui — which layer?

| Layer | Prefix     | Owns                                                          | Examples                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui`  | `ds-*`     | Vapor-native stateful / behaviorally complex primitives       | `Button`, `Card`, `Dialog`, `DialogActions`, `Switch`, `Slider`, `DropdownMenu`, `ContextMenu`, `RadioGroup`, `Tooltip`, `ToastHost` (+ `useToast`)                                                                                                                                                                                                                    |
| `kit` | `ds-kit-*` | Layout, app chrome, and plain-HTML form / list / nav controls | `AppFrame`, `AppToolbar`, `ToolbarGroup`, `ToolbarTitle`, `Panel`, `SectionHeader`, `GroupLabel`, `ScrollArea`, `Separator`, `Spinner`, `Badge`, `StatusBanner`, `EmptyState`, `DataTable`, `ActionRow`, `ListButton`, `IconButton`, `FormField`, `TextInput`, `Textarea`, `Select`, `Checkbox`, `Progress`, `SegmentedControl`, `TabList`, `ChoiceCard`, `ChoiceGrid` |

A live, interactive reference for every primitive ships as the dev-only **Kit
Gallery** app ([`src/apps/_kit-gallery`](../../apps/_kit-gallery)). For ui-layer
API details see [`src/components/ui/README.md`](../ui/README.md).

Rules of thumb:

- Needs non-trivial interaction state (focus traps, floating layers, composite
  keyboard navigation, drag) → **ui**.
- Pure layout, app chrome, or a thin wrapper over a native form control →
  **kit**.
- Apps consume these primitives through `@daopk/ui`; implementation dependencies
  stay private to the `ui` layer.

## Tokens

`src/assets/scss/tokens/**` is the styling authority, loaded through
`src/assets/scss/_tokens.scss`. Components must read these instead of
hardcoding values. Never introduce raw hex outside token sources or documented
app-owned palettes (`pnpm lint:tokens:audit` enforces this).

| Group          | Tokens                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type scale     | `--font-size-xs` `--font-size-sm` `--font-size-base` `--font-size-lg` `--font-size-xl` `--font-size-2xl` (all `calc()` off `--font-size-base`, so the Comfort base-size control scales the whole system) |
| Weight         | `--font-weight-medium` `--font-weight-semibold` `--font-weight-bold`                                                                                                                                     |
| Leading        | `--leading-tight` `--leading-snug` `--leading-normal` `--leading-relaxed`                                                                                                                                |
| Control height | `--control-height-sm` `--control-height-md` `--control-height-lg` (touch-aware, see below)                                                                                                               |
| Spacing        | `--space-2xs` `--space-xs` `--space-sm` `--space-md` `--space-lg` `--space-xl` `--space-2xl` (scaled by `--density-scale`; do not add numeric aliases like `--space-2`)                                  |
| Radius         | `--radius-sm` `--radius-md` `--radius-lg` `--radius-full`                                                                                                                                                |
| Color          | `--color-bg*`, `--color-fg` / `--color-fg-muted` / `--color-fg-subtle`, `--color-border`, `--color-accent*`, `--color-fg-on-accent`, `--color-error*`, `--color-success`                                 |
| Motion         | `--duration-fast` `--duration-base` `--ease`                                                                                                                                                             |

## Density & touch

Control heights are the core of the "native on both shells" behavior. The same
component is **compact for a mouse** and **comfortable for a finger** with no
per-call props:

- Desktop / fine pointer: `sm 28 · md 32 · lg 40`.
- Coarse pointer **or** the mobile shell: bumped to `sm 36 · md 44 · lg 52`
  (the ~44px native floor).

`ShellHost` writes `data-shell` / `data-pointer` on `<html>`, and the density
token partial raises the control-height tokens via `@media (pointer: coarse)` and
`:root[data-shell="mobile"]`. Bind interactive heights to `--control-height-*`
(inputs use `--control-height-md`) rather than fixed pixels. For controls that
must keep a small visual size on touch (e.g. `Switch`, `Checkbox`), expand the
tap target with a transparent `::before` of `max(100%, 44px)` under
`@media (pointer: coarse)`.

### Safe areas

The mobile shell exposes `--mobile-shell-app-safe-area-*` and
`--mobile-shell-app-bottom-padding` on the app body. Consume them through:

- `AppFrame`'s `safeArea` prop: `true` (default — bottom + horizontal),
  `"all"`, `"bottom"`, or `false`.
- `ScrollArea`'s `safeArea` boolean to pad scrolled content past the home
  indicator.

## Accessibility floor

- Every interactive control is reachable and operable by keyboard, with a
  visible `:focus-visible` ring.
- Icon-only controls (`IconButton`) require a `label`; decorative icons get
  `aria-hidden`.
- Touch targets are ≥44px on coarse pointers (via control-height or a tap-area
  pseudo-element).
- Respect `prefers-reduced-motion`: gate or shorten transitions/animations.
- Tables expose `role="table"/"row"/"columnheader"/"cell"`; choice sets use
  `role="radiogroup"` + `role="radio"`.
- Composite widgets follow their WAI-ARIA pattern. `TabList` is a `tablist`
  with a roving `tabindex` and Arrow / Home / End navigation (disabled tabs are
  skipped). `RadioGroup` (ui) gives the same arrow-key roving focus.
- `FormField` auto-associates the control it wraps (see **Forms** below), so
  hints/errors are programmatically linked and errors are announced.

## Forms

`FormField` is the labelling spine for kit controls. It generates a stable id
(via `useId`), mirrors it onto the `<label for>`, and **provides** a context the
nested control injects — so you do not thread ids by hand:

```vue
<FormField label="Email" hint="Work address" :error="emailError" required>
  <TextInput v-model="email" type="email" />
</FormField>
```

The control (`TextInput`, `Textarea`, `Select`, `Checkbox`) inherits:

- `id` ↔ the label's `for` (explicit `id` / `for` still win).
- `aria-describedby` → the hint **or** error message node.
- `aria-invalid` + the invalid styling whenever `error` is set.
- `aria-required` from the field's `required` flag.

The error message renders with `role="alert"` + `aria-live="assertive"` so it is
announced when it appears.

## App recipe

Compose apps from kit layout primitives + ui controls so they inherit tokens,
density and safe-area behavior on both shells. The canonical skeleton lives in
[`src/apps/_template/App.vue`](../../apps/_template/App.vue):

```vue
<script setup lang="ts">
import { AppFrame, AppToolbar, ScrollArea, ToolbarTitle, useAppChrome } from "~/components/kit";
import { Button } from "~/components/ui";

// Sets the mobile header title / back action; no-ops on the desktop window.
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
    <ScrollArea safe-area>
      <!-- app content -->
    </ScrollArea>
  </AppFrame>
</template>
```

### `useAppChrome()`

Wraps `AppChromeInjectionKey` so apps set the shell title / back action the same
way regardless of shell. The mobile shell provides the controller (it drives the
`AppView` header); the desktop window does not, so calls no-op there. Pass
reactive `title` / `backAction`, or call the returned `setTitle` / `setBackAction`
imperatively — whatever the scope sets is cleared on unmount.

## API reference (kit)

Props in **bold** are required. Every component reads tokens and inherits the
density / safe-area behavior above; the live demos are in the Kit Gallery.

| Component          | Purpose                          | Key props                                                                                            | Emits / slots                                         |
| ------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `AppFrame`         | App root element                 | `background`, `layout`, `safeArea` (`true`/`"all"`/`"bottom"`/`false`)                               | default slot · exposes `element`                      |
| `AppToolbar`       | Top/bottom app bar               | `density`, `wrap`                                                                                    | `start` / default / `end` slots                       |
| `ToolbarGroup`     | Grouped toolbar controls         | `label`, `separated`                                                                                 | default slot (`role="group"`)                         |
| `ToolbarTitle`     | Toolbar title block              | `title`, `subtitle`                                                                                  | —                                                     |
| `Panel`            | Surface container                | `as`, `variant` (`default`/`subtle`/`elevated`/`plain`), `padding`                                   | default slot                                          |
| `SectionHeader`    | Section/page heading             | `title`, `subtitle`, `icon`, `size` (`section`/`page`)                                               | `actions` slot                                        |
| `GroupLabel`       | Small group caption              | `as`                                                                                                 | default slot                                          |
| `ScrollArea`       | Scroll container                 | `axis` (`vertical`/`horizontal`), `safeArea`                                                         | default slot · exposes `element`                      |
| `Separator`        | Divider                          | `orientation`, `decorative`                                                                          | —                                                     |
| `Spinner`          | Busy indicator                   | `size` (`sm`/`md`/`lg`), `label`                                                                     | — (`role="status"`)                                   |
| `Progress`         | Progress bar                     | `value` (`number`/`null` = indeterminate), `max`, `label`, `size`                                    | — (`role="progressbar"`)                              |
| `Badge`            | Inline status pill               | `tone`, `size`                                                                                       | default slot                                          |
| `StatusBanner`     | Block status message             | `tone` (`info`/`success`/`warning`/`error`), `as`, `role`                                            | default slot                                          |
| `EmptyState`       | Empty placeholder                | `icon`, `title`, `description`                                                                       | default slot                                          |
| `DataTable`        | ARIA grid wrapper                | **`label`**, `variant` (`plain`/`lined`)                                                             | default slot (`role="row"` rows)                      |
| `ActionRow`        | Setting row + control            | `title`, `description`                                                                               | default slot (control)                                |
| `ListButton`       | Selectable list item             | `title`, `meta`, `icon`, `active`                                                                    | click                                                 |
| `IconButton`       | Icon-only button                 | **`icon`**, **`label`**, `variant`, `size`, `pressed`, `active`, `disabled`                          | click                                                 |
| `FormField`        | Label + a11y wiring              | `label`, `for`, `hint`, `error`, `required`                                                          | default slot (control)                                |
| `TextInput`        | Text field                       | `modelValue`, `type`, `variant`, `invalid`, `id`, `name`, `placeholder`, `inputmode`, `autocomplete` | `update:modelValue` · exposes `focus`/`blur`/`select` |
| `Textarea`         | Multi-line field                 | `modelValue`, `rows`, `resize`, `variant`, `invalid`, `id`, `name`, `placeholder`                    | `update:modelValue` · exposes `focus`/`blur`          |
| `Select`           | Native select                    | **`modelValue`**, **`options`**, `placeholder`, `invalid`, `id`, `name`                              | `update:modelValue` · exposes `focus`/`blur`          |
| `Checkbox`         | Checkbox + label                 | `modelValue`, `indeterminate`, `disabled`, `ariaLabel`, `id`, `name`                                 | `update:modelValue` · default slot                    |
| `SegmentedControl` | Single-select button group       | **`modelValue`**, **`options`**, **`label`**, `showLabels`, `size`                                   | `update:modelValue`, `change`                         |
| `TabList`          | ARIA tablist (keyboard)          | **`modelValue`**, **`tabs`**, **`label`**, `size`                                                    | `update:modelValue`, `change`                         |
| `ChoiceCard`       | Selectable radio card            | `selected`, `title`, `description`, `icon`                                                           | `select`                                              |
| `ChoiceGrid`       | Radiogroup of choice cards       | **`label`**                                                                                          | default slot                                          |
| `PreviewHost`      | Resolves an app preview provider | **`input`**, **`surface`**, `fallbackTitle`                                                          | —                                                     |
