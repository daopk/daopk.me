import { onBeforeUnmount } from "vue";

import { useKernel } from "~/composables/useKernel";
import { normalizeAppBrowserPath } from "~/core/routing/appBrowserPaths";

type LaunchPayload = KernelEventPayloads["app.launch.requested"];
type SpawnPayload = KernelEventPayloads["app.spawn.new"];

/**
 * Shell-agnostic adapter the bridge drives. Desktop maps these onto its
 * `useWindowManager` surface and mobile onto its session interface; the kernel
 * wiring (which events, in what order, with what cleanup) lives in one place so
 * the two shells can never drift apart.
 */
export interface ShellAppEventBridge {
  launch(manifestId: string, args: LaunchPayload["args"], source: LaunchPayload["source"]): void;
  spawnNew(manifestId: string, args: SpawnPayload["args"]): void;
  openEditor(path: string): void;
  openBlogPost(path: string, slug: string): void;
  openPdfViewer(path: string): void;
  setDocumentPath(handleId: string, manifestId: string, path: string | null): void;
  setBrowserPath(handleId: string, manifestId: string, path: string | null): void;
  removeByHandleId(handleId: string): void;
}

/**
 * Subscribes a shell to the app-lifecycle event surface and tears the
 * subscriptions down on unmount. `app.url.changed` paths are normalized here so
 * both shells receive an already-canonical browser path.
 */
export function useShellAppEventBridge(
  bridge: ShellAppEventBridge,
  kernel: Pick<ReturnType<typeof useKernel>, "events"> = useKernel(),
): void {
  const disposers = [
    kernel.events.on("app.launch.requested", (payload) => {
      bridge.launch(payload.manifestId, payload.args, payload.source);
    }),
    kernel.events.on("app.spawn.new", (payload) => {
      bridge.spawnNew(payload.manifestId, payload.args);
    }),
    kernel.events.on("editor.open.requested", (payload) => {
      bridge.openEditor(payload.path);
    }),
    kernel.events.on("blog.post.open.requested", (payload) => {
      bridge.openBlogPost(payload.path, payload.slug);
    }),
    kernel.events.on("pdf-viewer.open.requested", (payload) => {
      bridge.openPdfViewer(payload.path);
    }),
    kernel.events.on("app.document.changed", (payload) => {
      bridge.setDocumentPath(payload.handleId, payload.manifestId, payload.path);
    }),
    kernel.events.on("app.url.changed", (payload) => {
      bridge.setBrowserPath(
        payload.handleId,
        payload.manifestId,
        payload.path === null ? null : normalizeAppBrowserPath(payload.path),
      );
    }),
    kernel.events.on("app.killed", ({ handleId }) => {
      bridge.removeByHandleId(handleId);
    }),
  ];

  onBeforeUnmount(() => {
    for (const dispose of disposers) {
      dispose();
    }
  });
}
