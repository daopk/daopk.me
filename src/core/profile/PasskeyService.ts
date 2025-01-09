import {
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  randomBytes,
  toUint8Array,
  utf8Decode,
} from "~/core/profile/encoding";
import type { ActiveProfileSession, PasskeyProfileRecord } from "~/types/profile";

type PrfInputs = {
  prf?: {
    eval?: {
      first: BufferSource;
      second?: BufferSource;
    };
    evalByCredential?: Record<
      string,
      {
        first: BufferSource;
        second?: BufferSource;
      }
    >;
  };
};

interface PrfResults {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
      second?: ArrayBuffer;
    };
  };
}

export type ProfileAuthErrorCode =
  | "UNAVAILABLE"
  | "CANCELLED"
  | "INVALID_CREDENTIAL"
  | "UNSUPPORTED_KEY"
  | "VERIFY_FAILED"
  | "PRF_UNAVAILABLE";

export class ProfileAuthError extends Error {
  readonly code: ProfileAuthErrorCode;

  constructor(code: ProfileAuthErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProfileAuthError";
    this.code = code;
  }
}

export interface CreatedProfilePasskey {
  profile: PasskeyProfileRecord;
  session: ActiveProfileSession;
}

export class PasskeyService {
  isAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator.credentials?.create === "function" &&
      typeof navigator.credentials?.get === "function" &&
      typeof PublicKeyCredential !== "undefined" &&
      typeof crypto?.subtle !== "undefined" &&
      window.isSecureContext === true
    );
  }

  async createProfilePasskey(input: {
    profileId: string;
    displayName: string;
  }): Promise<CreatedProfilePasskey> {
    this.assertAvailable();

    const challenge = randomBytes(32);
    const userHandle = randomBytes(32);
    const prfSalt = randomBytes(32);
    const options: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "WebOS",
      },
      user: {
        id: userHandle,
        name: input.displayName,
        displayName: input.displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 60_000,
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      attestation: "none",
      extensions: {
        credProps: true,
        prf: {
          eval: {
            first: prfSalt,
          },
        },
      } as AuthenticationExtensionsClientInputs & PrfInputs,
    };

    const credential = await navigator.credentials
      .create({ publicKey: options })
      .catch((error: unknown) => {
        throw this.toAuthError(error);
      });

    const publicKeyCredential = assertPublicKeyCredential(credential);
    const response = assertAttestationResponse(publicKeyCredential.response);
    const clientData = parseClientData(response.clientDataJSON);
    assertClientData(clientData, "webauthn.create", challenge);

    const publicKey = response.getPublicKey?.();
    const publicKeyAlg = response.getPublicKeyAlgorithm?.();
    if (!(publicKey instanceof ArrayBuffer) || typeof publicKeyAlg !== "number") {
      throw new ProfileAuthError(
        "UNSUPPORTED_KEY",
        "This browser cannot expose the new passkey public key.",
      );
    }

    const extensionResults = publicKeyCredential.getClientExtensionResults() as PrfResults;
    const prfOutput = extensionResults.prf?.enabled
      ? extensionResults.prf.results?.first
      : undefined;
    const encryptionKey =
      prfOutput instanceof ArrayBuffer ? await importAesKey(prfOutput) : undefined;
    const encryption = encryptionKey ? "prf-aes-gcm-v1" : "none";

    const transports = (response.getTransports?.() ?? []).filter(
      (transport): transport is AuthenticatorTransport => typeof transport === "string",
    );
    const displayName = input.displayName.trim();
    const profile: PasskeyProfileRecord = {
      id: input.profileId,
      displayName,
      createdAt: Date.now(),
      authMode: "passkey",
      credentialId: bytesToBase64Url(publicKeyCredential.rawId),
      userHandle: bytesToBase64Url(userHandle),
      publicKey: bytesToBase64Url(publicKey),
      publicKeyAlg,
      transports,
      encryption,
      ...(encryption === "prf-aes-gcm-v1" ? { prfSalt: bytesToBase64Url(prfSalt) } : {}),
    };

    return {
      profile,
      session: {
        profileId: profile.id,
        displayName: profile.displayName,
        authMode: profile.authMode,
        encryption: profile.encryption,
        encrypted: profile.encryption === "prf-aes-gcm-v1",
        ...(encryptionKey ? { encryptionKey } : {}),
      },
    };
  }

  async unlockProfile(profile: PasskeyProfileRecord): Promise<ActiveProfileSession> {
    this.assertAvailable();

    const challenge = randomBytes(32);
    const allowCredential: PublicKeyCredentialDescriptor = {
      type: "public-key",
      id: base64UrlToBytes(profile.credentialId),
      ...(profile.transports.length > 0 ? { transports: profile.transports } : {}),
    };
    const needsPrf = profile.encryption === "prf-aes-gcm-v1";
    const extensions =
      needsPrf && profile.prfSalt
        ? ({
            prf: {
              evalByCredential: {
                [profile.credentialId]: {
                  first: base64UrlToBytes(profile.prfSalt),
                },
              },
            },
          } satisfies PrfInputs)
        : undefined;
    const options: PublicKeyCredentialRequestOptions = {
      challenge,
      allowCredentials: [allowCredential],
      userVerification: "required",
      timeout: 60_000,
      ...(extensions ? { extensions: extensions as AuthenticationExtensionsClientInputs } : {}),
    };

    const credential = await navigator.credentials.get({ publicKey: options }).catch((error) => {
      throw this.toAuthError(error);
    });
    const publicKeyCredential = assertPublicKeyCredential(credential);
    const response = assertAssertionResponse(publicKeyCredential.response);

    if (bytesToBase64Url(publicKeyCredential.rawId) !== profile.credentialId) {
      throw new ProfileAuthError("INVALID_CREDENTIAL", "Passkey credential did not match profile.");
    }

    const clientData = parseClientData(response.clientDataJSON);
    assertClientData(clientData, "webauthn.get", challenge);
    assertUserVerified(response.authenticatorData);
    await verifyAssertionSignature(profile, response);

    const extensionResults = publicKeyCredential.getClientExtensionResults() as PrfResults;
    const prfOutput = extensionResults.prf?.results?.first;
    const encryptionKey =
      prfOutput instanceof ArrayBuffer ? await importAesKey(prfOutput) : undefined;

    if (needsPrf && !encryptionKey) {
      throw new ProfileAuthError(
        "PRF_UNAVAILABLE",
        "This passkey did not return the key needed to decrypt the profile.",
      );
    }

    return {
      profileId: profile.id,
      displayName: profile.displayName,
      authMode: profile.authMode,
      encryption: profile.encryption,
      encrypted: profile.encryption === "prf-aes-gcm-v1",
      ...(encryptionKey ? { encryptionKey } : {}),
    };
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new ProfileAuthError(
        "UNAVAILABLE",
        "Passkeys require a secure browser context with WebAuthn support.",
      );
    }
  }

  private toAuthError(error: unknown): ProfileAuthError {
    if (error instanceof ProfileAuthError) {
      return error;
    }
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return new ProfileAuthError("CANCELLED", "Passkey prompt was cancelled.", { cause: error });
    }
    return new ProfileAuthError("INVALID_CREDENTIAL", "Passkey operation failed.", {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function assertPublicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (
    credential === null ||
    credential.type !== "public-key" ||
    !("rawId" in credential) ||
    !(credential.rawId instanceof ArrayBuffer)
  ) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Expected a public key credential.");
  }
  return credential as PublicKeyCredential;
}

