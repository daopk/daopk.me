import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { assertVaporComponents, mountVapor, type VaporMount } from "~/test/mountVapor";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "./index";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVapor>[0],
  options?: Parameters<typeof mountVapor>[1],
) {
  const wrapper = mountVapor(component, options);
  mounted.push(wrapper);
  return wrapper;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

function key(element: Element, value: string): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value }),
  );
}

function contextmenu(element: Element, clientX = 40, clientY = 60): void {
  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document
    .querySelectorAll("[data-menu-test-portal], [data-menu-test-outside]")
    .forEach((node) => node.remove());
  vi.useRealTimers();
});

it("keeps menu primitives compiled in Vapor mode", () => {
  assertVaporComponents({
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuItemIndicator,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
  });
});

describe("DropdownMenu", () => {
  function mountBasic(onSelect: (event: Event) => void = () => {}) {
    return mount(DropdownMenu, {
      slots: {
        trigger: () => h("button", { "data-testid": "trigger" }, "Open menu"),
        items: () => [
          h(DropdownMenuLabel, { class: "ds-dropdown-menu__label" }, () => "Actions"),
          h(DropdownMenuItem, { textValue: "Alpha", onSelect }, () => "Alpha"),
          h(DropdownMenuItem, { textValue: "Disabled", disabled: true }, () => "Disabled"),
          h(DropdownMenuSeparator),
          h(DropdownMenuItem, { textValue: "Zulu" }, () => "Zulu"),
        ],
      },
    });
  }

  it("opens from click with trigger ARIA, portal semantics and positioning", async () => {
    const wrapper = mountBasic();
    const trigger = wrapper.find<HTMLButtonElement>('[data-testid="trigger"]');
    await settle();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    trigger.click();
    await settle();
    const menu = document.body.querySelector<HTMLElement>(".ds-dropdown-menu")!;
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.zIndex).toBe("var(--dropdown-menu-z)");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe("Alpha");
  });

  it("supports arrow, Home/End, typeahead, disabled skipping and Enter", async () => {
    const onSelect = vi.fn();
    const wrapper = mountBasic(onSelect);
    const trigger = wrapper.find<HTMLButtonElement>('[data-testid="trigger"]');
    key(trigger, "ArrowUp");
    await settle();
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    expect(document.activeElement?.textContent).toBe("Zulu");

    key(menu, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Alpha");
    key(menu, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Zulu");
    key(menu, "Home");
    expect(document.activeElement?.textContent).toBe("Alpha");
    key(menu, "End");
    expect(document.activeElement?.textContent).toBe("Zulu");
    key(menu, "a");
    expect(document.activeElement?.textContent).toBe("Alpha");
    key(document.activeElement!, "Enter");
    await settle();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the menu open when select is prevented and closes outside", async () => {
    const updates: boolean[] = [];
    const wrapper = mount(DropdownMenu, {
      props: { "onUpdate:open": (next: boolean) => updates.push(next) },
      slots: {
        trigger: () => h("button", "Open"),
        items: () =>
          h(
            DropdownMenuItem,
            { onSelect: (event: Event) => event.preventDefault() },
            () => "Stay open",
          ),
      },
    });
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();
    document.body.querySelector<HTMLElement>('[role="menuitem"]')!.click();
    await nextTick();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    const outside = document.createElement("button");
    outside.dataset.menuTestOutside = "";
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(updates).toEqual([true, false]);
  });

  it("closes when focus moves outside", async () => {
    const updates: boolean[] = [];
    const wrapper = mount(DropdownMenu, {
      props: { "onUpdate:open": (next: boolean) => updates.push(next) },
      slots: {
        trigger: () => h("button", "Open"),
        items: () => h(DropdownMenuItem, {}, () => "Item"),
      },
    });
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();

    const outside = document.createElement("button");
    outside.dataset.menuTestOutside = "";
    document.body.appendChild(outside);
    outside.focus();
    await nextTick();

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(updates).toEqual([true, false]);
  });

  it("round-trips radio values and item indicators", async () => {
    const value = ref("system");
    const Host = defineComponent({
      setup: () => () =>
        h(
          DropdownMenu,
          {},
          {
            trigger: () => h("button", "Theme"),
            items: () =>
              h(
                DropdownMenuRadioGroup,
                {
                  modelValue: value.value,
                  "onUpdate:modelValue": (next: string) => (value.value = next),
                },
                {
                  default: () => [
                    h(DropdownMenuRadioItem, { value: "system", textValue: "System" }, () => [
                      h(
                        DropdownMenuItemIndicator,
                        { class: "ds-dropdown-menu__indicator" },
                        () => "✓",
                      ),
                      "System",
                    ]),
                    h(DropdownMenuRadioItem, { value: "light", textValue: "Light" }, () => [
                      h(
                        DropdownMenuItemIndicator,
                        { class: "ds-dropdown-menu__indicator" },
                        () => "✓",
                      ),
                      "Light",
                    ]),
                  ],
                },
              ),
          },
        ),
    });
    const wrapper = mount(Host);
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();
    const radios = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    );
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(radios[0]?.querySelector("[data-menu-indicator]")).not.toBeNull();

    radios[1]?.click();
    await settle();
    expect(value.value).toBe("light");
  });

  it("uses a custom portal target", async () => {
    const portal = document.createElement("div");
    portal.dataset.menuTestPortal = "";
    document.body.appendChild(portal);
    const wrapper = mount(DropdownMenu, {
      props: { align: "end", portalTo: portal, sideOffset: 8 },
      slots: {
        trigger: () => h("button", "Open"),
        items: () => h(DropdownMenuItem, {}, () => "Item"),
      },
    });
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();
    expect(portal.querySelector('[role="menu"]')).not.toBeNull();
  });
});

