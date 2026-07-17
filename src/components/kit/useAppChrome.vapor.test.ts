import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeContentSize,
  type AppChromeController,
  type AppChromeTitlebarVisibility,
} from "~/types/app";
import { mountVaporComposable } from "~/test/mountVapor";

import { useAppChrome } from "./useAppChrome";

describe("useAppChrome", () => {
  it("pushes a reactive title to the shell chrome and clears on unmount", async () => {
    const titles: Array<string | null> = [];
    const backs: Array<AppChromeBackAction | null> = [];
    const titlebars: Array<AppChromeTitlebarVisibility | null> = [];
    const contentSizes: Array<AppChromeContentSize | null> = [];
    const controller: AppChromeController = {
      setTitle: (title) => titles.push(title),
      setBackAction: (action) => backs.push(action),
      setTitlebar: (visibility) => titlebars.push(visibility),
      setContentSize: (size) => contentSizes.push(size),
      hide: () => {},
      close: () => {},
    };

    const title = ref("Inbox");
    const titlebar = ref<AppChromeTitlebarVisibility>("visible");
    const contentWidth = ref(320);
    const mounted = mountVaporComposable(
      () =>
        useAppChrome({
          title,
          titlebar,
          contentSize: () => ({ width: contentWidth.value, height: 180 }),
        }),
      {
        global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
      },
    );

    expect(mounted.result.available).toBe(true);
    expect(titles).toContain("Inbox");

    title.value = "Drafts";
    await nextTick();
    expect(titles).toContain("Drafts");

    titlebar.value = "hidden";
    await nextTick();
    expect(titlebars).toContain("hidden");

    contentWidth.value = 640;
    await nextTick();
    expect(contentSizes).toContainEqual({ width: 640, height: 180 });

    mounted.unmount();
    expect(titles.at(-1)).toBeNull();
    expect(backs.at(-1)).toBeNull();
    expect(titlebars.at(-1)).toBeNull();
    expect(contentSizes.at(-1)).toBeNull();
  });

  it("forwards imperative setters and app actions through the injected controller", () => {
    const backs: Array<AppChromeBackAction | null> = [];
    const titlebars: Array<AppChromeTitlebarVisibility | null> = [];
    const contentSizes: Array<AppChromeContentSize | null> = [];
    let hides = 0;
    let closes = 0;
    const controller: AppChromeController = {
      setTitle: () => {},
      setBackAction: (action) => backs.push(action),
      setTitlebar: (visibility) => titlebars.push(visibility),
      setContentSize: (size) => contentSizes.push(size),
      hide: () => {
        hides += 1;
      },
      close: () => {
        closes += 1;
      },
    };
    const action: AppChromeBackAction = { ariaLabel: "Back", handler: () => {} };

    const mounted = mountVaporComposable(
      () => {
        const chrome = useAppChrome();
        chrome.setBackAction(action);
        chrome.setTitlebar("hidden");
        chrome.setContentSize({ width: 640, height: 360 });
        chrome.hide();
        chrome.close();
        return chrome;
      },
      {
        global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
      },
    );
    expect(backs).toContainEqual(action);
    expect(titlebars).toContain("hidden");
    expect(contentSizes).toContainEqual({ width: 640, height: 360 });
    expect(hides).toBe(1);
    expect(closes).toBe(1);
    mounted.unmount();
  });

  it("reports unavailable when the controller does not render visible app chrome", () => {
    const controller: AppChromeController = {
      rendersAppChrome: false,
      setTitle: () => {},
      setBackAction: () => {},
    };

    const mounted = mountVaporComposable(() => useAppChrome(), {
      global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
    });

    expect(mounted.result.available).toBe(false);
    mounted.unmount();
  });

  it("no-ops on shells that do not provide app chrome", () => {
    const mounted = mountVaporComposable(() => {
      const chrome = useAppChrome();
      chrome.setTitle("Ignored");
      chrome.setBackAction({ ariaLabel: "Back", handler: () => {} });
      chrome.setTitlebar("hidden");
      chrome.setContentSize({ width: 640, height: 360 });
      chrome.hide();
      chrome.close();
      return chrome;
    });

    expect(mounted.result.available).toBe(false);
    expect(() => mounted.unmount()).not.toThrow();
  });
});
