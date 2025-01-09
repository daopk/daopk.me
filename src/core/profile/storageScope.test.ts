import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "fake-indexeddb/auto";

import { clearActiveProfileSession, setActiveProfileSession } from "~/core/profile/ProfileSession";
import {
  activeProfileKvNamespace,
  profileIdbName,
  profileKvNamespace,
} from "~/core/profile/storageScope";
import { KVStore } from "~/core/storage/KVStore";
import { IDBAdapter } from "~/core/vfs/adapters/IDBAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";

const decoder = new TextDecoder();

describe("profile storage scope", () => {
  beforeEach(() => {
    localStorage.clear();
    clearActiveProfileSession();
  });

  afterEach(() => {
    clearActiveProfileSession();
  });

  it("scopes KV namespaces by active profile", () => {
    setActiveProfileSession({
      profileId: "alpha",
      displayName: "Alpha",
      authMode: "passkey",
      encryption: "none",
      encrypted: false,
    });

    expect(activeProfileKvNamespace("settings")).toBe("profiles:alpha:settings");
    const alpha = new KVStore<{ theme: string }>(profileKvNamespace("alpha", "settings"));
    const beta = new KVStore<{ theme: string }>(profileKvNamespace("beta", "settings"));

    alpha.set("state", { theme: "dark" });
    beta.set("state", { theme: "light" });

    expect(alpha.get("state")).toEqual({ theme: "dark" });
    expect(beta.get("state")).toEqual({ theme: "light" });

    alpha.dispose();
    beta.dispose();
  });

  it("scopes VFS IndexedDB databases by profile", async () => {
    const alpha = new IDBAdapter({ dbName: profileIdbName("alpha", "vfs") });
    const beta = new IDBAdapter({ dbName: profileIdbName("beta", "vfs") });

    await alpha.write(normalizeVfsPath("/note.txt"), new TextEncoder().encode("alpha"));
    await beta.write(normalizeVfsPath("/note.txt"), new TextEncoder().encode("beta"));

    expect(decoder.decode((await alpha.read(normalizeVfsPath("/note.txt"))).bytes)).toBe("alpha");
    expect(decoder.decode((await beta.read(normalizeVfsPath("/note.txt"))).bytes)).toBe("beta");

    alpha.dispose();
    beta.dispose();
  });
});
