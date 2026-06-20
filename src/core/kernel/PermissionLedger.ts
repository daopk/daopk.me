import { debugWarn } from "~/core/debug";
import type { AppPermission } from "~/types/app";
import type {
  PermissionDecision,
  PermissionLedgerEntry,
  PermissionRequest,
  PermissionRequestSource,
  PermissionResponseInput,
  PersistedPermissionDecision,
} from "~/types/permissions";

export interface PermissionLedgerStore {
  get(manifestId: string, permission: AppPermission): PersistedPermissionDecision | undefined;
  set(manifestId: string, permission: AppPermission, granted: boolean): void;
  remove(manifestId: string, permission: AppPermission): boolean;
  list(filter?: { manifestId?: string }): readonly PermissionLedgerEntry[];
}

export interface PermissionLedgerEmitter {
  emit(
    channel: "permission.requested",
    payload: {
      requestId: string;
      manifestId: string;
      permission: AppPermission;
      source: PermissionRequestSource;
    },
  ): void;
  emit(
    channel: "permission.granted" | "permission.denied",
    payload: { manifestId: string; permission: AppPermission; persisted: boolean },
  ): void;
  emit(
    channel: "permission.revoked",
    payload: { manifestId: string; permission: AppPermission },
  ): void;
}

export interface PermissionLedgerDeps {
  isSystemApp(manifestId: string): boolean;
  hasFirstPartyDefaultGrant?(manifestId: string, permission: AppPermission): boolean;
  store: PermissionLedgerStore;
  events: PermissionLedgerEmitter;
  mintRequestId?: () => string;
}

interface PendingEntry {
  resolve(decision: PermissionDecision): void;
  request: PermissionRequest;
}

function defaultMintRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `perm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class PermissionLedger {
  private readonly pending = new Map<string, PendingEntry>();

  private readonly mintRequestId: () => string;

  constructor(private readonly deps: PermissionLedgerDeps) {
    this.mintRequestId = deps.mintRequestId ?? defaultMintRequestId;
  }

  async request(
    manifestId: string,
    permission: AppPermission,
    options?: { source?: PermissionRequestSource },
  ): Promise<PermissionDecision> {
    const source = options?.source ?? "app";

    if (this.deps.isSystemApp(manifestId)) {
      this.deps.events.emit("permission.granted", {
        manifestId,
        permission,
        persisted: false,
      });
      return {
        granted: true,
        persisted: false,
        reason: "system-auto-grant",
      };
    }

    const cached = this.deps.store.get(manifestId, permission);
    if (cached !== undefined) {
      this.deps.events.emit(cached.granted ? "permission.granted" : "permission.denied", {
        manifestId,
        permission,
        persisted: true,
      });
      return {
        granted: cached.granted,
        persisted: true,
        reason: "cached",
      };
    }

    if (this.deps.hasFirstPartyDefaultGrant?.(manifestId, permission) === true) {
      this.deps.events.emit("permission.granted", {
        manifestId,
        permission,
        persisted: false,
      });
      return {
        granted: true,
        persisted: false,
        reason: "first-party-default-grant",
      };
    }

    const requestId = this.mintRequestId();
    const request: PermissionRequest = { requestId, manifestId, permission, source };

    const decision = new Promise<PermissionDecision>((resolve) => {
      this.pending.set(requestId, { resolve, request });
    });

    this.deps.events.emit("permission.requested", {
      requestId,
      manifestId,
      permission,
      source,
    });

    return decision;
  }

  respond(requestId: string, response: PermissionResponseInput): boolean {
    const entry = this.pending.get(requestId);
    if (entry === undefined) {
      debugWarn("permission.respond: unknown requestId", { requestId });
      return false;
    }
    this.pending.delete(requestId);

    const { manifestId, permission } = entry.request;

    if (response.persist) {
      this.deps.store.set(manifestId, permission, response.granted);
    }

    this.deps.events.emit(response.granted ? "permission.granted" : "permission.denied", {
      manifestId,
      permission,
      persisted: response.persist,
    });

    entry.resolve({
      granted: response.granted,
      persisted: response.persist,
      reason: response.persist ? "user-remembered" : "user",
    });

    return true;
  }

  /**
   * Drop a persisted decision. Surfaces in Settings → Privacy. Idempotent:
   * revoking a never-granted permission is a no-op (returns `false`).
   * Emits `permission.revoked` only when an actual decision was dropped
   * — Settings's reactive list pivots on this event so a no-op revoke
   * doesn't trigger a phantom re-render.
   */
  revoke(manifestId: string, permission: AppPermission): boolean {
    const removed = this.deps.store.remove(manifestId, permission);
    if (removed) {
      this.deps.events.emit("permission.revoked", { manifestId, permission });
    }
    return removed;
  }

  list(filter?: { manifestId?: string }): readonly PermissionLedgerEntry[] {
    return this.deps.store.list(filter);
  }

  /**
   * Resolves every in-flight permission request as a one-shot deny and clears
   * the pending map. The kernel drives this on teardown so a dispose mid-prompt
   * never leaves caller promises dangling.
   */
  cancelPendingRequests(): void {
    for (const entry of this.pending.values()) {
      entry.resolve({ granted: false, persisted: false, reason: "user" });
    }
    this.pending.clear();
  }

  get _pendingCountForTests(): number {
    return this.pending.size;
  }
}
