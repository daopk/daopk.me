import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";

import { Dialog } from "./index";

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe("Dialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.style.pointerEvents = "";
  });

  it("defaults to a viewport-scoped modal portaled into body", async () => {
    mount(Dialog, {
      attachTo: document.body,
      props: {
        open: true,
        title: "Default dialog",
      },
      slots: {
        default: "<p>Body</p>",
      },
    });
    await flushReka();

    const dialog = document.body.querySelector('[role="dialog"]');
    const overlay = document.body.querySelector(".ds-dialog__overlay");

    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("ds-dialog__content--viewport")).toBe(true);
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("ds-dialog__overlay--viewport")).toBe(true);
  });

  it("can portal a non-modal dialog into a container without locking body pointer events", async () => {
    const target = document.createElement("div");
    target.setAttribute("data-testid", "dialog-target");
    document.body.appendChild(target);

    const Host = defineComponent({
      name: "DialogContainerHost",
      components: {
        Dialog,
      },
      setup() {
        return { target };
      },
      template: `
        <Dialog
          :open="true"
          title="Scoped dialog"
          :portal-to="target"
          scope="container"
          :modal="false"
        >
          <button type="button">Inside</button>
        </Dialog>
      `,
    });

    mount(Host, { attachTo: document.body });
    await flushReka();

    const dialog = target.querySelector('[role="dialog"]');
    const overlay = target.querySelector(".ds-dialog__overlay");

    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains("ds-dialog__content--container")).toBe(true);
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("ds-dialog__overlay--container")).toBe(true);
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});
