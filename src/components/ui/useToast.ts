import { reactive } from "vue";

import type { ToastUpdateOptions, UseToastReturn as RopavToastApi } from "ropav/toast";

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

/**
 * Stable facade mirror for callers that inspect the queue directly. Ropav's
 * provider owns the rendered queue once ToastHost connects; calls made before
 * the host mounts are buffered here and flushed into that provider.
 */
export const toastQueue = reactive<ToastRecord[]>([]);

let counter = 0;
let provider: RopavToastApi | null = null;
let activeConnection: symbol | null = null;

function removeLocalToast(id: string): void {
  const index = toastQueue.findIndex((toast) => toast.id === id);
  if (index !== -1) toastQueue.splice(index, 1);
}

function providerOptions(toast: ToastRecord) {
  return {
    id: toast.id,
    type: toast.tone,
    title: toast.title,
    description: toast.description,
    duration: toast.duration,
    onClose: () => removeLocalToast(toast.id),
  } as const;
}

function sendToProvider(toast: ToastRecord): void {
  provider?.show(providerOptions(toast));
}

/** Internal bridge used by the single global ToastHost. */
export function connectToastProvider(nextProvider: RopavToastApi): () => void {
  const connection = Symbol("ds-toast-provider");
  activeConnection = connection;
  provider = nextProvider;
  for (const toast of toastQueue.slice()) sendToProvider(toast);

  return () => {
    if (activeConnection !== connection) return;
    activeConnection = null;
    provider = null;
  };
}

export function dismissToast(id: string): void {
  provider?.dismiss(id);
  removeLocalToast(id);
}

export function clearToasts(): void {
  provider?.dismissAll();
  toastQueue.splice(0, toastQueue.length);
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
  toastQueue.push(toast);
  if (toastQueue.length > DEFAULT_MAX) toastQueue.splice(0, toastQueue.length - DEFAULT_MAX);
  sendToProvider(toast);
  return toast.id;
}

function updateToast(id: string, options: Partial<ToastOptions>): void {
  const index = toastQueue.findIndex((toast) => toast.id === id);
  if (index === -1) return;
  const current = toastQueue[index]!;
  const next: ToastRecord = {
    id,
    tone: options.tone ?? current.tone,
    title: Object.hasOwn(options, "title") ? options.title : current.title,
    description: Object.hasOwn(options, "description") ? options.description : current.description,
    duration: options.duration ?? current.duration,
  };
  toastQueue.splice(index, 1, next);
  provider?.update(id, {
    type: next.tone,
    title: next.title,
    description: next.description,
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
