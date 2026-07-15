# `ui` layer

Stateful and behaviorally complex primitives exposed through the stable
`@daopk/ui` facade. Every SFC in this directory compiles in Vue Vapor mode;
apps can keep using the existing exports, props, events, slots and `ds-*`
classes while the rest of the repository migrates incrementally.

The implementation is intentionally hybrid:

- `Switch`, `Slider` and radio controls adapt `ropav@0.0.9` through
  `ropavAdapter.ts` and the design-token bridge in `ropavBridge.scss`.
- Tooltip, hover card and menu positioning use the local Vapor composables plus
  `@floating-ui/dom`.
- Dialog behavior is local Vapor DOM with `Teleport`, `focus-trap`, stack-aware
  dismissal, background inerting and scroll locking.
- Toast state remains the module-level `useToast` singleton and is rendered by
  local Vapor components.

`src/runtime/ui.ts` re-exports `src/components/ui/index.ts`; public exports must
not bypass those files. Internal DOM structure, implementation component names
and library-specific `data-*` attributes are not API contracts.

## Conventions

- **Class prefix:** `ds-*` (the sibling kit uses `ds-kit-*`).
- **Tokens only:** consume `--color-*`, `--space-*`, `--radius-*`,
  `--shadow-*`, control-height and chrome z-index tokens. The token audit must
  stay green.
- **Portaled styles are global:** teleported menu, dialog, tooltip and toast
  nodes live outside the component's scoped-style boundary, so use a unique
  `ds-*` namespace in a non-scoped `<style lang="scss">` block.
- **Reduced motion:** every animation has a
  `prefers-reduced-motion: reduce` override.
- **Mixed runtime:** entry points continue using
  `createApp(...).use(vaporInteropPlugin)` until the VDOM inventory reaches
  zero. Switch to `createVaporApp` only after that repository-wide milestone.

## API reference

Props in **bold** are required.

| Component              | Implementation             | Key props                                                                                                                     | Emits / slots                               |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Button`               | local Vapor                | `variant` (`primary`/`secondary`/`ghost`/`danger`), `size` (`sm`/`md`), `loading`, `disabled`, `iconStart`, `iconEnd`, `type` | native `click` · default slot               |
| `Card`                 | local Vapor                | `variant` (`default`/`subtle`), `interactive`, `selected`, `as`                                                               | default slot                                |
| `Switch`               | `ropav/switch` adapter     | **`modelValue`**, `disabled`, accessible-name attributes                                                                      | `update:modelValue`                         |
| `Slider`               | `ropav/slider` adapter     | **`modelValue`**, `min`, `max`, `step`, `orientation`, `disabled`, `ariaLabel`, `ariaValuetext`                               | `update:modelValue`, `commit`               |
| `RadioGroup` + item    | `ropav/radio` adapter      | `modelValue`, `orientation`, `disabled`, `label`, `name`; item **`value`**, `label`, `disabled`, `id`                         | `update:modelValue` · item default slot     |
| `Tooltip`              | local Vapor + Floating UI  | `label`, `side`, `align`, `delayDuration`, `sideOffset`, `disabled`, `portalTo`                                               | default trigger slot · `content`            |
| `HoverCard`            | local Vapor + Floating UI  | `open`, `defaultOpen`, `side`, `align`, delays, offsets, `reference`, `enableTouch`, `portalTo`                               | `update:open` · default trigger / `content` |
| `Dialog`               | local Vapor + focus trap   | **`open`**, **`title`**, `description`, `variant`, `size`, `layer`, `scope`, `modal`, `dismissible`, `portalTo`               | `update:open`, `close` · default slot       |
| `DialogActions`        | local Vapor                | `align`                                                                                                                       | default slot                                |
| `DropdownMenu` + items | local Vapor + Floating UI  | `align`, `modal`, `sideOffset`, `portalTo`, `contentClass`                                                                    | `update:open` · `trigger` / `items`         |
| `ContextMenu` + items  | local Vapor + virtual ref  | `modal`, `portalTo`                                                                                                           | `update:open` · `trigger` / `items`         |
| `ToastHost`            | local Vapor singleton host | none; mount once globally                                                                                                     | renders the `useToast` queue                |

Menu exports include item, separator, label, radio group/item and item
indicator. Item `select` receives a cancelable `Event`; calling
`preventDefault()` keeps the menu open. Dropdown triggers support click,
ArrowUp and ArrowDown. Open menus support roving arrows, Home/End, Enter/Space,
Escape, Tab, typeahead, disabled-item skipping and focus restoration. Context
menus use the same core with a pointer-position virtual reference and include
touch/pen long-press behavior.

## Portals and trigger slots

`portalTo` accepts a selector or `HTMLElement`. With no explicit target,
`resolvePortalTarget` uses `#app-overlays` when present and falls back to
`body` for standalone apps and tests.

Floating triggers use a `display: contents` host, locate the first element in
the trigger slot and attach events/ARIA directly. They do not clone or inspect
slot VNodes. Supply exactly one element as a trigger.

## Toasts

Mount one `<ToastHost />` (the shell already does) and enqueue from any app:

```ts
import { useToast } from "@daopk/ui";

const toast = useToast();
toast.success({ title: "Saved", description: "Your changes were saved." });
const id = toast.error({ title: "Upload failed", duration: 8000 });
toast.dismiss(id); // or toast.clear()
```

`show(options)` returns the toast id; `info`, `success`, `warning` and `error`
are tone shortcuts. Error/warning use assertive live regions; info/success use
polite live regions. Timers pause on hover/focus, and toasts support manual and
rightward-swipe dismissal. The fixed viewport respects the bottom safe area and
`--toast-z`.

## Verification

Behavioral component tests live in `*.vapor.test.ts` and mount through the same
VDOM-to-Vapor interop boundary as production. The required phase gates are:

```sh
pnpm run typecheck
pnpm run typecheck:test
pnpm test
pnpm run lint
pnpm run format:check
pnpm run lint:tokens:audit
pnpm run build
```
