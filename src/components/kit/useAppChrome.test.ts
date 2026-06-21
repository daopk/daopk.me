import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeContentSize,
  type AppChromeController,
  type AppChromeTitlebarVisibility,
} from "~/types/app";

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

    const Harness = defineComponent({
      props: {
        title: { type: String, default: "" },
        titlebar: { type: String, default: "visible" },
        contentWidth: { type: Number, default: 320 },
      },
      setup(props) {
        const chrome = useAppChrome({
          title: () => props.title,
          titlebar: () => props.titlebar as AppChromeTitlebarVisibility,
          contentSize: () => ({ width: props.contentWidth, height: 180 }),
        });
        return { available: chrome.available };
      },
      template: "<div />",
    });

    const wrapper = mount(Harness, {
      props: { title: "Inbox" },
      global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
    });

    expect((wrapper.vm as { available: boolean }).available).toBe(true);
    expect(titles).toContain("Inbox");

    await wrapper.setProps({ title: "Drafts" });
    expect(titles).toContain("Drafts");

    await wrapper.setProps({ titlebar: "hidden" });
    expect(titlebars).toContain("hidden");

    await wrapper.setProps({ contentWidth: 640 });
    expect(contentSizes).toContainEqual({ width: 640, height: 180 });

    wrapper.unmount();
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

    const Harness = defineComponent({
      setup() {
        const chrome = useAppChrome();
        chrome.setBackAction(action);
        chrome.setTitlebar("hidden");
        chrome.setContentSize({ width: 640, height: 360 });
        chrome.hide();
        chrome.close();
        return {};
      },
      template: "<div />",
    });

    mount(Harness, { global: { provide: { [AppChromeInjectionKey as symbol]: controller } } });
    expect(backs).toContainEqual(action);
    expect(titlebars).toContain("hidden");
    expect(contentSizes).toContainEqual({ width: 640, height: 360 });
    expect(hides).toBe(1);
    expect(closes).toBe(1);
  });

  it("reports unavailable when the controller does not render visible app chrome", () => {
    const controller: AppChromeController = {
      rendersAppChrome: false,
      setTitle: () => {},
      setBackAction: () => {},
    };

    const Harness = defineComponent({
      setup() {
        return { available: useAppChrome().available };
      },
      template: "<div />",
    });

    const wrapper = mount(Harness, {
      global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
    });

    expect((wrapper.vm as { available: boolean }).available).toBe(false);
  });

  it("no-ops on shells that do not provide app chrome", () => {
    const Harness = defineComponent({
      setup() {
        const chrome = useAppChrome();
        chrome.setTitle("Ignored");
        chrome.setBackAction({ ariaLabel: "Back", handler: () => {} });
        chrome.setTitlebar("hidden");
        chrome.setContentSize({ width: 640, height: 360 });
        chrome.hide();
        chrome.close();
        return { available: chrome.available };
      },
      template: "<div />",
    });

    const wrapper = mount(Harness);
    expect((wrapper.vm as { available: boolean }).available).toBe(false);
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
