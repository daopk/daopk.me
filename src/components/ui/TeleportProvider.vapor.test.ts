import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { TeleportProvider } from "ropav/teleport-provider";

import { mountVapor, type VaporMount } from "~/test/mountVapor";

import DropdownMenu, { DropdownMenuItem } from "./DropdownMenu.vue";
import Tooltip from "./Tooltip.vue";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVapor>[0],
  options?: Parameters<typeof mountVapor>[1],
) {
  const wrapper = mountVapor(component, options);
  mounted.push(wrapper);
  return wrapper;
}

function createPortal(id: string): HTMLElement {
  const portal = document.createElement("div");
  portal.id = id;
  portal.dataset.teleportProviderTest = "";
  document.body.appendChild(portal);
  return portal;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.querySelectorAll("[data-teleport-provider-test]").forEach((element) => element.remove());
});

describe("TeleportProvider integration", () => {
  it("provides the default target to local overlay wrappers", async () => {
    vi.useFakeTimers();
    const wrapper = mount(TeleportProvider, {
      props: { teleportTo: "#provider-floating-target" },
      slots: {
        default: () => [
          h("div", { id: "provider-floating-target" }),
          h(
            Tooltip,
            { delayDuration: 0, label: "Provider tooltip" },
            { default: () => h("button", "Trigger") },
          ),
        ],
      },
    });
    const portal = wrapper.find<HTMLElement>("#provider-floating-target");

    wrapper
      .find<HTMLButtonElement>("button")
      .dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
    await vi.runAllTimersAsync();
    await settle();

    expect(portal.querySelector('[role="tooltip"]')?.textContent).toContain("Provider tooltip");
  });

  it("provides the default target through the Ropav menu composable", async () => {
    const portal = createPortal("provider-menu-target");
    const wrapper = mount(TeleportProvider, {
      props: { teleportTo: "#provider-menu-target" },
      slots: {
        default: () =>
          h(
            DropdownMenu,
            {},
            {
              trigger: () => h("button", "Open menu"),
              items: () => h(DropdownMenuItem, {}, () => "Item"),
            },
          ),
      },
    });

    wrapper.find<HTMLButtonElement>("button").click();
    await settle();

    expect(portal.querySelector('[role="menu"]')?.textContent).toContain("Item");
  });

  it("keeps portalTo as a local override", async () => {
    vi.useFakeTimers();
    const providerPortal = createPortal("provider-default-target");
    const overridePortal = createPortal("provider-override-target");
    const wrapper = mount(TeleportProvider, {
      props: { teleportTo: "#provider-default-target" },
      slots: {
        default: () =>
          h(
            Tooltip,
            { delayDuration: 0, label: "Overridden tooltip", portalTo: overridePortal },
            { default: () => h("button", "Trigger") },
          ),
      },
    });

    wrapper
      .find<HTMLButtonElement>("button")
      .dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
    await vi.runAllTimersAsync();
    await settle();

    expect(overridePortal.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Overridden tooltip",
    );
    expect(providerPortal.querySelector('[role="tooltip"]')).toBeNull();
  });
});
