import type { HlsPlaybackAdMarker } from "../hls/hlsAdSkip";
import { clampNumber } from "./number";

export function moviePlayerAdMarkerTrackBackground(
  markers: readonly HlsPlaybackAdMarker[],
  totalDurationSeconds: number,
): string {
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    return "none";
  }

  const layers = markers
    .map((marker) => adMarkerGradientLayer(marker, totalDurationSeconds))
    .filter((layer) => layer.length > 0);
  return layers.length === 0 ? "none" : layers.join(", ");
}

function adMarkerGradientLayer(marker: HlsPlaybackAdMarker, totalDurationSeconds: number): string {
  const startPercent = clampNumber((marker.startSeconds / totalDurationSeconds) * 100, 0, 100);
  const rawDurationPercent = (marker.durationSeconds / totalDurationSeconds) * 100;
  const markerWidthPercent =
    marker.kind === "skipped-replacement" ? 0.42 : Math.max(rawDurationPercent, 0.42);
  const endPercent = clampNumber(startPercent + markerWidthPercent, startPercent, 100);
  if (endPercent <= startPercent) {
    return "";
  }

  const color =
    marker.kind === "skipped-replacement" ? "rgb(255 96 96 / 90%)" : "rgb(255 190 84 / 76%)";
  return `linear-gradient(to right, transparent 0%, transparent ${startPercent.toFixed(
    3,
  )}%, ${color} ${startPercent.toFixed(3)}%, ${color} ${endPercent.toFixed(
    3,
  )}%, transparent ${endPercent.toFixed(3)}%, transparent 100%)`;
}
