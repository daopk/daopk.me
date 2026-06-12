const PUBLIC_API_PATH_PREFIX = "/_api";

export function publicApiPathPrefix(): string {
  return PUBLIC_API_PATH_PREFIX;
}

export function publicApiOrigin(): string {
  return "";
}

export function publicApiUrl(pathname: string): string {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${PUBLIC_API_PATH_PREFIX}${normalizedPathname}`;
}
