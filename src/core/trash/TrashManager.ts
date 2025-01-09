import { VfsError } from "~/core/vfs/errors";
import { splitFilename } from "~/core/vfs/fileNames";
import type { VFS } from "~/core/vfs/VFS";
import type { VfsNodeKind, VfsStat } from "~/core/vfs/nodes";
import { basename, dirname, joinVfsPath, normalizeVfsPath, type VfsPath } from "~/core/vfs/path";
import type { TrashChangePayload, TrashItem, TrashItemKind } from "~/types/trash";

export const TRASH_ROOT = "/system/trash";

interface TrashMetadata {
  readonly id: string;
  readonly originalPath: string;
  readonly deletedAt: number;
  readonly kind: TrashItemKind;
  readonly size: number;
  readonly mimeType?: string;
}

export interface TrashManagerOptions {
  readonly getVfs: () => VFS;
  readonly canUseVfs: (handleId: string, permission: "vfs.read" | "vfs.write") => Promise<boolean>;
  readonly emitVfsChanged: (payload: {
    path: string;
    operation: "write" | "mkdir" | "remove";
    kind?: VfsNodeKind;
  }) => void;
  readonly emitTrashChanged: (payload: TrashChangePayload) => void;
}

const TRASH_ITEMS_ROOT = `${TRASH_ROOT}/items`;
const METADATA_FILE = "metadata.json";
const PAYLOAD_NAME = "payload";
const TRASH_METADATA_MIME_TYPE = "application/json;charset=utf-8";
const VALID_TRASH_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

export class TrashManager {
  private readonly getVfs: TrashManagerOptions["getVfs"];

  private readonly canUseVfs: TrashManagerOptions["canUseVfs"];

  private readonly emitVfsChanged: TrashManagerOptions["emitVfsChanged"];

  private readonly emitTrashChanged: TrashManagerOptions["emitTrashChanged"];

  constructor(options: TrashManagerOptions) {
    this.getVfs = options.getVfs;
    this.canUseVfs = options.canUseVfs;
    this.emitVfsChanged = options.emitVfsChanged;
    this.emitTrashChanged = options.emitTrashChanged;
  }

  async moveToTrash(path: string, options: { handleId: string }): Promise<TrashItem | null> {
    if (
      !(await this.canUseVfs(options.handleId, "vfs.read")) ||
      !(await this.canUseVfs(options.handleId, "vfs.write"))
    ) {
      return null;
    }

    const sourcePath = normalizeVfsPath(path);
    if (sourcePath === "/" || isTrashPath(sourcePath)) {
      throw new VfsError("CONFLICT", "This item cannot be moved to Trash.", { path: sourcePath });
    }

    const vfs = this.getVfs();
    const stat = await vfs.stat(sourcePath);
    assertSupportedKind(stat);

    const id = createTrashId();
    const itemRoot = itemRootPath(id);
    const payload = payloadPath(id);
    const metadata: TrashMetadata = {
      id,
      originalPath: sourcePath,
      deletedAt: Date.now(),
      kind: stat.kind,
      size: stat.size,
      ...(stat.mimeType === undefined ? {} : { mimeType: stat.mimeType }),
    };

    try {
      await this.ensureTrashItemsRoot();
      await vfs.mkdir(itemRoot, { recursive: true });
      await copyPath(vfs, sourcePath, payload, stat);
      await writeMetadata(vfs, metadata);

      try {
        await vfs.remove(sourcePath, { recursive: true });
      } catch (error) {
        await removeBestEffort(vfs, itemRoot);
        throw error;
      }
    } catch (error) {
      await removeBestEffort(vfs, itemRoot);
      throw error;
    }

    this.emitVfsChanged({ path: sourcePath, operation: "remove" });
    this.emitTrashChanged({
      operation: "move",
      id,
      path: sourcePath,
      originalPath: sourcePath,
    });

    return metadataToItem(metadata);
  }

