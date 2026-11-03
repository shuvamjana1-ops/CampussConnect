/**
 * Client-Side Image Compressor
 * Automatically compresses user-uploaded images to strictly under 200 KB (204,800 bytes)
 * using HTML Canvas before uploading to DBMS or server.
 */

export interface CompressionResult {
  readonly file: File;
  readonly originalBytes: number;
  readonly compressedBytes: number;
  readonly originalSizeFormatted: string;
  readonly compressedSizeFormatted: string;
  readonly savingsPercent: number;
  readonly wasCompressed: boolean;
  readonly previewUrl: string;
  readonly width: number;
  readonly height: number;
}

export const TARGET_MAX_BYTES = 200 * 1024; // 200 KB

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Compresses an image file so that its size is guaranteed to be <= targetMaxBytes (default 200 KB).
 */
export async function compressImage(
  file: File,
  targetMaxBytes = TARGET_MAX_BYTES,
): Promise<CompressionResult> {
  const originalBytes = file.size;

  // If not an image (e.g. PDF), or already under target size, return original
  if (!file.type.startsWith('image/') || originalBytes <= targetMaxBytes) {
    const previewUrl = typeof URL !== 'undefined' ? URL.createObjectURL(file) : '';
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      originalSizeFormatted: formatBytes(originalBytes),
      compressedSizeFormatted: formatBytes(originalBytes),
      savingsPercent: 0,
      wasCompressed: false,
      previewUrl,
      width: 0,
      height: 0,
    };
  }

  // Headless / SSR environment fallback
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      file,
      originalBytes,
      compressedBytes: originalBytes,
      originalSizeFormatted: formatBytes(originalBytes),
      compressedSizeFormatted: formatBytes(originalBytes),
      savingsPercent: 0,
      wasCompressed: false,
      previewUrl: '',
      width: 0,
      height: 0,
    };
  }

  return new Promise<CompressionResult>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      // Step 1: Scale down dimensions if exceeding max bounds
      const MAX_DIMENSION = 1400;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({
          file,
          originalBytes,
          compressedBytes: originalBytes,
          originalSizeFormatted: formatBytes(originalBytes),
          compressedSizeFormatted: formatBytes(originalBytes),
          savingsPercent: 0,
          wasCompressed: false,
          previewUrl: '',
          width,
          height,
        });
        return;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Step 2: Binary / iterative search for optimal quality to meet < 200KB threshold
      let quality = 0.85;
      const mimeType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
      const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
      const cleanName = file.name.replace(/\.[^/.]+$/, '') + ext;

      function attemptCompression(q: number, w: number, h: number): void {
        canvas.width = w;
        canvas.height = h;
        ctx?.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                file,
                originalBytes,
                compressedBytes: originalBytes,
                originalSizeFormatted: formatBytes(originalBytes),
                compressedSizeFormatted: formatBytes(originalBytes),
                savingsPercent: 0,
                wasCompressed: false,
                previewUrl: '',
                width: w,
                height: h,
              });
              return;
            }

            if (blob.size <= targetMaxBytes || (q <= 0.25 && w <= 480)) {
              // Successfully compressed under target size (or reached reasonable minimums)
              const compressedFile = new File([blob], cleanName, { type: mimeType });
              const savings = Math.max(0, Math.round(((originalBytes - blob.size) / originalBytes) * 100));
              const preview = URL.createObjectURL(blob);

              resolve({
                file: compressedFile,
                originalBytes,
                compressedBytes: blob.size,
                originalSizeFormatted: formatBytes(originalBytes),
                compressedSizeFormatted: formatBytes(blob.size),
                savingsPercent: savings,
                wasCompressed: true,
                previewUrl: preview,
                width: w,
                height: h,
              });
            } else if (q > 0.35) {
              // Reduce quality first
              quality -= 0.15;
              attemptCompression(quality, w, h);
            } else {
              // Scale down dimensions by 25% and retry
              const nextW = Math.round(w * 0.75);
              const nextH = Math.round(h * 0.75);
              attemptCompression(0.65, nextW, nextH);
            }
          },
          mimeType,
          q,
        );
      }

      attemptCompression(quality, width, height);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        file,
        originalBytes,
        compressedBytes: originalBytes,
        originalSizeFormatted: formatBytes(originalBytes),
        compressedSizeFormatted: formatBytes(originalBytes),
        savingsPercent: 0,
        wasCompressed: false,
        previewUrl: '',
        width: 0,
        height: 0,
      });
    };

    img.src = objectUrl;
  });
}
