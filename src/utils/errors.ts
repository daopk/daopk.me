export function toErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback ?? String(error);
}

export function toActionErrorMessage(error: unknown, action: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Unable to ${action}: ${error.message}`;
  }

  return `Unable to ${action}.`;
}
