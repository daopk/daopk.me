import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";

import { blogCommentTarget } from "~/core/comments";

import GiscusComments from "./GiscusComments.vue";

const target = blogCommentTarget("moving-apps-out-of-the-shell", "Moving apps")!;

function script(wrapper: ReturnType<typeof mount>): HTMLScriptElement {
  const node = wrapper.find("script").element;
  if (!(node instanceof HTMLScriptElement)) {
    throw new Error("Giscus script was not rendered.");
  }
  return node;
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.head.querySelector('meta[name="giscus:backlink"]')?.remove();
});

describe("GiscusComments", () => {
  it("injects the configured Giscus script for the current target", () => {
    document.documentElement.dataset.theme = "dark";
    const wrapper = mount(GiscusComments, { props: { target } });
    const giscusScript = script(wrapper);

    expect(giscusScript.getAttribute("src")).toBe("https://giscus.app/client.js");
    expect(giscusScript.getAttribute("data-repo")).toBe("daopk/daopk.me");
    expect(giscusScript.getAttribute("data-repo-id")).toBe("R_kgDOSsA4Cg");
    expect(giscusScript.getAttribute("data-category")).toBe("Comments");
    expect(giscusScript.getAttribute("data-category-id")).toBe("DIC_kwDOSsA4Cs4C-vzm");
    expect(giscusScript.getAttribute("data-mapping")).toBe("specific");
    expect(giscusScript.getAttribute("data-term")).toBe("blog:moving-apps-out-of-the-shell");
    expect(giscusScript.getAttribute("data-strict")).toBe("1");
    expect(giscusScript.getAttribute("data-reactions-enabled")).toBe("1");
    expect(giscusScript.getAttribute("data-emit-metadata")).toBe("0");
    expect(giscusScript.getAttribute("data-input-position")).toBe("bottom");
    expect(giscusScript.getAttribute("data-theme")).toBe("dark");
    expect(giscusScript.getAttribute("data-lang")).toBe("vi");
    expect(giscusScript.getAttribute("data-loading")).toBe("lazy");
    expect(giscusScript.getAttribute("crossorigin")).toBe("anonymous");
    expect(document.head.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content")).toBe(
      "https://daopk.me/blog/moving-apps-out-of-the-shell",
    );
  });

  it("reloads the script when the target changes", async () => {
    const wrapper = mount(GiscusComments, { props: { target } });

    await wrapper.setProps({
      target: blogCommentTarget("building-a-tiny-web-os", "Tiny web OS"),
    });
    await nextTick();

    expect(wrapper.findAll("script")).toHaveLength(1);
    expect(script(wrapper).getAttribute("data-term")).toBe("blog:building-a-tiny-web-os");
    expect(document.head.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content")).toBe(
      "https://daopk.me/blog/building-a-tiny-web-os",
    );

    wrapper.unmount();

    expect(document.head.querySelector('meta[name="giscus:backlink"]')).toBeNull();
  });

  it("renders a safe disabled state when the category config is missing", () => {
    const wrapper = mount(GiscusComments, {
      props: {
        config: { categoryId: "" },
        target,
      },
    });

    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.find(".comments__disabled").text()).toBe("Comments unavailable.");
  });

  it("restores an existing giscus backlink meta tag on unmount", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "giscus:backlink");
    meta.setAttribute("content", "https://daopk.me/blog");
    document.head.appendChild(meta);

    const wrapper = mount(GiscusComments, { props: { target } });

    expect(meta.getAttribute("content")).toBe(
      "https://daopk.me/blog/moving-apps-out-of-the-shell",
    );

    wrapper.unmount();

    expect(meta.getAttribute("content")).toBe("https://daopk.me/blog");
  });
});
