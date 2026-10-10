import { config } from '../config/env.js';

export interface ImageValidationResult {
  valid: boolean;
  mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
  extension: 'webp' | 'jpg' | 'png';
  buffer: Buffer;
  error?: string;
}

export class StorageService {
  private static readonly BUCKET_NAME = 'avatars';
  private static readonly MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB for compressed profile photo

  /**
   * Validate raw image buffer or base64 Data URL.
   * Validates MIME type and magic bytes to prevent arbitrary or malicious uploads.
   */
  public static validateAndParseImage(input: string | Buffer): ImageValidationResult {
    let buffer: Buffer;
    let declaredMime: string | undefined;

    if (typeof input === 'string') {
      const match = input.match(/^data:image\/(webp|jpeg|png|jpg);base64,(.+)$/i);
      if (!match) {
        return {
          valid: false,
          mimeType: 'image/webp',
          extension: 'webp',
          buffer: Buffer.alloc(0),
          error: 'Invalid image format. Expected a base64 Data URL (image/jpeg, image/png, or image/webp).',
        };
      }
      declaredMime = match[1].toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${match[1].toLowerCase()}`;
      try {
        buffer = Buffer.from(match[2], 'base64');
      } catch {
        return {
          valid: false,
          mimeType: 'image/webp',
          extension: 'webp',
          buffer: Buffer.alloc(0),
          error: 'Malformed base64 image data.',
        };
      }
    } else if (Buffer.isBuffer(input)) {
      buffer = input;
    } else {
      return {
        valid: false,
        mimeType: 'image/webp',
        extension: 'webp',
        buffer: Buffer.alloc(0),
        error: 'Invalid image payload.',
      };
    }

    if (buffer.length === 0) {
      return {
        valid: false,
        mimeType: 'image/webp',
        extension: 'webp',
        buffer: Buffer.alloc(0),
        error: 'Empty image file.',
      };
    }

    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        mimeType: 'image/webp',
        extension: 'webp',
        buffer: Buffer.alloc(0),
        error: `Compressed image exceeds size limit of ${this.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      };
    }

    // Verify magic bytes
    // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
    const isWebP =
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50; // P

    // JPEG: FF D8 FF
    const isJpeg =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    if (isWebP) {
      return { valid: true, mimeType: 'image/webp', extension: 'webp', buffer };
    }
    if (isJpeg) {
      return { valid: true, mimeType: 'image/jpeg', extension: 'jpg', buffer };
    }
    if (isPng) {
      return { valid: true, mimeType: 'image/png', extension: 'png', buffer };
    }

    return {
      valid: false,
      mimeType: 'image/webp',
      extension: 'webp',
      buffer: Buffer.alloc(0),
      error: 'Unsupported image format or corrupted header. Only WebP, JPEG, and PNG images are allowed.',
    };
  }

  /**
   * Uploads compressed profile image to Supabase Storage in the 'avatars' bucket.
   * Path is scoped strictly to authenticated employee: profiles/${employeeId}/${timestamp}.${extension}.
   */
  public static async uploadProfilePhoto(
    employeeId: string,
    buffer: Buffer,
    mimeType: string,
    extension: string
  ): Promise<string> {
    const timestamp = Date.now();
    const storagePath = `profiles/${employeeId}/${timestamp}.${extension}`;
    const url = `${config.supabaseUrl}/storage/v1/object/${this.BUCKET_NAME}/${storagePath}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.supabaseSecretKey,
        Authorization: `Bearer ${config.supabaseSecretKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to upload image to Supabase storage (${res.status}): ${errText}`);
    }

    // Public URL
    return `${config.supabaseUrl}/storage/v1/object/public/${this.BUCKET_NAME}/${storagePath}`;
  }

  /**
   * Safely deletes an old image object from Supabase Storage by its public URL.
   */
  public static async deleteFileByUrl(fileUrl: string | null | undefined): Promise<boolean> {
    if (!fileUrl || typeof fileUrl !== 'string') return false;

    // Check if the URL belongs to our Supabase Storage avatars bucket
    const marker = `/storage/v1/object/public/${this.BUCKET_NAME}/`;
    const markerIndex = fileUrl.indexOf(marker);
    if (markerIndex === -1) {
      return false; // Not a Supabase storage URL managed by this bucket
    }

    const storagePath = fileUrl.substring(markerIndex + marker.length);
    if (!storagePath) return false;

    try {
      const delUrl = `${config.supabaseUrl}/storage/v1/object/${this.BUCKET_NAME}/${storagePath}`;
      const res = await fetch(delUrl, {
        method: 'DELETE',
        headers: {
          apikey: config.supabaseSecretKey,
          Authorization: `Bearer ${config.supabaseSecretKey}`,
        },
      });
      return res.ok;
    } catch (err: any) {
      console.warn(`[StorageService] Could not delete previous avatar (${storagePath}):`, err.message);
      return false;
    }
  }
}
