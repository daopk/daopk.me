# `ui` layer

Stateful and behaviorally complex primitives exposed through the stable
`@daopk/ui` facade. Every SFC in this directory compiles in Vue Vapor mode;
apps can keep using the existing exports, props, events, slots and `ds-*`
classes while the rest of the repository migrates incrementally.

The implementation is intentionally hybrid:

- `Switch`, `Slider`, radio controls and toast lifecycle/rendering adapt
  `ropav@0.0.11` through
  `ropavAdapter.ts` and the design-token bridge in `ropavBridge.scss`.
- Tooltip and hover card positioning use the local Vapor composables plus
  `@floating-ui/dom`. Menus use Ropav's public `useDropdownMenu` composable for
  disclosure, collision-aware positioning and outside interactions while the
  facade retains its slot-based item API and pointerdown compatibility.
- Dialog behavior is local Vapor DOM with `Teleport`, the `ropav/focus-trap`
  composable, stack-aware dismissal, background inerting and scroll locking.
- Toast calls retain the stable module-level `useToast` facade while Ropav's
  provider and viewport own the bounded queue, updates, rendering, timers,
  live-region roles and dismissal.

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

| Component              | Implementation            | Key props                                                                                                                     | Emits / slots                               |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Button`               | local Vapor               | `variant` (`primary`/`secondary`/`ghost`/`danger`), `size` (`sm`/`md`), `loading`, `disabled`, `iconStart`, `iconEnd`, `type` | native `click` · default slot               |
| `Card`                 | local Vapor               | `variant` (`default`/`subtle`), `interactive`, `selected`, `as`                                                               | default slot                                |
| `Switch`               | `ropav/switch` adapter    | **`modelValue`**, `id`, `name`, `disabled`, `required`, `invalid`, ARIA and `inputAttrs`                                      | `update:modelValue`                         |
| `Slider`               | `ropav/slider` adapter    | **`modelValue`**, `id`, `name`, `min`, `max`, `step`, `orientation`, `disabled`, ARIA and `inputAttrs`                        | `update:modelValue`, `commit`               |
| `RadioGroup` + item    | `ropav/radio` adapter     | `modelValue`, `id`, `name`, `orientation`, validation and ARIA; item **`value`**, `label`, overrides and `inputAttrs`         | `update:modelValue` · item default slot     |
| `Tooltip`              | local Vapor + Floating UI | `label`, `side`, `align`, `delayDuration`, `sideOffset`, `disabled`, `portalTo`                                               | default trigger slot · `content`            |
| `HoverCard`            | local Vapor + Floating UI | `open`, `defaultOpen`, `side`, `align`, delays, offsets, `reference`, `enableTouch`, `portalTo`                               | `update:open` · default trigger / `content` |
| `Dialog`               | local Vapor + focus trap  | **`open`**, **`title`**, `description`, `variant`, `size`, `layer`, `scope`, `modal`, `dismissible`, `portalTo`               | `update:open`, `close` · default slot       |
| `DialogActions`        | local Vapor               | `align`                                                                                                                       | default slot                                |
| `DropdownMenu` + items | Ropav composable adapter  | `align`, `modal`, `sideOffset`, `portalTo`, `contentClass`                                                                    | `update:open` · `trigger` / `items`         |
| `ContextMenu` + items  | Ropav composable adapter  | `modal`, `portalTo`                                                                                                           | `update:open` · `trigger` / `items`         |
| `ToastHost`            | Ropav provider + viewport | none; mount once globally                                                                                                     | renders the buffered `useToast` facade      |

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

Mount one `<ToastHost />` (the root app already does) and enqueue from any app:

```ts
import { useToast } from "@daopk/ui";

const toast = useToast();
toast.success({ title: "Saved", description: "Your changes were saved." });
const id = toast.error({ title: "Upload failed", duration: 8000 });
toast.update(id, { title: "Retrying upload", tone: "info" });
toast.dismiss(id); // or toast.clear()
```

The facade buffers calls made before `ToastHost` mounts, then flushes them into
Ropav's provider. The queue keeps the five newest notifications.

`show(options)` returns the toast id; `info`, `success`, `warning` and `error`
are tone shortcuts. Ropav maps tones to colors; error/warning use
alert roles while info/success use status roles. Ropav owns item timers,
hover/focus pause and manual dismissal. The host retains rightward-swipe
dismissal, the bottom safe area and `--toast-z` integration.

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
