import type { VfsNodeKind } from "~/core/vfs";

export type TrashItemKind = Extract<VfsNodeKind, "file" | "directory">;

export interface TrashItem {
  readonly id: string;
  readonly name: string;
  readonly originalPath: string;
  readonly deletedAt: number;
  readonly kind: TrashItemKind;
  readonly size: number;
  readonly mimeType?: string;
}

export interface TrashAccessOptions {
  readonly handleId: string;
}

export type TrashChangeOperation = "move" | "restore" | "remove" | "empty";

export interface TrashChangePayload {
  readonly operation: TrashChangeOperation;
  readonly id?: string;
  readonly path?: string;
  readonly originalPath?: string;
}

export interface KernelTrashFacade {
  moveToTrash(path: string, options: TrashAccessOptions): Promise<TrashItem | null>;
  list(options: TrashAccessOptions): Promise<readonly TrashItem[] | null>;
  restore(id: string, options: TrashAccessOptions): Promise<boolean>;
  remove(id: string, options: TrashAccessOptions): Promise<boolean>;
  empty(options: TrashAccessOptions): Promise<boolean>;
}
