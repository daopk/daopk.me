import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AccountSection from "./AccountSection.vue";

function makeKernel(overrides: Partial<ReturnType<Kernel["profile"]["current"]>> = {}) {
  const lock = vi.fn(async () => undefined);
  const signOut = vi.fn(async () => undefined);
  const deleteCurrentAccount = vi.fn(async () => undefined);
  const kernel = {
    profile: {
      current: vi.fn(() => ({
        profileId: "alpha",
        displayName: "Alpha",
        authMode: "passkey",
        encryption: "none",
        encrypted: false,
        ...overrides,
      })),
      lock,
      signOut,
      deleteCurrentAccount,
    },
  } as unknown as Kernel;

  return { kernel, lock, signOut, deleteCurrentAccount };
}

const mountedWrappers: VueWrapper[] = [];

function mountSection(kernel: Kernel): VueWrapper {
  const wrapper = mount(AccountSection, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel } },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function findButtonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll("button").find((candidate) => candidate.text() === text);
  expect(button).toBeDefined();
  return button!;
}

function findDialogButtonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
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

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
  });

  it("shows the active local account summary", () => {
    const { kernel } = makeKernel();
    const wrapper = mountSection(kernel);

    expect(wrapper.find(".account").exists()).toBe(true);
    expect(wrapper.text()).toContain("Account");
    expect(wrapper.text()).toContain("Alpha");
    expect(wrapper.text()).toContain("alpha");
    expect(wrapper.text()).toContain("Passkey protected");
    expect(wrapper.text()).toContain("Stored only in this browser");
  });

  it("labels encrypted profiles", () => {
    const { kernel } = makeKernel({
      encryption: "prf-aes-gcm-v1",
      encrypted: true,
    });
    const wrapper = mountSection(kernel);

    expect(wrapper.text()).toContain("Encrypted passkey profile");
  });

  it("labels guest profiles as unencrypted guest accounts", () => {
    const { kernel } = makeKernel({
      authMode: "guest",
      encryption: "none",
      encrypted: false,
    });
    const wrapper = mountSection(kernel);

    expect(wrapper.text()).toContain("Guest account");
    expect(wrapper.text()).toContain("No encryption; stored only in this browser");
  });

  it("locks the session from account settings", async () => {
    const { kernel, lock } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Lock Session").trigger("click");

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("signs out from account settings", async () => {
    const { kernel, signOut } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Sign Out").trigger("click");

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("requires typing the account name before deleting the current account", async () => {
    const { kernel, deleteCurrentAccount } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Delete Account...").trigger("click");
    await flushAndPaint();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Delete current account?");
    expect(dialog?.textContent).toContain("Type Alpha to confirm");

    const confirmButton = findDialogButtonByText("Delete Account");
    expect(confirmButton.disabled).toBe(true);

    const input = dialog!.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    input!.value = "Alph";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushAndPaint();
    expect(confirmButton.disabled).toBe(true);

    input!.value = "Alpha";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushAndPaint();
    expect(confirmButton.disabled).toBe(false);

    confirmButton.click();
    await flushAndPaint();

    expect(deleteCurrentAccount).toHaveBeenCalledTimes(1);
  });

  it("cancels account deletion without calling the kernel", async () => {
    const { kernel, deleteCurrentAccount } = makeKernel();
    const wrapper = mountSection(kernel);

    await findButtonByText(wrapper, "Delete Account...").trigger("click");
    await flushAndPaint();

    findDialogButtonByText("Cancel").click();
    await flushAndPaint();

    expect(deleteCurrentAccount).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
