import { describe, expect, it } from "vitest";

import {
  RPC_ENVELOPE_VERSION,
  RpcEnvelopeVersionError,
  RpcRelay,
  RpcRemoteError,
  toRpcError,
  unwrapRpcEnvelope,
  wrapRpcMethod,
  type RpcEnvelope,
} from "~/core/ipc/rpc";
import { createDetachedPortPair } from "~/core/ipc/channel";

class CodedError extends Error {
  readonly code = "coded" as const;

  constructor() {
    super("coded failure");
    this.name = "CodedError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

describe("RPC helpers", () => {
  it("serializes native errors with name, message, stack, and code", () => {
    const serialized = toRpcError(new CodedError());

    expect(serialized.name).toBe("CodedError");
    expect(serialized.message).toBe("coded failure");
    expect(serialized.code).toBe("coded");
    expect(serialized.stack).toEqual(expect.any(String));
  });

  it("serializes non-Error thrown values safely", () => {
    expect(toRpcError("boom")).toEqual({
      name: "NonErrorThrown",
      message: "boom",
    });
  });

  it("wrapRpcMethod returns a versioned success envelope", async () => {
    const method = wrapRpcMethod((name: string) => `hello ${name}`);

    await expect(method("dao")).resolves.toEqual({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
      value: "hello dao",
    });
  });

  it("wrapRpcMethod catches throws as versioned error envelopes", async () => {
    const method = wrapRpcMethod(() => {
      throw new CodedError();
    });

    await expect(method()).resolves.toMatchObject({
      version: RPC_ENVELOPE_VERSION,
      ok: false,
      error: {
        name: "CodedError",
        message: "coded failure",
        code: "coded",
      },
    });
  });

  it("unwrapRpcEnvelope reconstructs remote errors", () => {
    expect(() =>
      unwrapRpcEnvelope({
        version: RPC_ENVELOPE_VERSION,
        ok: false,
        error: {
          name: "RemoteFailure",
          message: "remote broke",
          code: "remote-code",
        },
      }),
    ).toThrow(RpcRemoteError);
  });

  it("unwrapRpcEnvelope rejects mismatched envelope versions before reading payloads", () => {
    const envelope = {
      version: 999,
      get ok(): true {
        throw new Error("payload touched");
      },
      get value(): string {
        throw new Error("payload touched");
      },
    } as unknown as RpcEnvelope<string>;

    let thrown: unknown;

    try {
      unwrapRpcEnvelope(envelope);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RpcEnvelopeVersionError);
    expect(thrown).toMatchObject({
      actual: 999,
      code: "rpc-envelope-version-mismatch",
      expected: RPC_ENVELOPE_VERSION,
      message: "Unsupported RPC envelope version: 999",
    });
  });

  it("unwrapRpcEnvelope rejects mismatched error envelope versions before reading errors", () => {
    const envelope = {
      version: 999,
      get ok(): false {
        throw new Error("error touched");
      },
      get error(): never {
        throw new Error("error touched");
      },
    } as unknown as RpcEnvelope<string>;

    let thrown: unknown;

    try {
      unwrapRpcEnvelope(envelope);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RpcEnvelopeVersionError);
    expect(thrown).toMatchObject({
      actual: 999,
      code: "rpc-envelope-version-mismatch",
      expected: RPC_ENVELOPE_VERSION,
    });
  });

  it("RpcRelay exposes methods through versioned envelopes", async () => {
    const pair = createDetachedPortPair();

    if (pair.length === 0) {
      expect(pair).toEqual([]);

      return;
    }

    const relay = new RpcRelay();
    relay.expose(
      {
        greet(name: unknown) {
          return `hello ${String(name)}`;
        },
      },
      pair[0],
    );

    const remote = relay.wrap<{
      greet(name: string): Promise<RpcEnvelope<string>>;
    }>(pair[1]);

    await expect(remote.greet("dao")).resolves.toEqual({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
      value: "hello dao",
    });

    pair[0].close?.();
    pair[1].close?.();
  });
});
