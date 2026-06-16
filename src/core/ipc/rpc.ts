import { expose as comlinkExpose, wrap as comlinkWrap, type Endpoint, type Remote } from "comlink";

export type { Endpoint, Remote };

export const RPC_ENVELOPE_VERSION = 1 as const;

export interface RpcSerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: unknown;
}

export type RpcEnvelope<T> =
  | { version: typeof RPC_ENVELOPE_VERSION; ok: true; value: T }
  | { version: typeof RPC_ENVELOPE_VERSION; ok: false; error: RpcSerializedError };

export type RpcMethod<Args extends readonly unknown[] = readonly unknown[], Result = unknown> = (
  ...args: Args
) => Result | Promise<Result>;

export class RpcRemoteError extends Error {
  readonly code?: string;

  override readonly cause?: unknown;

  constructor(serialized: RpcSerializedError) {
    super(serialized.message);
    this.name = serialized.name || "RpcRemoteError";
    this.code = serialized.code;
    this.cause = serialized.cause;
    this.stack = serialized.stack;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RpcEnvelopeVersionError extends Error {
  readonly code = "rpc-envelope-version-mismatch" as const;

  readonly expected: typeof RPC_ENVELOPE_VERSION;

  readonly actual: unknown;

  constructor(actual: unknown) {
    super(`Unsupported RPC envelope version: ${String(actual)}`);
    this.name = "RpcEnvelopeVersionError";
    this.expected = RPC_ENVELOPE_VERSION;
    this.actual = actual;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function toRpcError(error: unknown): RpcSerializedError {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown RPC error",
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
      ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
      ...("cause" in error ? { cause: error.cause } : {}),
    };
  }

  return {
    name: "NonErrorThrown",
    message: String(error),
  };
}

function fromRpcError(serialized: RpcSerializedError): RpcRemoteError {
  return new RpcRemoteError(serialized);
}

export function unwrapRpcEnvelope<T>(envelope: RpcEnvelope<T>): T {
  if (envelope.version !== RPC_ENVELOPE_VERSION) {
    throw new RpcEnvelopeVersionError(envelope.version);
  }

  if (!envelope.ok) {
    throw fromRpcError(envelope.error);
  }

  return envelope.value;
}

export function wrapRpcMethod<Args extends readonly unknown[], Result>(
  method: RpcMethod<Args, Result>,
): (...args: Args) => Promise<RpcEnvelope<Awaited<Result>>> {
  return async (...args: Args): Promise<RpcEnvelope<Awaited<Result>>> => {
    try {
      const value = await method(...args);

      return {
        version: RPC_ENVELOPE_VERSION,
        ok: true,
        value: value as Awaited<Result>,
      };
    } catch (error) {
      return {
        version: RPC_ENVELOPE_VERSION,
        ok: false,
        error: toRpcError(error),
      };
    }
  };
}

export class RpcRelay {
  wrap<T>(endpoint: Endpoint): Remote<T> {
    return comlinkWrap<T>(endpoint);
  }

  expose(api: Record<string, RpcMethod>, endpoint?: Endpoint): void {
    comlinkExpose(wrapRpcApi(api), endpoint);
  }
}

function wrapRpcApi(api: Record<string, RpcMethod>): Record<string, RpcMethod> {
  return Object.fromEntries(
    Object.entries(api).map(([key, method]) => [key, wrapRpcMethod(method)]),
  ) as Record<string, RpcMethod>;
}
