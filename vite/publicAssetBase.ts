export type ViteCommand = "build" | "serve";

export function resolvePublicAssetBase(
  command: ViteCommand,
  env: Partial<Record<string, string | undefined>> = process.env,
): string {
  if (command !== "build") {
    return "/";
  }

  return normalizeBase(env.DAOPK_PUBLIC_ASSET_BASE_URL);
}

export function resolveBuildTime(
  env: Partial<Record<string, string | undefined>> = process.env,
  now: () => Date = () => new Date(),
): string {
  const value = env.DAOPK_BUILD_TIME?.trim();
  return value && value.length > 0 ? value : now().toISOString();
}

export function assetUrlForBase(fileName: string, base: string): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedBase)) {
    return new URL(fileName, normalizedBase).toString();
  }
  return `${normalizedBase}${fileName}`;
}

function normalizeBase(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
