export function publicApiOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_API_ORIGIN;
  return configured === undefined || configured.length === 0 ? "" : configured.replace(/\/+$/, "");
}

export function publicApiUrl(pathname: string): string {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${publicApiOrigin()}${normalizedPathname}`;
}
