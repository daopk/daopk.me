export interface NotificationComposer {
  enqueue(title: string, body: Record<string, unknown>): string;
}
