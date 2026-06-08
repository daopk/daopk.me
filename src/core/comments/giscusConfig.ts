export const GISCUS_CLIENT_URL = "https://giscus.app/client.js";

export interface GiscusConfig {
  readonly category: string;
  readonly categoryId: string;
  readonly clientUrl: string;
  readonly emitMetadata: "0" | "1";
  readonly inputPosition: "bottom" | "top";
  readonly lang: string;
  readonly loading: "eager" | "lazy";
  readonly reactionsEnabled: "0" | "1";
  readonly repo: string;
  readonly repoId: string;
  readonly strict: "0" | "1";
}

function envString(key: string): string | undefined {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export const DEFAULT_GISCUS_CONFIG = Object.freeze({
  category: envString("VITE_GISCUS_CATEGORY") ?? "Comments",
  categoryId: envString("VITE_GISCUS_CATEGORY_ID") ?? "DIC_kwDOSsA4Cs4C-vzm",
  clientUrl: envString("VITE_GISCUS_CLIENT_URL") ?? GISCUS_CLIENT_URL,
  emitMetadata: "0",
  inputPosition: "bottom",
  lang: envString("VITE_GISCUS_LANG") ?? "vi",
  loading: "lazy",
  reactionsEnabled: "1",
  repo: envString("VITE_GISCUS_REPO") ?? "daopk/daopk.me",
  repoId: envString("VITE_GISCUS_REPO_ID") ?? "R_kgDOSsA4Cg",
  strict: "1",
} satisfies GiscusConfig);

export function resolveGiscusConfig(overrides: Partial<GiscusConfig> = {}): GiscusConfig {
  return {
    ...DEFAULT_GISCUS_CONFIG,
    ...overrides,
  };
}

export function isGiscusConfigReady(config: GiscusConfig): boolean {
  return (
    config.repo.trim().length > 0 &&
    config.repoId.trim().length > 0 &&
    config.category.trim().length > 0 &&
    config.categoryId.trim().length > 0 &&
    config.clientUrl.trim().length > 0
  );
}
