export interface Serializer<T> {
  stringify(value: T): string;
  parse(raw: string): T;
}

export type MigrationFn<T> = (stored: unknown, fromVersion: number, toVersion: number) => T;

export class StorageError extends Error {
  readonly code?: string;

  constructor(message: string, options?: ErrorOptions & { code?: string }) {
    const { code, ...rest } = options ?? {};
    super(message, rest);
    this.name = "StorageError";

    if (code !== undefined) {
      this.code = code;
    }
  }
}

export interface StorageWriteOptions {
  silent?: boolean;
}
