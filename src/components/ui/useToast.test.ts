import { beforeEach, describe, expect, it } from "vitest";

import { clearToasts, toastQueue, useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    clearToasts();
  });

  it("enqueues a toast with defaults and returns its id", () => {
    const toast = useToast();
    const id = toast.show({ title: "Saved" });

    expect(toastQueue).toHaveLength(1);
    expect(toastQueue[0].id).toBe(id);
    expect(toastQueue[0].tone).toBe("info");
    expect(toastQueue[0].duration).toBe(5000);
    expect(toastQueue[0].title).toBe("Saved");
  });

  it("applies tone helpers and custom duration", () => {
    const toast = useToast();
    toast.success({ title: "Done" });
    toast.error({ title: "Nope", duration: 2000 });
    toast.warning({ description: "Careful" });
    toast.info({ title: "FYI" });

    expect(toastQueue.map((entry) => entry.tone)).toEqual(["success", "error", "warning", "info"]);
    expect(toastQueue[1].duration).toBe(2000);
  });

  it("dismisses by id and clears the whole queue", () => {
    const toast = useToast();
    const first = toast.show({ title: "One" });
    toast.show({ title: "Two" });

    toast.dismiss(first);
    expect(toastQueue).toHaveLength(1);
    expect(toastQueue[0].title).toBe("Two");

    toast.clear();
    expect(toastQueue).toHaveLength(0);
  });
});
