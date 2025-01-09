import { debugWarn } from "~/core/debug";
import { WALLPAPER_MAX_DIMENSION_PX } from "~/core/storage/constants";

export interface ProcessedWallpaper {
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

function rescaleTarget(
  sourceWidth: number,
  sourceHeight: number,
  maxDim: number,
): { width: number; height: number } {
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= maxDim) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const ratio = maxDim / longest;
  return {
    width: Math.round(sourceWidth * ratio),
    height: Math.round(sourceHeight * ratio),
  };
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof OffscreenCanvas) {
    try {
      return await canvas.convertToBlob({ type, quality });
    } catch (error: unknown) {
      debugWarn("[imageProcessor]", "OffscreenCanvas.convertToBlob failed", error);
      return null;
    }
  }

  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        type,
        quality,
      );
    } catch (error: unknown) {
      debugWarn("[imageProcessor]", "canvas.toBlob threw", error);
      resolve(null);
    }
  });
}

function createTargetCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function processWallpaperFile(file: File): Promise<ProcessedWallpaper> {
  const fallback: ProcessedWallpaper = {
    blob: file,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    width: 0,
    height: 0,
  };

  if (typeof createImageBitmap === "undefined") {
    return fallback;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error: unknown) {
    debugWarn("[imageProcessor]", "createImageBitmap failed; storing as-is", error);
    return fallback;
  }

  const target = rescaleTarget(bitmap.width, bitmap.height, WALLPAPER_MAX_DIMENSION_PX);
  const canvas = createTargetCanvas(target.width, target.height);

  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) {
    bitmap.close();
    return fallback;
  }

  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, "image/webp", 0.85);
  if (webp && webp.size < file.size) {
    return {
      blob: webp,
      mimeType: "image/webp",
      sizeBytes: webp.size,
      width: target.width,
      height: target.height,
    };
  }

  return {
    ...fallback,
    width: target.width,
    height: target.height,
  };
}
