import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import type { LandingSection } from '@/components/landing-builder/types';

const BUCKET = 'landing-builder-assets';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

/** Map MIME type to file extension */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  return map[mime] ?? 'png';
}

/** Check if a URL is already hosted in Supabase Storage */
function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage');
}

/**
 * Upload a File to the landing-builder-assets bucket.
 * Returns the permanent public URL.
 */
async function uploadImage(
  file: File,
  orgId: string,
  sessionId: string,
): Promise<string> {
  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Image must be smaller than 5 MB');
  }

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Allowed: jpeg, png, webp, gif, svg+xml`,
    );
  }

  const ext = extFromMime(file.type);
  const uniqueId = crypto.randomUUID();
  const path = `${orgId}/${sessionId}/${Date.now()}-${uniqueId}.${ext}`;

  logger.log('[landingAssetService] Uploading image', { path, size: file.size, type: file.type });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });

  if (uploadError) {
    logger.error('[landingAssetService] Upload failed', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) {
    throw new Error('Failed to obtain public URL after upload');
  }

  logger.log('[landingAssetService] Upload complete', { publicUrl });
  return publicUrl;
}

/**
 * Download an image from a URL (https:// or data:image/ base64) and upload
 * it to Supabase Storage. Returns the permanent public URL.
 */
async function uploadFromUrl(
  url: string,
  orgId: string,
  sessionId: string,
): Promise<string> {
  let blob: Blob;
  let mime: string;

  if (url.startsWith('data:')) {
    // Parse data URL  —  data:<mime>;base64,<payload>
    const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URL format');
    }
    mime = match[1];
    const raw = atob(match[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: mime });
  } else {
    // Fetch remote image
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
    }
    blob = await response.blob();
    mime = blob.type || 'image/png';
  }

  // Build a File so we can reuse uploadImage validation
  const ext = extFromMime(mime);
  const file = new File([blob], `upload.${ext}`, { type: mime });

  return uploadImage(file, orgId, sessionId);
}

/**
 * Walk through an array of LandingSection objects. Any section whose
 * `image_url` is a base64 data URL or a non-Supabase URL gets uploaded
 * to permanent storage; the returned array has those URLs replaced.
 */
async function persistSectionImages(
  sections: LandingSection[],
  orgId: string,
  sessionId: string,
): Promise<LandingSection[]> {
  const result: LandingSection[] = [];

  for (const section of sections) {
    const url = section.image_url;

    // Nothing to persist — keep as-is
    if (!url || isSupabaseStorageUrl(url)) {
      result.push(section);
      continue;
    }

    try {
      const permanentUrl = await uploadFromUrl(url, orgId, sessionId);
      result.push({ ...section, image_url: permanentUrl });
    } catch (err) {
      logger.error(
        '[landingAssetService] Failed to persist image for section',
        { sectionId: section.id, sectionType: section.type, error: err },
      );
      // Keep original URL rather than breaking the whole page
      result.push(section);
    }
  }

  return result;
}

/**
 * Delete a file from the landing-builder-assets bucket.
 * `path` should be the storage path (e.g. orgId/sessionId/filename.png).
 */
async function deleteImage(path: string): Promise<void> {
  logger.log('[landingAssetService] Deleting image', { path });

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    logger.error('[landingAssetService] Delete failed', error);
    throw error;
  }
}

export const landingAssetService = {
  uploadImage,
  uploadFromUrl,
  persistSectionImages,
  deleteImage,
};
