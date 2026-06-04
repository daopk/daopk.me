export const YOUTUBE_PLAYER_STATES = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const;

export type YouTubePlayerState = (typeof YOUTUBE_PLAYER_STATES)[keyof typeof YOUTUBE_PLAYER_STATES];

export interface YouTubePlayerEvent {
  readonly target: YouTubePlayer;
}

export interface YouTubePlayerStateChangeEvent extends YouTubePlayerEvent {
  readonly data: YouTubePlayerState;
}

export interface YouTubePlayerErrorEvent extends YouTubePlayerEvent {
  readonly data: number;
}

export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): {
    readonly author?: string;
    readonly title?: string;
    readonly video_id?: string;
  };
  getVideoLoadedFraction(): number;
  getVolume(): number;
  isMuted(): boolean;
  mute(): void;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  unMute(): void;
}

export interface YouTubePlayerOptions {
  readonly height?: string | number;
  readonly width?: string | number;
  readonly videoId: string;
  readonly playerVars?: Readonly<Record<string, string | number>>;
  readonly events?: {
    readonly onAutoplayBlocked?: (event: YouTubePlayerEvent) => void;
    readonly onError?: (event: YouTubePlayerErrorEvent) => void;
    readonly onReady?: (event: YouTubePlayerEvent) => void;
    readonly onStateChange?: (event: YouTubePlayerStateChangeEvent) => void;
  };
}

export interface YouTubeIframeApi {
  readonly Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";

let apiPromise: Promise<YouTubeIframeApi> | null = null;

function hasYouTubeApi(value: unknown): value is YouTubeIframeApi {
  return (
    typeof value === "object" &&
    value !== null &&
    "Player" in value &&
    typeof (value as { Player?: unknown }).Player === "function"
  );
}

function findExistingScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_IFRAME_API_URL}"]`);
}

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API requires a browser window."));
  }

  if (hasYouTubeApi(window.YT)) {
    return Promise.resolve(window.YT);
  }

  apiPromise ??= new Promise<YouTubeIframeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = (): void => {
      previousReady?.();

      if (hasYouTubeApi(window.YT)) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube IFrame API loaded without YT.Player."));
      }
    };

    const script = findExistingScript() ?? document.createElement("script");
    script.src = YOUTUBE_IFRAME_API_URL;
    script.async = true;
    script.onerror = (): void => {
      reject(new Error("Could not load the YouTube IFrame API."));
    };

    if (!script.parentNode) {
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
