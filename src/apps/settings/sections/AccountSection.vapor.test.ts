import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushPromises, mountVaporTest as mount, type VaporTestWrapper } from "~/test/mountVapor";
import { finishLeavingModals, queryActiveModalDialog } from "~/test/ropavModal";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AccountSection from "./AccountSection.vue";

function makeKernel(overrides: Partial<ReturnType<Kernel["profile"]["current"]>> = {}) {
  const lock = vi.fn(async () => undefined);
  const deleteCurrentProfile = vi.fn(async () => undefined);
  const kernel = {
    profile: {
      current: vi.fn(() => ({
        profileId: "alpha",
        displayName: "Guest",
        owner: { kind: "guest" as const },
        ...overrides,
      })),
      lock,
      deleteCurrentProfile,
    },
  } as unknown as Kernel;

  return { kernel, lock, deleteCurrentProfile };
}

const mountedWrappers: VaporTestWrapper[] = [];

function mountSection(kernel: Kernel): VaporTestWrapper {
  const wrapper = mount(AccountSection, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel } },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function findButtonByText(wrapper: VaporTestWrapper, text: string) {
  const button = wrapper.findAll("button").find((candidate) => candidate.text() === text);
  expect(button).toBeDefined();
  return button!;
}

function findDialogButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(
    queryActiveModalDialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((candidate) => candidate.textContent?.trim() === text);
  expect(button).toBeDefined();
  return button!;
}

async function flushAndPaint(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("AccountSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(async () => {
    await finishLeavingModals();
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
  });

  it("shows the active guest profile and local storage summary", () => {
    const { kernel } = makeKernel();
    const wrapper = mountSection(kernel);

    expect(wrapper.find(".account").exists()).toBe(true);
    expect(wrapper.text()).toContain("Account");
    expect(wrapper.text()).toContain("Guest");
    expect(wrapper.text()).toContain("alpha");
    expect(wrapper.text()).toContain("Guest profile");
    expect(wrapper.text()).toContain("Stored only in this browser");
    expect(wrapper.text()).not.toContain("Sign Out");
  });

  it("labels linked ownership without exposing credentials", () => {
    const { kernel } = makeKernel({
      owner: { kind: "account", accountId: "account-1", linkedAt: 2 },
    });
    const wrapper = mountSection(kernel);

    expect(wrapper.text()).toContain("Linked account profile");
    expect(wrapper.text()).not.toContain("account-1");
  });

  it("locks the session from profile settings", async () => {
    const { kernel, lock } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Lock Session").trigger("click");

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("requires typing the profile name before resetting local data", async () => {
    const { kernel, deleteCurrentProfile } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Reset Local Profile...").trigger("click");
    await flushAndPaint();

    const dialog = queryActiveModalDialog();
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Reset current profile?");
    expect(dialog?.textContent).toContain("Type Guest to confirm");

    const confirmButton = findDialogButtonByText("Reset Profile");
    expect(confirmButton.disabled).toBe(true);

    const input = dialog!.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    input!.value = "Guest";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushAndPaint();
    expect(confirmButton.disabled).toBe(false);

    confirmButton.click();
    await flushAndPaint();

    expect(deleteCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it("cancels profile reset without calling the kernel", async () => {
    const { kernel, deleteCurrentProfile } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Reset Local Profile...").trigger("click");
    await flushAndPaint();

    findDialogButtonByText("Cancel").click();
    await flushAndPaint();

    expect(deleteCurrentProfile).not.toHaveBeenCalled();
    expect(queryActiveModalDialog()).toBeNull();
  });
});
