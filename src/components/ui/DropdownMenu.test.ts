import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";

import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "./index";

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    }),
  );
}

async function flushReka(): Promise<void> {
  await nextTick();
  await nextTick();
}

function makeHost(onSelect: () => void) {
  const value = ref("system");

  const Host = defineComponent({
    name: "DropdownMenuHost",
    components: {
      DropdownMenu,
      DropdownMenuItem,
      DropdownMenuItemIndicator,
      DropdownMenuRadioGroup,
      DropdownMenuRadioItem,
      DropdownMenuSeparator,
    },
    setup() {
      return { onSelect, value };
    },
    template: `
      <DropdownMenu>
        <template #trigger>
          <button type="button" data-testid="trigger">Open menu</button>
        </template>

        <template #items>
          <DropdownMenuItem text-value="Do thing" @select="onSelect">Do thing</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup v-model="value">
            <DropdownMenuRadioItem value="system" text-value="System">
              <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">✓</DropdownMenuItemIndicator>
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light" text-value="Light">
              <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">✓</DropdownMenuItemIndicator>
              Light
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </template>
      </DropdownMenu>
    `,
  });

  return { Host, value };
}

describe("DropdownMenu primitive", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("renders the trigger inline and no portaled menu at rest", () => {
    const { Host } = makeHost(() => {});
    mount(Host, { attachTo: document.body });

    expect(document.body.querySelector('[data-testid="trigger"]')).not.toBeNull();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it("opens the portaled menu on trigger click", async () => {
    const { Host } = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(document.body.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
    expect(document.body.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it("uses the application overlay landmark when it is available", async () => {
    const target = document.createElement("div");
    target.id = "app-overlays";
    target.setAttribute("role", "region");
    target.setAttribute("aria-label", "Application overlays");
    document.body.appendChild(target);

    const { Host } = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    expect(target.querySelector('[role="menu"]')).not.toBeNull();
  });

  it("emits select when a menu item is activated", async () => {
    const onSelect = vi.fn();
    const { Host } = makeHost(onSelect);
    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    click(document.body.querySelector('[role="menuitem"]')!);
    await flushReka();

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("supports radio item selection through v-model", async () => {
    const { Host, value } = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    const lightItem = Array.from(document.body.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.includes("Light"),
    );
    expect(lightItem).not.toBeUndefined();

    click(lightItem!);
    await flushReka();

    expect(value.value).toBe("light");
  });

  it("applies the dropdown menu class for z-index styling", async () => {
    const { Host } = makeHost(() => {});
    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.classList.contains("ds-dropdown-menu")).toBe(true);
  });

  it("can portal the menu into a custom target", async () => {
    const target = document.createElement("div");
    target.setAttribute("data-testid", "menu-target");
    document.body.appendChild(target);

    const Host = defineComponent({
      name: "DropdownMenuCustomTargetHost",
      components: {
        DropdownMenu,
        DropdownMenuItem,
      },
      setup() {
        return { target };
      },
      template: `
        <DropdownMenu :portal-to="target">
          <template #trigger>
            <button type="button" data-testid="trigger">Open menu</button>
          </template>

          <template #items>
            <DropdownMenuItem text-value="Do thing">Do thing</DropdownMenuItem>
          </template>
        </DropdownMenu>
      `,
    });

    const wrapper = mount(Host, { attachTo: document.body });

    click(wrapper.get('[data-testid="trigger"]').element);
    await flushReka();

    expect(target.querySelector('[role="menu"]')).not.toBeNull();
  });
});
