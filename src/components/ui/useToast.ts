import { reactive } from "vue";

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

/**
 * Live queue rendered by the global {@link ToastHost}. Module-level singleton so
 * any app/shell can enqueue a toast through {@link useToast} and have it appear
 * in the one viewport mounted by the shell.
 */
export const toastQueue = reactive<ToastRecord[]>([]);

let counter = 0;

export function dismissToast(id: string): void {
  const index = toastQueue.findIndex((toast) => toast.id === id);
  if (index !== -1) {
    toastQueue.splice(index, 1);
  }
}

export function clearToasts(): void {
  toastQueue.splice(0, toastQueue.length);
}

function pushToast(options: ToastOptions): string {
  counter += 1;
  const id = `ds-toast-${counter}`;
  toastQueue.push({
    id,
    tone: options.tone ?? "info",
    title: options.title,
    description: options.description,
    duration: options.duration ?? DEFAULT_DURATION,
  });
  return id;
}

export interface ToastApi {
  /** Enqueue a toast and return its id (use with {@link ToastApi.dismiss}). */
  show: (options: ToastOptions) => string;
  info: (options: Omit<ToastOptions, "tone">) => string;
  success: (options: Omit<ToastOptions, "tone">) => string;
  warning: (options: Omit<ToastOptions, "tone">) => string;
  error: (options: Omit<ToastOptions, "tone">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** Imperative toast API. Safe to call from any component or composable. */
export function useToast(): ToastApi {
  return {
    show: pushToast,
    info: (options) => pushToast({ ...options, tone: "info" }),
    success: (options) => pushToast({ ...options, tone: "success" }),
    warning: (options) => pushToast({ ...options, tone: "warning" }),
    error: (options) => pushToast({ ...options, tone: "error" }),
    dismiss: dismissToast,
    clear: clearToasts,
  };
}
