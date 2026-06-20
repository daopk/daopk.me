import { watch, type Ref } from "vue";

import { replaceBrowserPath, replaceBrowserTitle } from "~/core/routing/appBrowserPaths";

/**
 * Mirrors the focused surface's browser path + title into the host page chrome
 * (address bar / document title). Each shell derives `browserPath`/`browserTitle`
 * from its own focus model and hands the refs here so the `history.replaceState`
 * + `document.title` plumbing is shared. The title sync runs immediately so the
 * tab is correct on first paint.
 */
export function useShellBrowserChromeSync(
  browserPath: Readonly<Ref<string>>,
  browserTitle: Readonly<Ref<string>>,
): void {
  watch(browserPath, (path) => {
    replaceBrowserPath(path);
  });

  watch(
    browserTitle,
    (title) => {
      replaceBrowserTitle(title);
    },
    { immediate: true },
  );
}
