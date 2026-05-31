# Component kit

The design-system layer apps build on. It is split into **two independent
layers** with separate imports and a clear boundary. Apps import from each
directly; there is no shared barrel and `kit` never re-exports `ui`.

```
~/components/ui    →  ds-*       interactive / behaviorally complex primitives
~/components/kit   →  ds-kit-*   layout, app-chrome, and plain-HTML controls
```

## kit vs ui — which layer?

| Layer | Prefix     | Owns                                                                                  | Examples                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui`  | `ds-*`     | Stateful / behaviorally complex primitives, the **only** place that imports `reka-ui` | `Button`, `Card`, `Dialog`, `DialogActions`, `Switch`, `Slider`, `DropdownMenu`, `ContextMenu`                                                                                                                                                                                                                                                             |
| `kit` | `ds-kit-*` | Layout, app chrome, and plain-HTML form / list / nav controls                         | `AppFrame`, `AppToolbar`, `ToolbarGroup`, `ToolbarTitle`, `Panel`, `SectionHeader`, `GroupLabel`, `ScrollArea`, `Separator`, `Spinner`, `Badge`, `StatusBanner`, `EmptyState`, `DataTable`, `ActionRow`, `ListButton`, `IconButton`, `FormField`, `TextInput`, `Textarea`, `Select`, `Checkbox`, `SegmentedControl`, `TabList`, `ChoiceCard`, `ChoiceGrid` |

Rules of thumb:

- Needs `reka-ui` or non-trivial interaction state (focus traps, popovers,
  drag) → **ui**.
- Pure layout, app chrome, or a thin wrapper over a native form control →
  **kit**.
- Apps **never** import `reka-ui` directly; go through `ui`.

## Tokens

`src/assets/scss/_tokens.scss` is the single styling authority. Components must
read these instead of hardcoding values. Never introduce raw hex outside
`_tokens.scss` (`pnpm lint:tokens:audit` enforces this).

| Group          | Tokens                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type scale     | `--font-size-xs` `--font-size-sm` `--font-size-base` `--font-size-lg` `--font-size-xl` `--font-size-2xl` (all `calc()` off `--font-size-base`, so the Comfort base-size control scales the whole system) |
| Weight         | `--font-weight-medium` `--font-weight-semibold` `--font-weight-bold`                                                                                                                                     |
| Leading        | `--leading-tight` `--leading-snug` `--leading-normal` `--leading-relaxed`                                                                                                                                |
| Control height | `--control-height-sm` `--control-height-md` `--control-height-lg` (touch-aware, see below)                                                                                                               |
| Spacing        | `--space-2xs` `--space-xs` `--space-sm` `--space-md` `--space-lg` `--space-xl` (scaled by `--density-scale`)                                                                                             |
| Radius         | `--radius-sm` `--radius-md` `--radius-lg` `--radius-full`                                                                                                                                                |
| Color          | `--color-bg*`, `--color-fg` / `--color-fg-muted` / `--color-fg-subtle`, `--color-border`, `--color-accent*`, `--color-error*`, `--color-success`                                                         |
| Motion         | `--duration-fast` `--duration-base` `--ease`                                                                                                                                                             |

## Density & touch

Control heights are the core of the "native on both shells" behavior. The same
component is **compact for a mouse** and **comfortable for a finger** with no
per-call props:

- Desktop / fine pointer: `sm 28 · md 32 · lg 40`.
- Coarse pointer **or** the mobile shell: bumped to `sm 36 · md 44 · lg 52`
  (the ~44px native floor).

`ShellHost` writes `data-shell` / `data-pointer` on `<html>`, and `_tokens.scss`
raises the control-height tokens via `@media (pointer: coarse)` and
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
