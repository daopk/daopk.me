import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";

import {
  AppContextInjectionKey,
  isEditableVfsTextFile,
  KernelInjectionKey,
  normalizeVfsPath,
  VfsError,
  type AppContext,
  type Kernel,
  type VfsDirEntry,
  type VfsStat,
} from "~/runtime/sdk";
import { basename, isDirectChild } from "~/core/vfs/path";

import VfsFilePickerDialog from "./VfsFilePickerDialog.vue";

type VfsFilePickerDialogProps = Parameters<typeof VfsFilePickerDialog>[0];

interface FakeNode {
  readonly kind: "directory" | "file";
  readonly mimeType?: string;
  readonly size?: number;
  readonly updatedAt?: number;
}

function makeStat(path: string, node: FakeNode): VfsStat {
  return {
    path: normalizeVfsPath(path),
    kind: node.kind,
    size: node.size ?? 0,
    createdAt: 0,
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function makeEntry(path: string, node: FakeNode): VfsDirEntry {
  const normalized = normalizeVfsPath(path);
  return {
    name: basename(normalized),
    path: normalized,
    kind: node.kind,
    size: node.size ?? 0,
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function makeKernel(seed: Record<string, FakeNode>): Kernel {
  const nodes = new Map(
    Object.entries(seed).map(([path, node]) => [normalizeVfsPath(path), node] as const),
  );

  return {
    vfs: {
      stat: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const node = nodes.get(normalized);
        if (node === undefined) {
          throw new VfsError("NOT_FOUND", `Path not found: ${normalized}`, { path: normalized });
        }
        return makeStat(normalized, node);
      }),
      list: vi.fn(async (path: string) => {
        const normalized = normalizeVfsPath(path);
        const node = nodes.get(normalized);
        if (node === undefined) {
          throw new VfsError("NOT_FOUND", `Path not found: ${normalized}`, { path: normalized });
        }
        if (node.kind !== "directory") {
          throw new VfsError("NOT_DIRECTORY", `Path is not a directory: ${normalized}`, {
            path: normalized,
          });
        }

        return Array.from(nodes.entries())
          .filter(([candidate]) => isDirectChild(normalized, candidate))
          .map(([candidate, child]) => makeEntry(candidate, child));
      }),
      read: vi.fn(async () => null),
      readText: vi.fn(async () => null),
      write: vi.fn(async () => null),
      writeText: vi.fn(async () => null),
      mkdir: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
  } as unknown as Kernel;
}

function makeContext(): AppContext {
  return {
    manifestId: "editor",
    handleId: "editor-handle",
    args: {},
  };
}

function mountPicker(kernel: Kernel, props: Partial<VfsFilePickerDialogProps> = {}) {
  return mount(VfsFilePickerDialog, {
    attachTo: document.body,
    props: {
      open: true,
      initialPath: "/home",
      accept: (entry: VfsDirEntry) => entry.kind === "file" && isEditableVfsTextFile(entry),
      ...props,
    },
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
        [AppContextInjectionKey as symbol]: makeContext(),
      },
    },
  });
}

function optionByText(text: string): HTMLElement {
  const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (option === undefined) {
    throw new Error(`Option not found: ${text}`);
  }
  return option;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (button === undefined) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function flushPicker(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("VfsFilePickerDialog", () => {
  it("shows unsupported files but only confirms accepted files", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/readme.md": { kind: "file", mimeType: "text/markdown", size: 10 },
      "/home/photo.png": { kind: "file", mimeType: "image/png", size: 20 },
    });
    const wrapper = mountPicker(kernel);

    await flushPicker();

    expect(optionByText("readme.md")).toBeTruthy();
    const unsupported = optionByText("photo.png");
    expect(unsupported.getAttribute("aria-disabled")).toBe("true");

    unsupported.click();
    await flushPicker();
    expect(buttonByText("Open").disabled).toBe(true);
    expect(document.body.textContent).toContain("Editor can open text or Markdown files.");

    optionByText("readme.md").click();
    await flushPicker();
    expect(buttonByText("Open").disabled).toBe(false);
    buttonByText("Open").click();
    await flushPicker();

    expect(wrapper.emitted("confirm")).toEqual([["/home/readme.md"]]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });

  it("opens directories with Enter and navigates with breadcrumbs", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/docs": { kind: "directory" },
      "/home/docs/note.txt": { kind: "file", mimeType: "text/plain" },
    });
    mountPicker(kernel);

    await flushPicker();
    expect(optionByText("docs")).toBeTruthy();

    const listbox = document.body.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox).not.toBeNull();
    listbox!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    await flushPicker();

    expect(optionByText("note.txt")).toBeTruthy();
    buttonByText("home").click();
    await flushPicker();

    expect(optionByText("docs")).toBeTruthy();
  });

  it("falls back to /home when the initial folder is missing", async () => {
    const kernel = makeKernel({
      "/home": { kind: "directory" },
      "/home/fallback.txt": { kind: "file", mimeType: "text/plain" },
    });
    mountPicker(kernel, { initialPath: "/missing/file.txt" });

    await flushPicker();

    expect(optionByText("fallback.txt")).toBeTruthy();
    expect(kernel.vfs.list).toHaveBeenCalledWith("/missing/file.txt", {
      handleId: "editor-handle",
    });
    expect(kernel.vfs.list).toHaveBeenCalledWith("/home", { handleId: "editor-handle" });
  });

  it("cancels and restores focus to the opener", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Browse files";
    document.body.append(opener);
    opener.focus();

    const wrapper = mountPicker(
      makeKernel({
        "/home": { kind: "directory" },
      }),
    );
    await flushPicker();

    buttonByText("Cancel").click();
    await wrapper.setProps({ open: false });
    await flushPicker();

    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(document.activeElement).toBe(opener);
  });
});