function assertAttestationResponse(
  response: AuthenticatorResponse,
): AuthenticatorAttestationResponse {
  if (!("attestationObject" in response) || !(response.clientDataJSON instanceof ArrayBuffer)) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Expected an attestation response.");
  }
  return response as AuthenticatorAttestationResponse;
}

function assertAssertionResponse(response: AuthenticatorResponse): AuthenticatorAssertionResponse {
  if (
    !("authenticatorData" in response) ||
    !("signature" in response) ||
    !(response.clientDataJSON instanceof ArrayBuffer)
  ) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Expected an assertion response.");
  }
  return response as AuthenticatorAssertionResponse;
}

function parseClientData(clientDataJSON: ArrayBuffer): Record<string, unknown> {
  try {
    return JSON.parse(utf8Decode(clientDataJSON)) as Record<string, unknown>;
  } catch (error: unknown) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Credential client data is invalid.", {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

function assertClientData(
  clientData: Record<string, unknown>,
  expectedType: "webauthn.create" | "webauthn.get",
  challenge: Uint8Array<ArrayBuffer>,
): void {
  if (clientData.type !== expectedType) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Credential client data type is invalid.");
  }
  if (clientData.challenge !== bytesToBase64Url(challenge)) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Credential challenge did not match.");
  }
  if (clientData.origin !== window.location.origin) {
    throw new ProfileAuthError("INVALID_CREDENTIAL", "Credential origin did not match.");
  }
}

