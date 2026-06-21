import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import ToastHost from "./ToastHost.vue";
import { clearToasts, useToast } from "./useToast";

function renderedText(wrapper: { html: () => string }): string {
  return wrapper.html() + document.body.innerHTML;
}

afterEach(() => {
  clearToasts();
});

describe("ToastHost", () => {
  it("renders queued toasts with their tone class and content", async () => {
    clearToasts();
    useToast().success({ title: "Uploaded", description: "3 files synced" });

    const wrapper = mount(ToastHost, { attachTo: document.body });
    await nextTick();

    const html = renderedText(wrapper);
    expect(html).toContain("Uploaded");
    expect(html).toContain("3 files synced");
    expect(html).toContain("ds-toast--success");

    wrapper.unmount();
  });

  it("drops a toast from the DOM after it is dismissed", async () => {
    clearToasts();
    const toast = useToast();
    const id = toast.success({ title: "Temporary" });

    const wrapper = mount(ToastHost, { attachTo: document.body });
    await nextTick();
    expect(renderedText(wrapper)).toContain("Temporary");

    toast.dismiss(id);
    await nextTick();
    expect(wrapper.html()).not.toContain("Temporary");

    wrapper.unmount();
  });
});
