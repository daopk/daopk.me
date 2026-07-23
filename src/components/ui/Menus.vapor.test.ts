import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, defineVaporComponent, nextTick, ref } from "vue";

import { assertVaporComponents, mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./index";
import { useMenuLifecycle } from "./useMenuLifecycle";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

function element(
  tag: "button" | "div",
  text: string,
  attrs: Readonly<Record<string, string>> = {},
): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

function renderComponent(
  component: Parameters<typeof createComponent>[0],
  props: Readonly<Record<string, unknown>> = {},
  slots?: Readonly<Record<string, () => unknown>>,
) {
  const rawProps = Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      typeof value === "function" ? () => value : value,
    ]),
  );
  return createComponent(component, rawProps, slots as never);
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

function activeMenuItem(menu: HTMLElement): HTMLElement | null {
  const activeId = menu.getAttribute("aria-activedescendant");
  return activeId ? document.getElementById(activeId) : null;
}

function controlAnimationFrames() {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });

  return {
    pending: () => callbacks.length,
    flushNext: () => {
      callbacks.shift()?.(0);
    },
  };
}

function mountMenuLifecycleHarness() {
  let lifecycle!: ReturnType<typeof useMenuLifecycle>;
  const Host = defineVaporComponent(() => {
    lifecycle = useMenuLifecycle({
      isModal: () => false,
      onOpenChange: () => {},
    });
    return document.createElement("div");
  });
  const wrapper = mount(Host);
  const trigger = document.createElement("button");
  const portalRoot = document.createElement("div");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  portalRoot.appendChild(menu);
  lifecycle.setTrigger(trigger);
  lifecycle.portalRoot.value = portalRoot;

  return { lifecycle, menu, trigger, wrapper };
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document
    .querySelectorAll("[data-menu-test-portal], [data-menu-test-outside]")
    .forEach((node) => node.remove());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("keeps menu primitives compiled in Vapor mode", () => {
  assertVaporComponents({
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuItem,
    DropdownMenuItemIndicator,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
  });
});

describe("useMenuLifecycle", () => {
  it("does not focus menu content after closing before the delayed frame", async () => {
    const frames = controlAnimationFrames();
    const { lifecycle, menu } = mountMenuLifecycleHarness();
    const focus = vi.spyOn(menu, "focus");

    lifecycle.onOpenChange(true);
    await nextTick();
    expect(frames.pending()).toBe(1);

    lifecycle.suppressFocusRestore();
    lifecycle.onOpenChange(false);
    frames.flushNext();
    await settle();

    expect(focus).not.toHaveBeenCalled();
  });

  it("does not focus menu content after unmounting before the delayed frame", async () => {
    const frames = controlAnimationFrames();
    const { lifecycle, menu, wrapper } = mountMenuLifecycleHarness();
    const focus = vi.spyOn(menu, "focus");

    lifecycle.onOpenChange(true);
    await nextTick();
    expect(frames.pending()).toBe(1);

    wrapper.unmount();
    frames.flushNext();
    await settle();

    expect(focus).not.toHaveBeenCalled();
  });

  it("does not restore trigger focus after closing and immediately reopening", async () => {
    const frames = controlAnimationFrames();
    const { lifecycle, menu, trigger } = mountMenuLifecycleHarness();
    const focusMenu = vi.spyOn(menu, "focus");
    const focusTrigger = vi.spyOn(trigger, "focus");

    lifecycle.onOpenChange(true);
    await nextTick();
    lifecycle.onOpenChange(false);
    lifecycle.onOpenChange(true);
    await settle();

    expect(frames.pending()).toBe(2);
    frames.flushNext();
    await settle();
    expect(focusMenu).not.toHaveBeenCalled();

    frames.flushNext();
    await settle();

    expect(focusMenu).toHaveBeenCalledOnce();
    expect(focusTrigger).not.toHaveBeenCalled();
  });
});

describe("DropdownMenu", () => {
  function mountBasic(onSelect: (event: Event) => void = () => {}) {
    return mount(DropdownMenu, {
      slots: {
        trigger: () => element("button", "Open menu", { "data-testid": "trigger" }),
        items: () => [
          renderComponent(
            DropdownMenuLabel,
            { class: "ds-dropdown-menu__label" },
            { default: () => text("Actions") },
          ),
          renderComponent(
            DropdownMenuItem,
            { textValue: "Alpha", onSelect },
            { default: () => text("Alpha") },
          ),
          renderComponent(
            DropdownMenuItem,
            { textValue: "Disabled", disabled: true },
            { default: () => text("Disabled") },
          ),
          renderComponent(DropdownMenuSeparator),
          renderComponent(DropdownMenuItem, { textValue: "Zulu" }, { default: () => text("Zulu") }),
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
    expect(menu.style.zIndex).toBe("1200");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(document.activeElement).toBe(menu);
    expect(activeMenuItem(menu)?.textContent).toBe("Alpha");
  });

  it("supports arrow, Home/End, typeahead, disabled skipping and Enter", async () => {
    const onSelect = vi.fn();
    const wrapper = mountBasic(onSelect);
    const trigger = wrapper.find<HTMLButtonElement>('[data-testid="trigger"]');
    key(trigger, "ArrowUp");
    await settle();
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    expect(document.activeElement).toBe(menu);
    expect(activeMenuItem(menu)?.textContent).toBe("Zulu");

    key(menu, "ArrowDown");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Alpha");
    key(menu, "ArrowDown");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Zulu");
    key(menu, "Home");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Alpha");
    key(menu, "End");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Zulu");
    key(menu, "a");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Alpha");
    key(menu, "Enter");
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
        trigger: () => element("button", "Open"),
        items: () =>
          renderComponent(
            DropdownMenuItem,
            { onSelect: (event: Event) => event.preventDefault() },
            { default: () => text("Stay open") },
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
        trigger: () => element("button", "Open"),
        items: () => renderComponent(DropdownMenuItem, {}, { default: () => text("Item") }),
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
    const Host = defineVaporComponent(() =>
      createComponent(
        DropdownMenu,
        {},
        {
          trigger: () => element("button", "Theme"),
          items: () =>
            createComponent(
              DropdownMenuRadioGroup,
              {
                modelValue: () => value.value,
                "onUpdate:modelValue": () => (next: string) => (value.value = next),
              },
              {
                default: () => [
                  renderComponent(
                    DropdownMenuRadioItem,
                    { value: "system", textValue: "System" },
                    {
                      default: () => [
                        renderComponent(
                          DropdownMenuItemIndicator,
                          { class: "ds-dropdown-menu__indicator" },
                          { default: () => text("✓") },
                        ),
                        text("System"),
                      ],
                    },
                  ),
                  renderComponent(
                    DropdownMenuRadioItem,
                    { value: "light", textValue: "Light" },
                    {
                      default: () => [
                        renderComponent(
                          DropdownMenuItemIndicator,
                          { class: "ds-dropdown-menu__indicator" },
                          { default: () => text("✓") },
                        ),
                        text("Light"),
                      ],
                    },
                  ),
                ],
              },
            ),
        },
      ),
    );
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
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("Theme");
  });

  it("round-trips checkbox state and keeps the menu open", async () => {
    const checked = ref<boolean | "indeterminate">(false);
    const Host = defineVaporComponent(() =>
      createComponent(
        DropdownMenu,
        {},
        {
          trigger: () => element("button", "Preferences"),
          items: () =>
            createComponent(
              DropdownMenuCheckboxItem,
              {
                modelValue: () => checked.value,
                textValue: "Notifications",
                "onUpdate:modelValue": () => (next: boolean | "indeterminate") =>
                  (checked.value = next),
              },
              {
                default: () => [
                  renderComponent(
                    DropdownMenuItemIndicator,
                    { class: "ds-dropdown-menu__indicator" },
                    { default: () => text("✓") },
                  ),
                  text("Notifications"),
                ],
              },
            ),
        },
      ),
    );
    const wrapper = mount(Host);
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();

    const checkbox = document.body.querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(checkbox.querySelector("[data-menu-indicator]")).toBeNull();

    checkbox.click();
    await settle();
    expect(checked.value).toBe(true);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.querySelector("[data-menu-indicator]")).not.toBeNull();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    checked.value = "indeterminate";
    await settle();
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
    expect(checkbox.getAttribute("data-state")).toBe("indeterminate");
  });

  it("opens and closes submenus with horizontal keys", async () => {
    const wrapper = mount(DropdownMenu, {
      slots: {
        trigger: () => element("button", "Actions"),
        items: () =>
          renderComponent(
            DropdownMenuSub,
            {},
            {
              default: () => [
                renderComponent(
                  DropdownMenuSubTrigger,
                  { textValue: "Move to" },
                  { default: () => text("Move to") },
                ),
                renderComponent(
                  DropdownMenuSubContent,
                  { ariaLabel: "Move to" },
                  {
                    default: () =>
                      renderComponent(
                        DropdownMenuItem,
                        { textValue: "Backlog" },
                        { default: () => text("Backlog") },
                      ),
                  },
                ),
              ],
            },
          ),
      },
    });
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();
    const rootMenu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    const subTrigger = activeMenuItem(rootMenu)!;
    expect(subTrigger.textContent).toBe("Move to");

    key(rootMenu, "ArrowRight");
    await settle();
    const menus = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"]'));
    expect(menus).toHaveLength(2);
    expect(subTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(activeMenuItem(menus[1]!)?.textContent).toBe("Backlog");

    key(menus[1]!, "ArrowLeft");
    await settle();
    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(document.activeElement).toBe(rootMenu);
    expect(activeMenuItem(rootMenu)).toBe(subTrigger);

    subTrigger.dispatchEvent(new MouseEvent("mouseenter", { cancelable: true }));
    await settle();
    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(2);
  });

  it("uses a custom portal target", async () => {
    const portal = document.createElement("div");
    portal.dataset.menuTestPortal = "";
    document.body.appendChild(portal);
    const wrapper = mount(DropdownMenu, {
      props: { align: "end", portalTo: portal, sideOffset: 8 },
      slots: {
        trigger: () => element("button", "Open"),
        items: () => renderComponent(DropdownMenuItem, {}, { default: () => text("Item") }),
      },
    });
    wrapper.find<HTMLButtonElement>("button").click();
    await settle();
    expect(portal.querySelector('[role="menu"]')).not.toBeNull();
  });

  it("increments Ropav layers and removes portalled content on unmount", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});
    const Host = defineVaporComponent(() => [
      createComponent(
        DropdownMenu,
        {},
        {
          trigger: () => element("button", "First", { "data-testid": "first" }),
          items: () => renderComponent(DropdownMenuItem, {}, { default: () => text("One") }),
        },
      ),
      createComponent(
        DropdownMenu,
        {},
        {
          trigger: () => element("button", "Second", { "data-testid": "second" }),
          items: () => renderComponent(DropdownMenuItem, {}, { default: () => text("Two") }),
        },
      ),
    ]);
    const wrapper = mount(Host);
    wrapper.find<HTMLButtonElement>('[data-testid="first"]').click();
    wrapper.find<HTMLButtonElement>('[data-testid="second"]').click();
    await settle();

    const menus = Array.from(document.body.querySelectorAll<HTMLElement>(".ds-dropdown-menu"));
    expect(menus.map((menu) => menu.style.zIndex)).toEqual(["1200", "1202"]);

    wrapper.unmount();
    await settle();
    expect(document.body.querySelector(".ds-dropdown-menu")).toBeNull();
    focus.mockRestore();
  });
});

describe("ContextMenu", () => {
  it("opens at a virtual pointer reference and selects an item", async () => {
    const updates: boolean[] = [];
    const onSelect = vi.fn();
    const wrapper = mount(ContextMenu, {
      props: { modal: false, "onUpdate:open": (next: boolean) => updates.push(next) },
      slots: {
        trigger: () => element("button", "Right click", { "data-testid": "context-trigger" }),
        items: () => [
          renderComponent(
            ContextMenuItem,
            { textValue: "Open", onSelect },
            { default: () => text("Open") },
          ),
          renderComponent(ContextMenuSeparator),
          renderComponent(
            ContextMenuItem,
            { disabled: true },
            { default: () => text("Unavailable") },
          ),
        ],
      },
    });
    const trigger = wrapper.find<HTMLButtonElement>('[data-testid="context-trigger"]');
    contextmenu(trigger, 120, 90);
    await settle();
    const menu = document.body.querySelector<HTMLElement>(".ds-context-menu")!;
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.zIndex).toBe("1700");
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(document.activeElement).toBe(menu);
    expect(activeMenuItem(menu)?.textContent).toBe("Open");

    menu.querySelector<HTMLElement>('[role="menuitem"]')!.click();
    await settle();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(updates).toEqual([true, false]);
    expect(document.activeElement).toBe(trigger);
  });

  it("blocks modal outside interaction and restores trigger focus", async () => {
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => element("button", "Right click"),
        items: () => renderComponent(ContextMenuItem, {}, { default: () => text("Open") }),
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

  it("opens from the keyboard and touch long-press", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ContextMenu, {
      props: { modal: false },
      slots: {
        trigger: () => element("div", "Target", { tabindex: "0" }),
        items: () => renderComponent(ContextMenuItem, {}, { default: () => text("Inspect") }),
      },
    });
    const trigger = wrapper.find<HTMLElement>("div");

    key(trigger, "ContextMenu");
    await settle();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    key(document.body.querySelector<HTMLElement>('[role="menu"]')!, "Escape");
    await settle();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "F10",
        shiftKey: true,
      }),
    );
    await settle();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    key(document.body.querySelector<HTMLElement>('[role="menu"]')!, "Escape");
    await settle();
    const pointerdown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerdown, {
      pointerId: { value: 1 },
      pointerType: { value: "touch" },
      clientX: { value: 25 },
      clientY: { value: 40 },
    });
    trigger.dispatchEvent(pointerdown);
    await vi.advanceTimersByTimeAsync(600);
    await settle();

    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });

  it("supports as-child items and keyboard activation", async () => {
    const onSelect = vi.fn();
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => element("div", "Target", { "data-testid": "context-trigger" }),
        items: () =>
          renderComponent(
            ContextMenuItem,
            { asChild: true, textValue: "Color blue", onSelect },
            {
              default: () =>
                element("button", "", { class: "color-dot", "aria-label": "Color blue" }),
            },
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

  it("supports typeahead and removes portalled content on unmount", async () => {
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => element("button", "Target"),
        items: () => [
          renderComponent(
            ContextMenuItem,
            { textValue: "Alpha" },
            { default: () => text("Alpha") },
          ),
          renderComponent(ContextMenuItem, { textValue: "Zulu" }, { default: () => text("Zulu") }),
        ],
      },
    });
    contextmenu(wrapper.find("button"));
    await settle();

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')!;
    key(menu, "z");
    await nextTick();
    expect(activeMenuItem(menu)?.textContent).toBe("Zulu");

    wrapper.unmount();
    await settle();
    expect(document.body.querySelector(".ds-context-menu")).toBeNull();
  });

  it("has no serious accessibility violations while open", async () => {
    const wrapper = mount(ContextMenu, {
      slots: {
        trigger: () => element("button", "Target"),
        items: () => [
          renderComponent(ContextMenuItem, {}, { default: () => text("Open") }),
          renderComponent(ContextMenuItem, { disabled: true }, { default: () => text("Disabled") }),
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
