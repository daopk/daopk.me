# `ui` layer

Stateful / behaviorally complex primitives. This is the **only** layer allowed
to import [`reka-ui`](https://reka-ui.com); everything here wraps a reka
primitive (or composes one) and dresses it in design-system tokens. Plain-HTML
layout, chrome, and simple form controls live in the sibling
[`kit`](../kit/README.md) layer — read its README first for the token system,
density / safe-area rules, and the kit↔ui boundary.

## Conventions

- **Class prefix** `ds-*` (kit uses `ds-kit-*`).
- **Tokens only.** No raw hex / px for color, spacing, radius, shadow, or
  z-index — consume the CSS custom properties (`--color-*`, `--space-*`,
  `--radius-*`, `--shadow-*`, plus the z-index band in `tokens/_chrome.scss`:
  `--dropdown-menu-z`, `--dialog-*-z`, `--toast-z`, `--tooltip-z`, …).
- **Portaled content uses non-scoped `<style>`.** reka teleports overlays
  (menus, dialogs, tooltips, toasts) out of the component subtree, so their
  styles cannot be `scoped`. Use a unique `ds-*` class and a plain
  `<style lang="scss">` block (see `DropdownMenu.vue`, `Tooltip.vue`,
  `ToastHost.vue`). Non-portaled primitives keep `scoped`.
- **Reduced motion.** Every animation is wrapped in
  `@media (prefers-reduced-motion: reduce)`.
- Exports flow to apps automatically through the `@daopk/ui` façade
  (`src/runtime/ui.ts` re-exports `src/components/ui/index.ts`).

## API reference (ui)

Props in **bold** are required.

| Component                | Wraps (reka)     | Key props                                                                                                                     | Emits / slots                                 |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `Button`                 | —                | `variant` (`primary`/`secondary`/`ghost`/`danger`), `size` (`sm`/`md`), `loading`, `disabled`, `iconStart`, `iconEnd`, `type` | native `click` · default slot                 |
| `Card`                   | —                | `variant` (`default`/`subtle`), `interactive`, `selected`, `as`                                                               | default slot                                  |
| `Switch`                 | `Switch*`        | **`modelValue`**, `disabled` · _needs an accessible name — pass `aria-label`/`aria-labelledby`_                               | `update:modelValue`                           |
| `Slider`                 | `Slider*`        | **`modelValue`**, `min`, `max`, `step`, `orientation`, `disabled`, `ariaLabel`, `ariaValuetext`                               | `update:modelValue`, `commit`                 |
| `RadioGroup`             | `RadioGroupRoot` | `modelValue`, `orientation` (`vertical`/`horizontal`), `disabled`, `label`, `name`                                            | `update:modelValue` · default slot (items)    |
| `RadioGroupItem`         | `RadioGroupItem` | **`value`**, `label`, `disabled`, `id`                                                                                        | default slot (label)                          |
| `Tooltip`                | `Tooltip*`       | `label`, `side`, `align`, `delayDuration`, `sideOffset`, `disabled`                                                           | default slot (trigger, `as-child`), `content` |
| `Dialog`                 | `Dialog*`        | **`open`**, **`title`**, `description`, `variant` (`modal`/`sheet`), `size`, `dismissible`, `modal`                           | `update:open`, `close` · default slot         |
| `DialogActions`          | —                | layout for dialog footer buttons                                                                                              | default slot                                  |
| `DropdownMenu` (+ items) | `DropdownMenu*`  | `align`, `modal`, `sideOffset`, `portalTo`, `contentClass`                                                                    | `update:open` · `trigger` / `items` slots     |
| `ContextMenu` (+ items)  | `ContextMenu*`   | `contentClass`, `portalTo`                                                                                                    | `update:open` · `trigger` / `items` slots     |
| `ToastHost`              | `Toast*`         | _none_ — mount once globally (already mounted in `ShellHost`)                                                                 | renders the `useToast` queue                  |

## Toasts

Toasts are a singleton queue (`useToast`) rendered by one global `<ToastHost />`
(mounted in [`ShellHost.vue`](../../shells/ShellHost.vue) beside the session-lock
overlay). Any app or composable can enqueue one — no provider wiring:

```ts
import { useToast } from "@daopk/ui";

const toast = useToast();
toast.success({ title: "Saved", description: "Your changes were saved." });
const id = toast.error({ title: "Upload failed", duration: 8000 });
toast.dismiss(id); // or toast.clear()
```

`show(options)` returns the toast id; `info` / `success` / `warning` / `error`
are tone shortcuts. Errors and warnings are announced assertively
(`type="foreground"`), info/success politely. `duration` is ms (default 5000).
The viewport is corner-anchored above all chrome (`--toast-z`) and respects the
bottom safe-area inset.

## Tooltip & RadioGroup

- `Tooltip` is self-contained (it renders its own `TooltipProvider`). The
  default slot is the trigger and must be a single element (it uses
  `as-child`); supply text via the `label` prop or rich content via the
  `content` slot.
- `RadioGroup` + `RadioGroupItem` give WAI-ARIA roving focus (arrow keys move
  and select, `orientation` sets the axis). Bind `v-model` on the group and
  give each item a `value`.
