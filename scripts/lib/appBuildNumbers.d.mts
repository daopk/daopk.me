export interface AppBuildCatalog {
  readonly apps?: readonly {
    readonly id?: unknown;
    readonly build?: unknown;
  }[];
}

export function coerceBuild(value: unknown): number | null;
export function currentAppBuild(catalog: unknown, appId: string): number;
export function nextAppBuild(catalog: unknown, appId: string): number;
