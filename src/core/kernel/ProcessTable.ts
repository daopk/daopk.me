import type { AppHandle } from "~/types/app";

import { createPlaceholderHandle } from "~/core/kernel/AppRegistry";

interface ProcessRecord {
  state: "running" | "suspended";
  manifestId: string;
  args?: Readonly<Record<string, unknown>>;
}

export class ProcessTable {
  private readonly processes = new Map<string, ProcessRecord>();
  private readonly singletonByManifestId = new Map<string, AppHandle>();

  spawn(manifestId: string, args?: Readonly<Record<string, unknown>>): AppHandle {
    const handle = createPlaceholderHandle({ manifestId });
    const record: ProcessRecord = { manifestId, state: "running" };
    if (args !== undefined) {
      record.args = Object.freeze({ ...args });
    }
    this.processes.set(handle.id, record);
    return handle;
  }

  get(handleId: string): ProcessRecord | undefined {
    return this.processes.get(handleId);
  }

  suspend(handleId: string): boolean {
    const record = this.processes.get(handleId);
    if (!record || record.state === "suspended") {
      return false;
    }

    record.state = "suspended";
    return true;
  }

  resume(handleId: string): boolean {
    const record = this.processes.get(handleId);
    if (!record || record.state === "running") {
      return false;
    }

    record.state = "running";
    return true;
  }

  kill(handleId: string): ProcessRecord | undefined {
    const record = this.processes.get(handleId);
    if (!record) {
      return undefined;
    }

    this.processes.delete(handleId);

    const bridged = this.singletonByManifestId.get(record.manifestId);
    if (bridged?.id === handleId) {
      this.singletonByManifestId.delete(record.manifestId);
    }

    return record;
  }

  registerSingletonBridge(manifestId: string, handle: AppHandle): void {
    this.singletonByManifestId.set(manifestId, handle);
  }

  unregisterSingletonBridge(manifestId: string): void {
    this.singletonByManifestId.delete(manifestId);
  }

  getSingletonFromManifest(manifestId: string): AppHandle | undefined {
    const handle = this.singletonByManifestId.get(manifestId);
    const record = handle ? this.processes.get(handle.id) : undefined;
    if (!handle || !record) {
      this.singletonByManifestId.delete(manifestId);
      return undefined;
    }

    return handle;
  }

  list(): IterableIterator<[string, ProcessRecord]> {
    return this.processes.entries();
  }

  reset(): void {
    this.processes.clear();
    this.singletonByManifestId.clear();
  }
}
