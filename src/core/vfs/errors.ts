export type VfsErrorCode =
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "NOT_DIRECTORY"
  | "IS_DIRECTORY"
  | "READ_ONLY"
  | "PERMISSION_DENIED"
  | "MOUNT_NOT_FOUND"
  | "ADAPTER_UNAVAILABLE"
  | "CONFLICT";

export class VfsError extends Error {
  readonly code: VfsErrorCode;

  readonly path?: string;

  constructor(code: VfsErrorCode, message: string, options?: ErrorOptions & { path?: string }) {
    const { path, ...rest } = options ?? {};
    super(message, rest);
    this.name = "VfsError";
    this.code = code;
    this.path = path;
  }
}