describe("ContextMenu", () => {
  it("opens at a virtual pointer reference and selects an item", async () => {
    const updates: boolean[] = [];
    const onSelect = vi.fn();
    const wrapper = mount(ContextMenu, {
      props: { modal: false, "onUpdate:open": (next: boolean) => updates.push(next) },
      slots: {
        trigger: () => h("button", { "data-testid": "context-trigger" }, "Right click"),
        items: () => [
          h(ContextMenuItem, { textValue: "Open", onSelect }, () => "Open"),
          h(ContextMenuSeparator),
          h(ContextMenuItem, { disabled: true }, () => "Unavailable"),
        ],
      },
    });
    const trigger = wrapper.find<HTMLButtonElement>('[data-testid="context-trigger"]');
    contextmenu(trigger, 120, 90);
    await settle();
    const menu = document.body.querySelector<HTMLElement>(".ds-context-menu")!;
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.zIndex).toBe("var(--context-menu-z)");
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(document.activeElement?.textContent).toBe("Open");

    menu.querySelector<HTMLElement>('[role="menuitem"]')!.click();
    await settle();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(updates).toEqual([true, false]);
    expect(document.activeElement).toBe(trigger);
  });

  it("blocks modal outside interaction and restores trigger focus", async () => {
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => h("button", "Right click"),
        items: () => h(ContextMenuItem, {}, () => "Open"),
      },
    });
    const trigger = wrapper.find<HTMLButtonElement>("button");
    contextmenu(trigger);
    await settle();

    const outside = document.createElement("button");
    outside.dataset.menuTestOutside = "";
    document.body.appendChild(outside);
    const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    outside.dispatchEvent(event);
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports as-child items and keyboard activation", async () => {
    const onSelect = vi.fn();
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => h("div", { "data-testid": "context-trigger" }, "Target"),
        items: () =>
          h(ContextMenuItem, { asChild: true, textValue: "Color blue", onSelect }, () =>
            h("button", { class: "color-dot", "aria-label": "Color blue" }),
          ),
      },
    });
    contextmenu(wrapper.find('[data-testid="context-trigger"]'));
    await settle();
    const item = document.body.querySelector<HTMLButtonElement>(".color-dot")!;
    expect(item.getAttribute("role")).toBe("menuitem");
    key(item, " ");
    await settle();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it("has no serious accessibility violations while open", async () => {
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => h("button", "Target"),
        items: () => [
          h(ContextMenuItem, {}, () => "Open"),
          h(ContextMenuItem, { disabled: true }, () => "Disabled"),
        ],
      },
    });
    contextmenu(wrapper.find("button"));
    await settle();
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    const axe = (await import("axe-core")).default;
    const results = await axe.run(menu, {
      resultTypes: ["violations"],
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id }) => id),
    ).toEqual([]);
  });
});
