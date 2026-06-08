import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";

import { blogCommentTarget } from "~/core/comments";

import GiscusComments from "./GiscusComments.vue";

const target = blogCommentTarget("moving-apps-out-of-the-shell", "Moving apps")!;

function frame(wrapper: ReturnType<typeof mount>): HTMLIFrameElement {
  const node = wrapper.find("iframe.giscus-frame").element;
  if (!(node instanceof HTMLIFrameElement)) {
    throw new Error("Giscus frame was not rendered.");
  }
  return node;
}

function frameUrl(wrapper: ReturnType<typeof mount>): URL {
  const src = frame(wrapper).getAttribute("src");
  if (src === null) {
    throw new Error("Giscus frame src was not rendered.");
  }
  return new URL(src);
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.head.querySelector('meta[name="giscus:backlink"]')?.remove();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

describe("GiscusComments", () => {
  it("injects a credentialless Giscus frame for the current target", () => {
    document.documentElement.dataset.theme = "dark";
    window.history.replaceState(null, "", "/blog/moving-apps-out-of-the-shell");
    const wrapper = mount(GiscusComments, { props: { target } });
    const giscusFrame = frame(wrapper);
    const url = frameUrl(wrapper);

    expect(url.origin).toBe("https://giscus.app");
    expect(url.pathname).toBe("/vi/widget");
    expect(url.searchParams.get("repo")).toBe("daopk/daopk.me");
    expect(url.searchParams.get("repoId")).toBe("R_kgDOSsA4Cg");
    expect(url.searchParams.get("category")).toBe("Comments");
    expect(url.searchParams.get("categoryId")).toBe("DIC_kwDOSsA4Cs4C-vzm");
    expect(url.searchParams.get("term")).toBe("blog:moving-apps-out-of-the-shell");
    expect(url.searchParams.get("strict")).toBe("1");
    expect(url.searchParams.get("reactionsEnabled")).toBe("1");
    expect(url.searchParams.get("emitMetadata")).toBe("0");
    expect(url.searchParams.get("inputPosition")).toBe("bottom");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("session")).toBe("");
    expect(url.searchParams.get("origin")).toBe(
      `${window.location.origin}/blog/moving-apps-out-of-the-shell`,
    );
    expect(url.searchParams.get("backLink")).toBe(
      "https://daopk.me/blog/moving-apps-out-of-the-shell",
    );
    expect(giscusFrame.getAttribute("allow")).toBe("clipboard-write");
    expect(giscusFrame.getAttribute("credentialless")).toBe("credentialless");
    expect(giscusFrame.getAttribute("loading")).toBe("lazy");
    expect(giscusFrame.getAttribute("scrolling")).toBe("no");
    expect(giscusFrame.getAttribute("title")).toBe("Comments");
    expect(
      document.head.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content"),
    ).toBe("https://daopk.me/blog/moving-apps-out-of-the-shell");
  });

  it("reloads the script when the target changes", async () => {
    const wrapper = mount(GiscusComments, { props: { target } });

    await wrapper.setProps({
      target: blogCommentTarget("building-a-tiny-web-os", "Tiny web OS"),
    });
    await nextTick();

    expect(wrapper.findAll("iframe.giscus-frame")).toHaveLength(1);
    expect(frameUrl(wrapper).searchParams.get("term")).toBe("blog:building-a-tiny-web-os");
    expect(
      document.head.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content"),
    ).toBe("https://daopk.me/blog/building-a-tiny-web-os");

    wrapper.unmount();

    expect(document.head.querySelector('meta[name="giscus:backlink"]')).toBeNull();
  });

  it("passes the Giscus OAuth callback session into the frame", () => {
    window.history.replaceState(
      null,
      "",
      "/blog/moving-apps-out-of-the-shell?giscus=session-token#auth",
    );

    const wrapper = mount(GiscusComments, { props: { target } });

    expect(frameUrl(wrapper).searchParams.get("session")).toBe("session-token");
    expect(window.localStorage.getItem("giscus-session")).toBe(JSON.stringify("session-token"));
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("renders a safe disabled state when the category config is missing", () => {
    const wrapper = mount(GiscusComments, {
      props: {
        config: { categoryId: "" },
        target,
      },
    });

    expect(wrapper.find("iframe.giscus-frame").exists()).toBe(false);
    expect(wrapper.find(".comments__disabled").text()).toBe("Comments unavailable.");
  });

  it("restores an existing giscus backlink meta tag on unmount", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "giscus:backlink");
    meta.setAttribute("content", "https://daopk.me/blog");
    document.head.appendChild(meta);

    const wrapper = mount(GiscusComments, { props: { target } });

    expect(meta.getAttribute("content")).toBe("https://daopk.me/blog/moving-apps-out-of-the-shell");

    wrapper.unmount();

    expect(meta.getAttribute("content")).toBe("https://daopk.me/blog");
  });
});
