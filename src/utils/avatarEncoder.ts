export interface AvatarCropTransform {
  zoom: number; // 1.0 to 3.0
  offsetX: number; // Normalized pixel offset in viewport space
  offsetY: number;
  viewportSize: number; // e.g. 280
}

export interface EncodedAvatarResult {
  blob: Blob;
  mimeType: 'image/avif' | 'image/webp' | 'image/jpeg';
  formatLabel: 'AVIF' | 'WebP' | 'JPEG';
  width: number;
  height: number;
  byteSize: number;
  fallbackUsed: boolean;
}

export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_TARGET_MAX_BYTES = 64 * 1024; // Aim <= 64 KB (well under 128 KB server cap)
export const MAX_RAW_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB client source file limit

/**
 * Computes base cover dimensions of the source image inside the square crop viewport
 * and clamps drag offsets so the crop box never shows empty background edges.
 */
export function clampAvatarCropOffsets(
  naturalWidth: number,
  naturalHeight: number,
  viewportSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number
): { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number } {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const baseScale = Math.max(viewportSize / safeW, viewportSize / safeH);
  const drawWidth = safeW * baseScale * zoom;
  const drawHeight = safeH * baseScale * zoom;

  const maxOffsetX = Math.max(0, (drawWidth - viewportSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - viewportSize) / 2);

  return {
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, offsetY)),
    drawWidth,
    drawHeight,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Renders the 1:1 cropped region into a 256x256 canvas and compresses to AVIF (`image/avif`)
 * with adaptive quality. Automatically falls back to WebP (`image/webp`) only if the browser
 * does not natively support AVIF canvas encoding (preventing silent PNG bloat).
 */
export async function encodeCroppedAvatarToAvif(
  image: HTMLImageElement,
  crop: AvatarCropTransform,
  outputSize = AVATAR_OUTPUT_SIZE
): Promise<EncodedAvatarResult> {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const { offsetX, offsetY, drawWidth, drawHeight } = clampAvatarCropOffsets(
    naturalWidth,
    naturalHeight,
    crop.viewportSize,
    crop.zoom,
    crop.offsetX,
    crop.offsetY
  );

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas context unavailable.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const ratio = outputSize / crop.viewportSize;
  const scaledDrawW = drawWidth * ratio;
  const scaledDrawH = drawHeight * ratio;
  const dx = (outputSize - scaledDrawW) / 2 + offsetX * ratio;
  const dy = (outputSize - scaledDrawH) / 2 + offsetY * ratio;

  ctx.clearRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, dx, dy, scaledDrawW, scaledDrawH);

  // Attempt native AVIF encoding first with adaptive quality steps
  const avifQualities = [0.68, 0.56, 0.45];
  for (const q of avifQualities) {
    const blob = await canvasToBlob(canvas, 'image/avif', q);
    if (blob && blob.type === 'image/avif') {
      if (blob.size <= AVATAR_TARGET_MAX_BYTES || q === avifQualities[avifQualities.length - 1]) {
        return {
          blob,
          mimeType: 'image/avif',
          formatLabel: 'AVIF',
          width: outputSize,
          height: outputSize,
          byteSize: blob.size,
          fallbackUsed: false,
        };
      }
    } else {
      // Browser does not natively support canvas AVIF encoding; break to WebP fallback
      break;
    }
  }

  // Automatic WebP fallback for browsers without native AVIF canvas encoder (e.g. older Safari)
  const webpQualities = [0.8, 0.68, 0.55];
  for (const q of webpQualities) {
    const blob = await canvasToBlob(canvas, 'image/webp', q);
    if (blob && blob.type === 'image/webp') {
      if (blob.size <= AVATAR_TARGET_MAX_BYTES || q === webpQualities[webpQualities.length - 1]) {
        return {
          blob,
          mimeType: 'image/webp',
          formatLabel: 'WebP',
          width: outputSize,
          height: outputSize,
          byteSize: blob.size,
          fallbackUsed: true,
        };
      }
    }
  }

  // Universal JPEG fallback for older iOS Safari, Firefox ESR, and privacy-hardened WebViews
  const jpegQualities = [0.86, 0.74, 0.62];
  for (const q of jpegQualities) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', q);
    if (blob && blob.type === 'image/jpeg') {
      if (blob.size <= AVATAR_TARGET_MAX_BYTES * 2 || q === jpegQualities[jpegQualities.length - 1]) {
        return {
          blob,
          mimeType: 'image/jpeg',
          formatLabel: 'JPEG',
          width: outputSize,
          height: outputSize,
          byteSize: blob.size,
          fallbackUsed: true,
        };
      }
    }
  }

  throw new Error('Browser tidak mendukung kompresi gambar (AVIF, WebP, maupun JPEG).');
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
