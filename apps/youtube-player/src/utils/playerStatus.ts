export type PlayerNotice = "api-error" | "player-error" | "autoplay-blocked";

export function playerStatusMessage(notice: PlayerNotice | null, errorCode: number | null): string {
  if (notice === "api-error") {
    return "YouTube player is unavailable.";
  }

  if (notice === "player-error") {
    return errorCode === null
      ? "This video could not be played."
      : `This video could not be played (${errorCode}).`;
  }

  if (notice === "autoplay-blocked") {
    return "Playback was blocked. Press play to start.";
  }

  return "";
}