function assertUserVerified(authenticatorData: ArrayBuffer): void {
  const bytes = new Uint8Array(authenticatorData);
  const flags = bytes[32] ?? 0;
  const userPresent = (flags & 0x01) === 0x01;
  const userVerified = (flags & 0x04) === 0x04;
  if (!userPresent || !userVerified) {
    throw new ProfileAuthError("VERIFY_FAILED", "Passkey user verification was not satisfied.");
  }
}

async function verifyAssertionSignature(
  profile: PasskeyProfileRecord,
  response: AuthenticatorAssertionResponse,
): Promise<void> {
  const clientDataHash = toUint8Array(
    await crypto.subtle.digest("SHA-256", response.clientDataJSON),
  );
  const signedData = concatBytes(toUint8Array(response.authenticatorData), clientDataHash);
  const publicKey = base64UrlToBytes(profile.publicKey);
  const signature = toUint8Array(response.signature);
  const ok = await verifySignature(profile.publicKeyAlg, publicKey, signature, signedData);
  if (!ok) {
    throw new ProfileAuthError("VERIFY_FAILED", "Passkey signature verification failed.");
  }
}

async function verifySignature(
  alg: number,
  publicKeySpki: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
  signedData: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  if (alg === -7) {
    const key = await crypto.subtle.importKey(
      "spki",
      publicKeySpki,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derEcdsaSignatureToRaw(signature, 32),
      signedData,
    );
  }

  if (alg === -257) {
    const key = await crypto.subtle.importKey(
      "spki",
      publicKeySpki,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
  }

  throw new ProfileAuthError("UNSUPPORTED_KEY", `Unsupported passkey algorithm: ${alg}`);
}

function derEcdsaSignatureToRaw(
  signature: Uint8Array<ArrayBuffer>,
  componentLength: number,
): Uint8Array<ArrayBuffer> {
  if (signature[0] !== 0x30) {
    return signature;
  }

  let offset = 2;
  if ((signature[1] ?? 0) > 0x80) {
    offset = 2 + ((signature[1] ?? 0) & 0x7f);
  }

  if (signature[offset] !== 0x02) {
    return signature;
  }
  const rLength = signature[offset + 1] ?? 0;
  const r = toUint8Array(signature.slice(offset + 2, offset + 2 + rLength));
  offset += 2 + rLength;

  if (signature[offset] !== 0x02) {
    return signature;
  }
  const sLength = signature[offset + 1] ?? 0;
  const s = toUint8Array(signature.slice(offset + 2, offset + 2 + sLength));

  return concatBytes(
    leftPad(stripLeadingZeroes(r), componentLength),
    leftPad(stripLeadingZeroes(s), componentLength),
  );
}

function stripLeadingZeroes(value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let offset = 0;
  while (offset < value.length - 1 && value[offset] === 0) {
    offset += 1;
  }
  return toUint8Array(value.slice(offset));
}

function leftPad(value: Uint8Array<ArrayBuffer>, length: number): Uint8Array<ArrayBuffer> {
  if (value.length >= length) {
    return toUint8Array(value.slice(value.length - length));
  }
  const out = new Uint8Array(new ArrayBuffer(length));
  out.set(value, length - value.length);
  return out;
}
