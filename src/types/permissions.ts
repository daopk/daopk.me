import type { AppPermission } from "~/types/app";

export type PermissionRequestSource = "app" | "settings" | "system";

export interface PermissionRequest {
  readonly requestId: string;
  readonly manifestId: string;
  readonly permission: AppPermission;
  readonly source: PermissionRequestSource;
}

export interface PermissionDecision {
  readonly granted: boolean;
  readonly persisted: boolean;
  readonly reason: "user" | "user-remembered" | "cached" | "system-auto-grant" | "revoked";
}

export interface PersistedPermissionDecision {
  readonly granted: boolean;
  readonly decidedAt: number;
}

export type PersistedPermissionState = Record<
  string,
  Partial<Record<AppPermission, PersistedPermissionDecision>>
>;

export class PermissionDeniedError extends Error {
  readonly manifestId: string;
  readonly permission: AppPermission;
  readonly persisted: boolean;

  constructor(manifestId: string, permission: AppPermission, persisted: boolean) {
    super(`Permission '${permission}' denied for app '${manifestId}'.`);
    this.name = "PermissionDeniedError";
    this.manifestId = manifestId;
    this.permission = permission;
    this.persisted = persisted;
  }
}

export interface PermissionResponseInput {
  readonly granted: boolean;
  readonly persist: boolean;
}

export interface PermissionLedgerEntry {
  readonly manifestId: string;
  readonly permission: AppPermission;
  readonly granted: boolean;
  readonly decidedAt: number;
}
