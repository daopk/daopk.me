import { VfsError } from "~/core/vfs/errors";

export type VfsPath = string & { readonly __brand: "VfsPath" };

function hasControlChars(path: string): boolean {
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

export function normalizeVfsPath(path: string): VfsPath {
  if (path.length === 0) {
    throw new VfsError("INVALID_PATH", "VFS path must not be empty", { path });
  }
  if (!path.startsWith("/")) {
    throw new VfsError("INVALID_PATH", "VFS path must be absolute", { path });
  }
  if (hasControlChars(path)) {
    throw new VfsError("INVALID_PATH", "VFS path contains control characters", { path });
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return (segments.length === 0 ? "/" : `/${segments.join("/")}`) as VfsPath;
}

export function joinVfsPath(...parts: readonly string[]): VfsPath {
  if (parts.length === 0) {
    return normalizeVfsPath("/");
  }

  const [head, ...tail] = parts;
  const raw = [head || "/", ...tail].join("/");
  return normalizeVfsPath(raw.startsWith("/") ? raw : `/${raw}`);
}

export function dirname(path: VfsPath): VfsPath {
  if (path === "/") {
    return path;
  }

  const index = path.lastIndexOf("/");
  return normalizeVfsPath(index <= 0 ? "/" : path.slice(0, index));
}

export function basename(path: VfsPath): string {
  if (path === "/") {
    return "";
  }

  return path.slice(path.lastIndexOf("/") + 1);
}

export function assertAbsoluteVfsPath(path: string): asserts path is VfsPath {
  void normalizeVfsPath(path);
}

export function isDirectChild(parent: VfsPath, candidate: VfsPath): boolean {
  if (parent === candidate) {
    return false;
  }

  const prefix = parent === "/" ? "/" : `${parent}/`;
  if (!candidate.startsWith(prefix)) {
    return false;
  }

  const rest = candidate.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

export function compareVfsNames(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

export function isDescendant(parent: VfsPath, candidate: VfsPath): boolean {
  if (parent === candidate) {
    return false;
  }

  const prefix = parent === "/" ? "/" : `${parent}/`;
  return candidate.startsWith(prefix);
}

export function isDescendantOrSelf(parent: VfsPath, candidate: VfsPath): boolean {
  return parent === "/" || candidate === parent || candidate.startsWith(`${parent}/`);
}

export function depthBetween(parent: VfsPath, candidate: VfsPath): number {
  if (parent === candidate) {
    return 0;
  }

  const prefix = parent === "/" ? "/" : `${parent}/`;
  const rest = candidate.slice(prefix.length);
  return rest.split("/").filter(Boolean).length;
}

export function withinDepth(parent: VfsPath, candidate: VfsPath, maxDepth?: number): boolean {
  if (maxDepth === undefined) {
    return true;
  }

  return depthBetween(parent, candidate) <= maxDepth;
}
