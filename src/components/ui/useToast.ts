import { computed } from "vue";

import { createToastStore, type ToastUpdateOptions } from "ropav/toast";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title?: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms (default 5000). */
  duration?: number;
}

export interface ToastRecord {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly duration: number;
}

const DEFAULT_DURATION = 5000;
const DEFAULT_MAX = 5;

let counter = 0;
const records = new Map<string, ToastRecord>();

/** Shared lifecycle store so calls survive ToastHost mount boundaries. */
export const ropavToastStore = createToastStore({
  max: DEFAULT_MAX,
  duration: DEFAULT_DURATION,
  radius: "md",
  closeLabel: "Dismiss notification",
});

/** Internal read model retained for focused queue assertions. */
export const toastQueue = computed<readonly ToastRecord[]>(() =>
  ropavToastStore.toasts.value.flatMap((toast) => {
    const record = records.get(toast.id);
    return record ? [record] : [];
  }),
);

function providerOptions(toast: ToastRecord) {
  return {
    id: toast.id,
    type: toast.tone,
    title: toast.title,
    description: toast.description,
    duration: toast.duration,
    onClose: () => records.delete(toast.id),
  } as const;
}

export function dismissToast(id: string): void {
  ropavToastStore.dismiss(id);
  records.delete(id);
}

export function clearToasts(): void {
  ropavToastStore.dismissAll();
  records.clear();
}

function pushToast(options: ToastOptions): string {
  counter += 1;
  const toast: ToastRecord = {
    id: `ds-toast-${counter}`,
    tone: options.tone ?? "info",
    title: options.title,
    description: options.description,
    duration: options.duration ?? DEFAULT_DURATION,
  };
  records.set(toast.id, toast);
  ropavToastStore.show(providerOptions(toast));
  return toast.id;
}

function updateToast(id: string, options: Partial<ToastOptions>): void {
  const current = records.get(id);
  if (!current) return;
  const next: ToastRecord = {
    id,
    tone: options.tone ?? current.tone,
    title: Object.hasOwn(options, "title") ? options.title : current.title,
    description: Object.hasOwn(options, "description") ? options.description : current.description,
    duration: options.duration ?? current.duration,
  };
  records.set(id, next);
  ropavToastStore.update(id, {
    type: next.tone,
    title: next.title ?? "",
    description: next.description ?? "",
    duration: next.duration,
  } satisfies ToastUpdateOptions);
}

export interface ToastApi {
  /** Enqueue a toast and return its id (use with {@link ToastApi.dismiss}). */
  show: (options: ToastOptions) => string;
  info: (options: Omit<ToastOptions, "tone">) => string;
  success: (options: Omit<ToastOptions, "tone">) => string;
  warning: (options: Omit<ToastOptions, "tone">) => string;
  error: (options: Omit<ToastOptions, "tone">) => string;
  update: (id: string, options: Partial<ToastOptions>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const toastApi: ToastApi = {
  show: pushToast,
  info: (options) => pushToast({ ...options, tone: "info" }),
  success: (options) => pushToast({ ...options, tone: "success" }),
  warning: (options) => pushToast({ ...options, tone: "warning" }),
  error: (options) => pushToast({ ...options, tone: "error" }),
  update: updateToast,
  dismiss: dismissToast,
  clear: clearToasts,
};

/** Imperative toast API. Safe to call before or after ToastHost mounts. */
export function useToast(): ToastApi {
  return toastApi;
}
