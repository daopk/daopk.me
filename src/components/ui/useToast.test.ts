import { afterEach, describe, expect, it } from "vitest";
import { createComponent, defineVaporComponent } from "vue";

import { ToastProvider, useToast, type ToastProviderProps, type UseToastReturn } from "ropav/toast";

import { mountVaporRoot, type VaporMount } from "~/test/mountVapor";

const mounted: VaporMount[] = [];

function mountToastConsumer(providerProps: ToastProviderProps = {}): UseToastReturn {
  let toast: UseToastReturn | undefined;
  const Consumer = defineVaporComponent(() => {
    toast = useToast();
    const marker = document.createElement("div");
    marker.dataset.testid = "toast-consumer";
    return marker;
  });
  const Host = defineVaporComponent(() =>
    createComponent(
      ToastProvider,
      { ...providerProps },
      {
        default: () => createComponent(Consumer),
      },
    ),
  );

  mounted.push(mountVaporRoot(Host));
  if (!toast) throw new Error("Toast consumer did not mount inside its provider.");
  return toast;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("Ropav useToast provider contract", () => {
  it("enqueues a toast with provider defaults and returns its id", () => {
    const toast = mountToastConsumer({ duration: 5000, radius: "md" });
    const id = toast.show({ title: "Saved" });

    expect(toast.toasts.value).toHaveLength(1);
    expect(toast.toasts.value[0]).toMatchObject({
      id,
      type: "default",
      props: {
        duration: 5000,
        radius: "md",
        title: "Saved",
      },
    });
  });

  it("applies semantic helpers and custom duration", () => {
    const toast = mountToastConsumer();
    toast.success({ title: "Done" });
    toast.error({ title: "Nope", duration: 2000 });
    toast.warning({ description: "Careful" });
    toast.info({ title: "FYI" });

    expect(toast.toasts.value.map((entry) => entry.type)).toEqual([
      "success",
      "error",
      "warning",
      "info",
    ]);
    expect(toast.toasts.value[1]?.props.duration).toBe(2000);
    expect(toast.toasts.value[1]?.props.role).toBe("alert");
  });

  it("dismisses by id and dismisses the whole provider queue", () => {
    const toast = mountToastConsumer();
    const first = toast.show({ title: "One" });
    toast.show({ title: "Two" });

    toast.dismiss(first);
    expect(toast.toasts.value).toHaveLength(1);
    expect(toast.toasts.value[0]?.props.title).toBe("Two");

    toast.dismissAll();
    expect(toast.toasts.value).toHaveLength(0);
  });

  it("updates an active toast with `type` and enforces the provider maximum", () => {
    const toast = mountToastConsumer({ max: 2 });
    const first = toast.info({ title: "Starting" });
    toast.update(first, { title: "Finished", type: "success", duration: 1000 });

    expect(toast.toasts.value[0]).toMatchObject({
      id: first,
      type: "success",
      props: {
        title: "Finished",
        duration: 1000,
      },
    });

    toast.info({ title: "Second" });
    toast.info({ title: "Third" });
    expect(toast.toasts.value).toHaveLength(2);
    expect(toast.toasts.value.some(({ id }) => id === first)).toBe(false);
  });
});