  async list(options: { handleId: string }): Promise<readonly TrashItem[] | null> {
    if (!(await this.canUseVfs(options.handleId, "vfs.read"))) {
      return null;
    }

    const vfs = this.getVfs();
    const roots = await this.listTrashItemRoots(vfs);
    const items = await Promise.all(roots.map((entry) => this.readMetadata(entry.name)));

    return items
      .filter((item): item is TrashItem => item !== null)
      .sort((a, b) => b.deletedAt - a.deletedAt || a.name.localeCompare(b.name));
  }

  async restore(id: string, options: { handleId: string }): Promise<boolean> {
    if (
      !(await this.canUseVfs(options.handleId, "vfs.read")) ||
      !(await this.canUseVfs(options.handleId, "vfs.write"))
    ) {
      return false;
    }

    const normalizedId = normalizeTrashId(id);
    if (normalizedId === null) {
      return false;
    }

    const vfs = this.getVfs();
    const metadata = await this.readMetadata(normalizedId);
    if (metadata === null) {
      return false;
    }

    const destination = await nextRestorePath(vfs, metadata.originalPath);
    await ensureParentDirectory(vfs, destination);
    await copyPath(
      vfs,
      payloadPath(normalizedId),
      destination,
      await vfs.stat(payloadPath(normalizedId)),
    );
    await vfs.remove(itemRootPath(normalizedId), { recursive: true });

    this.emitVfsChanged({
      path: destination,
      operation: metadata.kind === "directory" ? "mkdir" : "write",
      kind: metadata.kind,
    });
    this.emitTrashChanged({
      operation: "restore",
      id: normalizedId,
      path: destination,
      originalPath: metadata.originalPath,
    });

    return true;
  }

  async remove(id: string, options: { handleId: string }): Promise<boolean> {
    if (!(await this.canUseVfs(options.handleId, "vfs.write"))) {
      return false;
    }

    const normalizedId = normalizeTrashId(id);
    if (normalizedId === null) {
      return false;
    }

    const vfs = this.getVfs();
    const metadata = await this.readMetadata(normalizedId);
    if (metadata === null) {
      return false;
    }

    await vfs.remove(itemRootPath(normalizedId), { recursive: true });
    this.emitTrashChanged({
      operation: "remove",
      id: normalizedId,
      originalPath: metadata.originalPath,
    });
    return true;
  }

  async empty(options: { handleId: string }): Promise<boolean> {
    if (!(await this.canUseVfs(options.handleId, "vfs.write"))) {
      return false;
    }

    const vfs = this.getVfs();
    const roots = await this.listTrashItemRoots(vfs);
    for (const root of roots) {
      await vfs.remove(root.path, { recursive: true });
    }

    this.emitTrashChanged({ operation: "empty" });
    return true;
  }

  private async ensureTrashItemsRoot(): Promise<void> {
    await this.getVfs().mkdir(TRASH_ITEMS_ROOT, { recursive: true });
  }

  private async listTrashItemRoots(vfs: VFS) {
    try {
      return (await vfs.list(TRASH_ITEMS_ROOT)).filter((entry) => entry.kind === "directory");
    } catch (error) {
      if (error instanceof VfsError && error.code === "NOT_FOUND") {
        return [];
      }

      throw error;
    }
  }

  private async readMetadata(id: string): Promise<TrashItem | null> {
    const normalizedId = normalizeTrashId(id);
    if (normalizedId === null) {
      return null;
    }

    try {
      const raw = await this.getVfs().readText(metadataPath(normalizedId));
      const parsed = JSON.parse(raw) as Partial<TrashMetadata>;
      if (!isTrashMetadata(parsed) || parsed.id !== normalizedId) {
        return null;
      }

      return metadataToItem(parsed);
    } catch (error) {
      if (error instanceof VfsError && error.code === "NOT_FOUND") {
        return null;
      }

      throw error;
    }
  }
}

