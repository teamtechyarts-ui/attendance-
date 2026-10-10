/**
 * Client-side profile photo compression and square-cropping utility.
 * Resizes any uploaded photo to 512x512 with center square cropping
 * and compresses it to WebP format (or JPEG fallback) at 0.85 quality.
 */
export interface CompressedImageResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  mimeType: 'image/webp' | 'image/jpeg';
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const MAX_INPUT_FILE_SIZE = 10 * 1024 * 1024; // 10MB raw limit

export async function compressProfileImage(file: File): Promise<CompressedImageResult> {
  if (!file) {
    throw new Error('No file provided');
  }

  // 1. Strict MIME type check (reject SVG, GIF, HTML, etc.)
  const rawType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(rawType)) {
    throw new Error('Invalid file format. Please upload a JPEG, PNG, or WebP image.');
  }

  // 2. Size validation
  if (file.size > MAX_INPUT_FILE_SIZE) {
    throw new Error('Image file is too large. Maximum allowed size is 10MB.');
  }

  // 3. Load image into memory with safe ObjectURL revocation
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        if (!naturalWidth || !naturalHeight) {
          throw new Error('Corrupted or unreadable image file.');
        }

        // Center square crop
        const minDim = Math.min(naturalWidth, naturalHeight);
        const sourceX = Math.floor((naturalWidth - minDim) / 2);
        const sourceY = Math.floor((naturalHeight - minDim) / 2);

        // 512x512 target resolution
        const targetDim = 512;
        const canvas = document.createElement('canvas');
        canvas.width = targetDim;
        canvas.height = targetDim;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // High quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw center-cropped square into 512x512 canvas
        ctx.drawImage(img, sourceX, sourceY, minDim, minDim, 0, 0, targetDim, targetDim);

        // Export to WebP (0.85 quality)
        let dataUrl = canvas.toDataURL('image/webp', 0.85);
        let mimeType: 'image/webp' | 'image/jpeg' = 'image/webp';

        // Check if browser supports WebP canvas export
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          mimeType = 'image/jpeg';
        }

        // Calculate approximate size in bytes from base64 string
        const base64Str = dataUrl.split(',')[1] || '';
        const sizeBytes = Math.round((base64Str.length * 3) / 4);

        resolve({
          dataUrl,
          sizeBytes,
          width: targetDim,
          height: targetDim,
          mimeType,
        });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to process and compress image'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image. The file may be damaged or not a supported image.'));
    };

    img.src = objectUrl;
  });
}
