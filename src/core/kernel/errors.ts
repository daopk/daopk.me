export type AppLaunchErrorCode = "unknown-manifest";

export class AppLaunchError extends Error {
  readonly code: AppLaunchErrorCode;

  readonly manifestId: string;

  constructor(manifestId: string) {
    super(`Unknown app manifest: ${manifestId}`);
    this.name = "AppLaunchError";
    this.code = "unknown-manifest";
    this.manifestId = manifestId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CommandNotFoundError extends Error {
  readonly code = "command-not-found" as const;

  readonly commandId: string;

  constructor(commandId: string) {
    super(`Unknown command id: ${commandId}`);
    this.name = "CommandNotFoundError";
    this.commandId = commandId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CommandDuplicateError extends Error {
  readonly code = "command-duplicate" as const;

  readonly commandId: string;

  constructor(commandId: string) {
    super(`Command id already registered: ${commandId}`);
    this.name = "CommandDuplicateError";
    this.commandId = commandId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
