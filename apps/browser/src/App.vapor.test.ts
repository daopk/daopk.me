import { mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppContextInjectionKey, type AppContext } from "@daopk/sdk";

import App from "./App.vue";

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "browser",
    handleId: "browser-handle",
    args: Object.freeze(args),
    isActive: () => true,
  });
}

function mountBrowser(context: AppContext = makeContext()) {
  return mount(App, {
    global: {
      provide: {
        [AppContextInjectionKey as symbol]: context,
      },
    },
  });
}

function inputValue(wrapper: ReturnType<typeof mountBrowser>): string {
  return (wrapper.find("#browser-address").element as HTMLInputElement).value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Browser App.vue", () => {
  it("renders the Google homepage by default", () => {
    const wrapper = mountBrowser();

    expect(wrapper.find(".browser__start").exists()).toBe(false);
    expect(wrapper.find("iframe").attributes("src")).toBe("https://www.google.com/webhp?igu=1");
    expect(inputValue(wrapper)).toBe("https://www.google.com/webhp?igu=1");
    expect(wrapper.find(".browser__address-input-root .browser__favicon").exists()).toBe(true);
    const submit = wrapper.find('.browser__address-input-root button[aria-label="Go"]');
    expect((submit.element as HTMLButtonElement).type).toBe("submit");

    wrapper.unmount();
  });

  it("navigates from the address bar", async () => {
    const wrapper = mountBrowser();

    await wrapper.find("#browser-address").setValue("example.com");
    await wrapper.find("form").trigger("submit");

    const frame = wrapper.find("iframe");
    expect(frame.attributes("src")).toBe("https://example.com/");
    expect(frame.attributes("sandbox")).toBe(
      "allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts",
    );
    expect(frame.attributes("allow")?.replace(/\s+/g, " ").replace(/;\s*$/, "").trim()).toBe(
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    );
    expect(frame.attributes("allowfullscreen")).toBe("");
    expect(frame.attributes("credentialless")).toBe("credentialless");
    expect(frame.attributes("referrerpolicy")).toBe("no-referrer");
    expect(inputValue(wrapper)).toBe("https://example.com/");

    wrapper.unmount();
  });

  it("searches from the address bar when input is not a URL", async () => {
    const wrapper = mountBrowser();

    await wrapper.find("#browser-address").setValue("vue browser app");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.find("iframe").attributes("src")).toBe(
      "https://www.google.com/search?igu=1&q=vue+browser+app",
    );
    expect(inputValue(wrapper)).toBe("https://www.google.com/search?igu=1&q=vue+browser+app");

    wrapper.unmount();
  });

  it("previews YouTube embed URLs", async () => {
    const wrapper = mountBrowser();

    await wrapper.find("#browser-address").setValue("https://www.youtube.com/embed/IQsLEaj89bg");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.find(".browser__blocked").exists()).toBe(false);
    expect(wrapper.find("iframe").attributes("src")).toBe(
      "https://www.youtube.com/embed/IQsLEaj89bg",
    );

    wrapper.unmount();
  });

  it("shows an external fallback after an iframe error", async () => {
    const wrapper = mountBrowser();

    await wrapper.find("#browser-address").setValue("google.com");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.find("iframe").attributes("src")).toBe("https://google.com/");

    await wrapper.find("iframe").trigger("error");

    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.find(".browser__blocked").exists()).toBe(true);
    expect(wrapper.text()).toContain("This site could not be embedded.");
    expect(wrapper.text()).toContain("https://google.com/");
    expect(wrapper.find('button[aria-label="Reload"]').attributes("disabled")).toBeUndefined();
    expect(inputValue(wrapper)).toBe("https://google.com/");

    wrapper.unmount();
  });

  it("opens quick links into the iframe", async () => {
    const wrapper = mountBrowser();

    await wrapper.find("#browser-address").setValue(" ");
    await wrapper.find("form").trigger("submit");
    await wrapper.findAll(".browser__quick-link")[0].trigger("click");

    expect(wrapper.find("iframe").attributes("src")).toBe("https://www.google.com/webhp?igu=1");
    expect(inputValue(wrapper)).toBe("https://www.google.com/webhp?igu=1");

    wrapper.unmount();
  });

  it("opens bookmarks from the persistent bookmark bar", async () => {
    const wrapper = mountBrowser();

    await wrapper.findAll(".browser__bookmark")[0].trigger("click");

    expect(wrapper.find("iframe").attributes("src")).toBe("https://www.google.com/webhp?igu=1");
    expect(inputValue(wrapper)).toBe("https://www.google.com/webhp?igu=1");

    wrapper.unmount();
  });

  it("loads launch args.url", () => {
    const wrapper = mountBrowser(makeContext({ url: "example.com/docs" }));

    expect(wrapper.find("iframe").attributes("src")).toBe("https://example.com/docs");
    expect(inputValue(wrapper)).toBe("https://example.com/docs");

    wrapper.unmount();
  });

  it("updates toolbar state for back and forward navigation", async () => {
    const wrapper = mountBrowser();
    const back = () => wrapper.find('button[aria-label="Back"]');
    const forward = () => wrapper.find('button[aria-label="Forward"]');

    expect(back().attributes("disabled")).toBeDefined();
    expect(forward().attributes("disabled")).toBeDefined();

    await wrapper.find("#browser-address").setValue("example.com");
    await wrapper.find("form").trigger("submit");

    expect(back().attributes("disabled")).toBeUndefined();
    expect(forward().attributes("disabled")).toBeDefined();

    await back().trigger("click");

    expect(wrapper.find("iframe").attributes("src")).toBe("https://www.google.com/webhp?igu=1");
    expect(back().attributes("disabled")).toBeDefined();
    expect(forward().attributes("disabled")).toBeUndefined();

    wrapper.unmount();
  });

  it("opens the current URL externally", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const wrapper = mountBrowser(makeContext({ url: "example.com" }));

    await wrapper.find('button[aria-label="Open externally"]').trigger("click");

    expect(open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");

    wrapper.unmount();
  });
});
