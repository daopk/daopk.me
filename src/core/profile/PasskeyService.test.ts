import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bytesToBase64Url, concatBytes, toUint8Array } from "~/core/profile/encoding";
import { PasskeyService } from "~/core/profile/PasskeyService";
import type { ProfileRecord } from "~/types/profile";

const encoder = new TextEncoder();
const credentialBytes = new Uint8Array(new ArrayBuffer(4));
credentialBytes.set([1, 2, 3, 4]);
const credentialId = credentialBytes.buffer;
const prfSeed = new Uint8Array(new ArrayBuffer(32));
prfSeed.fill(9);
const prfBytes = prfSeed.buffer;

function jsonBuffer(value: unknown): ArrayBuffer {
  return encoder.encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

function clientData(type: string, challenge: BufferSource): ArrayBuffer {
  return jsonBuffer({
    type,
    challenge: bytesToBase64Url(challenge),
    origin: window.location.origin,
  });
}

function authenticatorData(): ArrayBuffer {
  const bytes = new Uint8Array(new ArrayBuffer(37));
  bytes[32] = 0x05;
  return bytes.buffer;
}

async function signAssertion(
  privateKey: CryptoKey,
  authData: ArrayBuffer,
  clientDataJSON: ArrayBuffer,
): Promise<ArrayBuffer> {
  const hash = toUint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
  const signedData = concatBytes(toUint8Array(authData), hash);
  return await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signedData);
}

describe("PasskeyService", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    vi.stubGlobal("PublicKeyCredential", class PublicKeyCredential {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a profile record from a new passkey", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);

    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: vi.fn(
          async ({ publicKey: options }: { publicKey: PublicKeyCredentialCreationOptions }) => ({
            type: "public-key",
            rawId: credentialId,
            response: {
              attestationObject: new ArrayBuffer(0),
              clientDataJSON: clientData("webauthn.create", options.challenge),
              getPublicKey: () => publicKey,
              getPublicKeyAlgorithm: () => -7,
              getTransports: () => ["internal"],
            },
            getClientExtensionResults: () => ({
              prf: { enabled: true, results: { first: prfBytes } },
            }),
          }),
        ),
        get: vi.fn(),
      },
    });

    const service = new PasskeyService();
    const created = await service.createProfilePasskey({
      profileId: "alpha",
      displayName: "Alpha",
    });

    expect(created.profile).toMatchObject({
      id: "alpha",
      displayName: "Alpha",
      authMode: "passkey",
      credentialId: bytesToBase64Url(credentialId),
      publicKeyAlg: -7,
      encryption: "prf-aes-gcm-v1",
      transports: ["internal"],
    });
    expect(created.session.encrypted).toBe(true);
    expect(created.session.encryptionKey).toBeTruthy();
  });

  it("verifies a passkey assertion before unlocking", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const profile: ProfileRecord = {
      id: "alpha",
      displayName: "Alpha",
      createdAt: 1,
      authMode: "passkey",
      credentialId: bytesToBase64Url(credentialId),
      userHandle: "user",
      publicKey: bytesToBase64Url(publicKey),
      publicKeyAlg: -7,
      transports: ["internal"],
      encryption: "prf-aes-gcm-v1",
      prfSalt: bytesToBase64Url(new Uint8Array(32).fill(1)),
    };

    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: vi.fn(),
        get: vi.fn(
          async ({ publicKey: options }: { publicKey: PublicKeyCredentialRequestOptions }) => {
            const authData = authenticatorData();
            const clientDataJSON = clientData("webauthn.get", options.challenge);
            return {
              type: "public-key",
              rawId: credentialId,
              response: {
                authenticatorData: authData,
                clientDataJSON,
                signature: await signAssertion(keyPair.privateKey, authData, clientDataJSON),
              },
              getClientExtensionResults: () => ({
                prf: { results: { first: prfBytes } },
              }),
            };
          },
        ),
      },
    });

    const service = new PasskeyService();
    const session = await service.unlockProfile(profile);

    expect(session).toMatchObject({
      profileId: "alpha",
      displayName: "Alpha",
      authMode: "passkey",
      encryption: "prf-aes-gcm-v1",
      encrypted: true,
    });
    expect(session.encryptionKey).toBeTruthy();
  });
});
