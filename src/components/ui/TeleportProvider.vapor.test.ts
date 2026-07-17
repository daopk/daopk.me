import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, nextTick } from "vue";
import { TeleportProvider } from "ropav/teleport-provider";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

import Dialog from "./Dialog.vue";
import DropdownMenu, { DropdownMenuItem } from "./DropdownMenu.vue";
import Tooltip from "./Tooltip.vue";

const mounted: VaporMount[] = [];

function mount(
  component: Parameters<typeof mountVaporRoot>[0],
  options?: Parameters<typeof mountVaporRoot>[1],
) {
  const wrapper = mountVaporRoot(component, options);
  mounted.push(wrapper);
  return wrapper;
}

function button(text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  return element;
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
        default: () => {
          const portal = document.createElement("div");
          portal.id = "provider-floating-target";
          return [
            portal,
            createComponent(
              Tooltip,
              { delayDuration: 0, label: "Provider tooltip" },
              { default: () => button("Trigger") },
            ),
          ];
        },
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
          createComponent(
            DropdownMenu,
            {},
            {
              trigger: () => button("Open menu"),
              items: () =>
                createComponent(
                  DropdownMenuItem,
                  {},
                  {
                    default: () => document.createTextNode("Item"),
                  },
                ),
            },
          ),
      },
    });

    wrapper.find<HTMLButtonElement>("button").click();
    await settle();

    expect(portal.querySelector('[role="menu"]')?.textContent).toContain("Item");
  });

  it("provides the default target through the Ropav dialog portal", async () => {
    const portal = createPortal("provider-dialog-target");
    mount(TeleportProvider, {
      props: { teleportTo: "#provider-dialog-target" },
      slots: {
        default: () =>
          createComponent(
            Dialog,
            { open: true, title: "Provider dialog" },
            { default: () => button("Dialog action") },
          ),
      },
    });
    await settle();

    expect(portal.querySelector('[role="dialog"]')?.textContent).toContain("Provider dialog");
  });

  it("keeps portalTo as a local override", async () => {
    vi.useFakeTimers();
    const providerPortal = createPortal("provider-default-target");
    const overridePortal = createPortal("provider-override-target");
    const wrapper = mount(TeleportProvider, {
      props: { teleportTo: "#provider-default-target" },
      slots: {
        default: () =>
          createComponent(
            Tooltip,
            { delayDuration: 0, label: "Overridden tooltip", portalTo: overridePortal },
            { default: () => button("Trigger") },
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
