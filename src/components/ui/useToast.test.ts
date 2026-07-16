import { beforeEach, describe, expect, it } from "vitest";

import { clearToasts, toastQueue, useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    clearToasts();
  });

  it("enqueues a toast with defaults and returns its id", () => {
    const toast = useToast();
    const id = toast.show({ title: "Saved" });

    expect(toastQueue.value).toHaveLength(1);
    expect(toastQueue.value[0]?.id).toBe(id);
    expect(toastQueue.value[0]?.tone).toBe("info");
    expect(toastQueue.value[0]?.duration).toBe(5000);
    expect(toastQueue.value[0]?.title).toBe("Saved");
  });

  it("applies tone helpers and custom duration", () => {
    const toast = useToast();
    toast.success({ title: "Done" });
    toast.error({ title: "Nope", duration: 2000 });
    toast.warning({ description: "Careful" });
    toast.info({ title: "FYI" });

    expect(toastQueue.value.map((entry) => entry.tone)).toEqual([
      "success",
      "error",
      "warning",
      "info",
    ]);
    expect(toastQueue.value[1]?.duration).toBe(2000);
  });

  it("dismisses by id and clears the whole queue", () => {
    const toast = useToast();
    const first = toast.show({ title: "One" });
    toast.show({ title: "Two" });

    toast.dismiss(first);
    expect(toastQueue.value).toHaveLength(1);
    expect(toastQueue.value[0]?.title).toBe("Two");

    toast.clear();
    expect(toastQueue.value).toHaveLength(0);
  });

  it("updates an active toast and bounds the buffered queue", () => {
    const toast = useToast();
    const first = toast.info({ title: "Starting" });
    toast.update(first, { title: "Finished", tone: "success", duration: 1000 });

    expect(toastQueue.value[0]).toMatchObject({
      id: first,
      title: "Finished",
      tone: "success",
      duration: 1000,
    });

    toast.update(first, { title: undefined, description: undefined });
    expect(toastQueue.value[0]).toMatchObject({
      id: first,
      title: undefined,
      description: undefined,
    });

    for (let index = 0; index < 5; index += 1) toast.info({ title: `Toast ${index}` });
    expect(toastQueue.value).toHaveLength(5);
    expect(toastQueue.value.some(({ id }) => id === first)).toBe(false);
  });
});
