import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "./index";

function makeHost(onSelect: () => void): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: "ContextMenuHost",
    setup() {
      return () =>
        h(
          ContextMenu,
          {},
          {
            trigger: () =>
              h("div", { class: "ctx-host-trigger", "data-testid": "trigger" }, "right-click me"),
            items: () => [
              h(ContextMenuItem, { onSelect }, () => "Do thing"),
              h(ContextMenuSeparator),
              h(ContextMenuItem, {}, () => "Other"),
            ],
          },
        );
    },
  });
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 10 },
    clientY: { value: 20 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

async function flushReka(): Promise<void> {
  // micro-task for the portal mount. Two ticks cover both.
  await nextTick();
  await nextTick();
}

describe("ContextMenu (post-F1 primitive)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders trigger inline and NO menu in document.body until contextmenu fires", () => {
    const Host = makeHost(() => {});
    mount(Host, { attachTo: document.body });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="trigger"]')).not.toBeNull();
  });

  it("contextmenu event on the trigger opens the portaled menu in <body>", async () => {
    const Host = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    const trigger = wrapper.get('[data-testid="trigger"]').element;
    dispatchContextMenu(trigger);
    await flushReka();

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(document.body.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it("activating an item fires its @select callback", async () => {
    const onSelect = vi.fn();
    const Host = makeHost(onSelect);
    const wrapper = mount(Host, { attachTo: document.body });

    dispatchContextMenu(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    const firstItem = document.body.querySelector('[role="menuitem"]') as HTMLElement;
    expect(firstItem).not.toBeNull();
    firstItem.click();
    await flushReka();

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("applies the --context-menu-z token to the panel (D5 z-band smoke)", async () => {
    const Host = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    dispatchContextMenu(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    // (unscoped) `.ds-context-menu { z-index: var(--context-menu-z); }`
    // z-index value lives in the stylesheet and is verified by the
    expect(menu!.classList.contains("ds-context-menu")).toBe(true);
  });
});