async function copyPath(
  vfs: VFS,
  source: VfsPath,
  destination: VfsPath,
  stat: VfsStat,
): Promise<void> {
  assertSupportedKind(stat);

  if (stat.kind === "file") {
    const result = await vfs.read(source);
    await vfs.write(destination, result.bytes, {
      overwrite: false,
      ...(stat.mimeType === undefined ? {} : { mimeType: stat.mimeType }),
    });
    return;
  }

  await vfs.mkdir(destination, { recursive: true });
  const descendants = await vfs.walk(source);
  for (const entry of descendants) {
    assertSupportedKind(entry);
    const relative = relativePath(source, entry.path);
    const target = joinVfsPath(destination, relative);
    if (entry.kind === "directory") {
      await vfs.mkdir(target, { recursive: true });
      continue;
    }

    const result = await vfs.read(entry.path);
    await vfs.write(target, result.bytes, {
      overwrite: false,
      ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
    });
  }
}

async function writeMetadata(vfs: VFS, metadata: TrashMetadata): Promise<void> {
  await vfs.writeText(metadataPath(metadata.id), JSON.stringify(metadata), {
    overwrite: false,
    mimeType: TRASH_METADATA_MIME_TYPE,
  });
}

async function ensureParentDirectory(vfs: VFS, path: VfsPath): Promise<void> {
  const parent = dirname(path);
  if (parent !== path) {
    await vfs.mkdir(parent, { recursive: true });
  }
}

async function nextRestorePath(vfs: VFS, originalPath: string): Promise<VfsPath> {
  const normalized = normalizeVfsPath(originalPath);
  if (!(await exists(vfs, normalized))) {
    return normalized;
  }

  const parent = dirname(normalized);
  const { stem, extension } = splitFilename(basename(normalized));
  let candidate = joinVfsPath(parent, `${stem} restored${extension}`);
  let suffix = 2;

  while (await exists(vfs, candidate)) {
    candidate = joinVfsPath(parent, `${stem} restored ${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
}

async function exists(vfs: VFS, path: VfsPath): Promise<boolean> {
  try {
    await vfs.stat(path);
    return true;
  } catch (error) {
    if (error instanceof VfsError && error.code === "NOT_FOUND") {
      return false;
    }

    throw error;
  }
}

async function removeBestEffort(vfs: VFS, path: VfsPath): Promise<void> {
  try {
    await vfs.remove(path, { recursive: true });
  } catch {}
}

function assertSupportedKind<T extends { kind: VfsNodeKind; path: string }>(
  stat: T,
): asserts stat is T & { kind: TrashItemKind } {
  if (stat.kind !== "file" && stat.kind !== "directory") {
    throw new VfsError("CONFLICT", "Trash does not support links yet.", { path: stat.path });
  }
}

function relativePath(parent: VfsPath, child: VfsPath): string {
  const prefix = parent === "/" ? "/" : `${parent}/`;
  return child.slice(prefix.length);
}

function isTrashPath(path: VfsPath): boolean {
  return path === TRASH_ROOT || path.startsWith(`${TRASH_ROOT}/`);
}

function createTrashId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `trash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTrashId(id: string): string | null {
  return VALID_TRASH_ID_PATTERN.test(id) ? id : null;
}

function itemRootPath(id: string): VfsPath {
  return normalizeVfsPath(`${TRASH_ITEMS_ROOT}/${id}`);
}

function metadataPath(id: string): VfsPath {
  return joinVfsPath(itemRootPath(id), METADATA_FILE);
}

function payloadPath(id: string): VfsPath {
  return joinVfsPath(itemRootPath(id), PAYLOAD_NAME);
}

function metadataToItem(metadata: TrashMetadata): TrashItem {
  return {
    id: metadata.id,
    name: basename(normalizeVfsPath(metadata.originalPath)),
    originalPath: metadata.originalPath,
    deletedAt: metadata.deletedAt,
    kind: metadata.kind,
    size: metadata.size,
    ...(metadata.mimeType === undefined ? {} : { mimeType: metadata.mimeType }),
  };
}

function isTrashMetadata(candidate: Partial<TrashMetadata>): candidate is TrashMetadata {
  return (
    typeof candidate.id === "string" &&
    typeof candidate.originalPath === "string" &&
    typeof candidate.deletedAt === "number" &&
    (candidate.kind === "file" || candidate.kind === "directory") &&
    typeof candidate.size === "number" &&
    (candidate.mimeType === undefined || typeof candidate.mimeType === "string")
  );
}
