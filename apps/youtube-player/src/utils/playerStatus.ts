export type PlayerNotice = "api-error" | "player-error" | "autoplay-blocked";

export interface PlayerStatusMessageOptions {
  readonly canStartPlayback?: boolean;
}

export function playerStatusMessage(
  notice: PlayerNotice | null,
  errorCode: number | null,
  options: PlayerStatusMessageOptions = {},
): string {
  if (notice === "api-error") {
    return "YouTube player is unavailable.";
  }

  if (notice === "player-error") {
    return errorCode === null
      ? "This video could not be played."
      : `This video could not be played (${errorCode}).`;
  }

  if (notice === "autoplay-blocked") {
    return options.canStartPlayback === false
      ? "Playback was blocked."
      : "Playback was blocked. Press play to start.";
  }

  return "";
}
