export interface AssetBinding {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface WorkerEnv {
  ASSETS: AssetBinding;
  /** Internal VPS API base URL used for bot SEO HTML and sitemap proxying. */
  INTERNAL_API_BASE_URL?: string;
  /** Shared bearer token used when the Worker calls the internal API. */
  INTERNAL_API_TOKEN?: string;
}
