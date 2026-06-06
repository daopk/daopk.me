import type { PermissionLedger } from "~/core/kernel/PermissionLedger";
import type { ProcessTable } from "~/core/kernel/ProcessTable";
import type { EventBus } from "~/core/kernel/EventBus";
import { profileIdbName } from "~/core/profile/storageScope";
import { publicApiUrl } from "~/core/publicApi";
import { TRASH_ROOT } from "~/core/trash/TrashManager";
import {
  IDBAdapter,
  MemoryAdapter,
  RemoteHTTPIndexAdapter,
  createMemoryVfsBootstrap,
  normalizeVfsPath,
} from "~/core/vfs";
import type { VfsStat } from "~/core/vfs";
import { VfsError } from "~/core/vfs/errors";
import type { ActiveProfileSession } from "~/types/profile";
import type { KernelVfsFacade } from "~/types/kernel";

export type KernelVfs = ReturnType<typeof createMemoryVfsBootstrap>;

const CLOUD_FILES_INDEX_URL = publicApiUrl("/public/files/index.json");

export function createKernelVfs(profile?: ActiveProfileSession): KernelVfs {
  const vfs = createMemoryVfsBootstrap();
  vfs.mount(
    "/cloud",
    new RemoteHTTPIndexAdapter({ id: "cloud-files", indexUrl: CLOUD_FILES_INDEX_URL }),
    { id: "cloud" },
  );
  vfs.mount(
    "/home",
    profile
      ? new IDBAdapter({
          id: "home-idb",
          dbName: profileIdbName(profile.profileId, "vfs"),
          encryptionKey: profile.encryptionKey,
        })
      : new MemoryAdapter({ id: "home-memory" }),
    { id: "home" },
  );
  vfs.mount(
    TRASH_ROOT,
    profile
      ? new IDBAdapter({
          id: "trash-idb",
          dbName: profileIdbName(profile.profileId, "trash"),
          encryptionKey: profile.encryptionKey,
        })
      : new MemoryAdapter({ id: "trash-memory" }),
    { id: "trash" },
  );
  return vfs;
}

export function createVfsAccessController({
  bus,
  permissions,
  processes,
}: {
  readonly bus: EventBus;
  readonly permissions: PermissionLedger;
  readonly processes: ProcessTable;
}) {
  function manifestIdForHandle(handleId: string): string {
    if (typeof handleId !== "string" || handleId.length === 0) {
      throw new VfsError("PERMISSION_DENIED", "kernel.vfs requires a handleId");
    }

    const process = processes.get(handleId);
    if (process === undefined) {
      throw new VfsError("PERMISSION_DENIED", `kernel.vfs unknown handleId: ${handleId}`);
    }

    return process.manifestId;
  }

  async function canUseVfs(
    handleId: string,
    permission: "vfs.read" | "vfs.write",
  ): Promise<boolean> {
    const decision = await permissions.request(manifestIdForHandle(handleId), permission, {
      source: "app",
    });

    return decision.granted;
  }

  function emitVfsChanged(stat: VfsStat, operation: "write" | "mkdir"): void {
    bus.emit("vfs.changed", { path: stat.path, operation, kind: stat.kind });
  }

  return { canUseVfs, emitVfsChanged };
}

export function createKernelVfsFacade({
  bus,
  canUseVfs,
  emitVfsChanged,
  getVfs,
}: {
  readonly bus: EventBus;
  readonly canUseVfs: (handleId: string, permission: "vfs.read" | "vfs.write") => Promise<boolean>;
  readonly emitVfsChanged: (stat: VfsStat, operation: "write" | "mkdir") => void;
  readonly getVfs: () => KernelVfs;
}): KernelVfsFacade {
  return {
    async stat(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.read"))) {
        return null;
      }

      return await getVfs().stat(normalized);
    },

    async list(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.read"))) {
        return null;
      }

      return await getVfs().list(normalized);
    },

    async read(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.read"))) {
        return null;
      }

      return (await getVfs().read(normalized)).bytes;
    },

    async readText(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.read"))) {
        return null;
      }

      return await getVfs().readText(normalized);
    },

    async write(path, bytes, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.write"))) {
        return null;
      }

      const stat = await getVfs().write(normalized, bytes, {
        ...(options.overwrite === undefined ? {} : { overwrite: options.overwrite }),
        ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
      });
      emitVfsChanged(stat, "write");

      return stat;
    },

    async writeText(path, text, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.write"))) {
        return null;
      }

      const stat = await getVfs().writeText(normalized, text, {
        ...(options.overwrite === undefined ? {} : { overwrite: options.overwrite }),
        ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
      });
      emitVfsChanged(stat, "write");

      return stat;
    },

    async mkdir(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.write"))) {
        return null;
      }

      const mkdirOptions =
        options.recursive === undefined ? undefined : { recursive: options.recursive };
      const stat = await getVfs().mkdir(normalized, mkdirOptions);
      emitVfsChanged(stat, "mkdir");

      return stat;
    },

    async remove(path, options) {
      const normalized = normalizeVfsPath(path);
      if (!(await canUseVfs(options.handleId, "vfs.write"))) {
        return false;
      }

      const removeOptions =
        options.recursive === undefined ? undefined : { recursive: options.recursive };
      await getVfs().remove(normalized, removeOptions);
      bus.emit("vfs.changed", { path: normalized, operation: "remove" });

      return true;
    },
  };
}
