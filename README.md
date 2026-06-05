# daopk.me

**daopk.me — personal site rendered as an OS**

This repository implements an “OS-on-web” foundation: progressive boot → kernel → desktop or mobile shells, with apps registered like plugins. High-level architecture is organized under `src/core` (framework), `src/shells` (desktop vs mobile UI), and `src/apps` (plug-in surfaces).

## Stack

- [Vue](https://vuejs.org/) 3 · [Vite](https://vite.dev/) · TypeScript strict
- [Pinia](https://pinia.vuejs.org/), [Vue Router](https://router.vuejs.org/) (memory mode later), [idb](https://github.com/jakearchibald/idb), [Comlink](https://github.com/GoogleChromeLabs/comlink), [Iconify](https://iconify.design/docs/icon-components/vue/) with per-icon imports
- Styling with SCSS (sass-embedded), utilities via `@vueuse/core`

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # vue-tsc -b && vite production build → dist/
pnpm typecheck  # vue-tsc --noEmit against tsconfig.app.json
pnpm lint       # oxlint
pnpm lint:fix   # oxlint --fix
pnpm format        # oxfmt
pnpm format:check  # oxfmt --check
```
