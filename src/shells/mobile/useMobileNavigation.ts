import { computed, type ComputedRef, type DeepReadonly, type Ref } from "vue";

import { useKernel } from "~/composables/useKernel";

import { navigation, type NavigationFrame } from "./navigation";

export interface UseMobileNavigation {
  readonly currentFrame: ComputedRef<NavigationFrame | null>;
  readonly foreground: Readonly<Ref<string | null>>;
  readonly stack: DeepReadonly<NavigationFrame[]>;
  readonly depth: ComputedRef<number>;
  launch(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<void>;
  goHome(): void;
  focusFrame(frameId: string): void;
  dismiss(frameId: string): void;
  dismissAll(): void;
  removeByHandleId(handleId: string): boolean;
  setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean;
  spawnNew(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<void>;
}

export function useMobileNavigation(): UseMobileNavigation {
  const kernel = useKernel();
  navigation.init(kernel);

  const stack = navigation.stack;
  const foreground = navigation.foreground;

  const currentFrame = computed<NavigationFrame | null>(() => {
    const fg = foreground.value;
    if (fg === null) {
      return null;
    }
    return stack.find((f) => f.frameId === fg) ?? null;
  });

  const depth = computed<number>(() => stack.length);

  async function launch(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await navigation.launch(manifestId, args);
  }

  function goHome(): void {
    navigation.goHome();
  }

  function focusFrame(frameId: string): void {
    navigation.focusFrame(frameId);
  }

  function dismiss(frameId: string): void {
    navigation.dismiss(frameId);
  }

  function dismissAll(): void {
    navigation.dismissAll();
  }

  function removeByHandleId(handleId: string): boolean {
    return navigation.removeByHandleId(handleId);
  }

  function setDocumentPath(handleId: string, manifestId: string, path: string | null): boolean {
    return navigation.setDocumentPath(handleId, manifestId, path);
  }

  async function spawnNew(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await navigation.spawnNew(manifestId, args);
  }

  return {
    currentFrame,
    foreground,
    stack,
    depth,
    launch,
    goHome,
    focusFrame,
    dismiss,
    dismissAll,
    removeByHandleId,
    setDocumentPath,
    spawnNew,
  };
}
