import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from "vue";

export interface OnlineStatusWindowLike {
  addEventListener(type: "online" | "offline", listener: EventListener): void;
  removeEventListener(type: "online" | "offline", listener: EventListener): void;
}

export interface OnlineStatusNavigatorLike {
  readonly onLine?: boolean;
}

interface UseOnlineStatus {
  readonly isOnline: Ref<boolean>;
  readonly isOffline: ComputedRef<boolean>;
}

export function useOnlineStatus(
  windowLike: OnlineStatusWindowLike | undefined = typeof window === "undefined"
    ? undefined
    : window,
  navigatorLike: OnlineStatusNavigatorLike | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): UseOnlineStatus {
  const isOnline = ref(navigatorLike?.onLine !== false);

  function sync(): void {
    isOnline.value = navigatorLike?.onLine !== false;
  }

  onMounted(() => {
    sync();
    windowLike?.addEventListener("online", sync);
    windowLike?.addEventListener("offline", sync);
  });

  onUnmounted(() => {
    windowLike?.removeEventListener("online", sync);
    windowLike?.removeEventListener("offline", sync);
  });

  return {
    isOnline,
    isOffline: computed(() => !isOnline.value),
  };
}
