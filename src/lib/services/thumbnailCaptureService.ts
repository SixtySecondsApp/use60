import { supabase } from '@/lib/supabase/clientV2';

/**
 * Client-side thumbnail capture service
 * Captures video frames from the meeting detail page and uploads to S3
 */

interface CaptureOptions {
  meetingId: string;
  recordingId: string;
  shareUrl?: string;
  quality?: number; // 0.0 to 1.0
}

interface CaptureResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Capture thumbnail from iframe video player
 * Uses html2canvas to screenshot the iframe element
 */
export async function captureThumbnailFromIframe(
  iframeElement: HTMLIFrameElement,
  options: CaptureOptions
): Promise<CaptureResult> {
  try {
    // Wait a moment for the video to be visible
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create canvas from iframe
    const canvas = document.createElement('canvas');
    const rect = iframeElement.getBoundingClientRect();

    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Scale for retina displays
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Try to draw the iframe content
    try {
      // This will fail due to CORS, but we'll try anyway
      ctx.drawImage(iframeElement, 0, 0, rect.width, rect.height);
    } catch (corsError) {
      // Fallback: Use backend screenshot service instead
      return await captureViaBackend(options);
    }

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/jpeg',
        options.quality || 0.85
      );
    });

    // Upload to backend
    return await uploadThumbnail(blob, options);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Capture using backend Playwright/screenshot service
 * This is our fallback when client-side capture fails due to CORS
 */
async function captureViaBackend(options: CaptureOptions): Promise<CaptureResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-router', {
      body: {
        action: 'video_thumbnail',
        recording_id: options.recordingId,
        share_url: options.shareUrl,
        fathom_embed_url: options.shareUrl
          ? `https://fathom.video/embed/${extractTokenFromShareUrl(options.shareUrl)}`
          : `https://app.fathom.video/recording/${options.recordingId}`,
        meeting_id: options.meetingId,
        timestamp_seconds: 30, // Capture at 30 seconds into video
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success || !data?.thumbnail_url) {
      throw new Error('Backend thumbnail generation failed');
    }

    return {
      success: true,
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Backend capture failed',
    };
  }
}

/**
 * Upload thumbnail blob to backend for S3 storage
 */
async function uploadThumbnail(
  blob: Blob,
  options: CaptureOptions
): Promise<CaptureResult> {
  try {
    // Convert blob to base64
    const base64 = await blobToBase64(blob);

    // Upload via edge function
    const { data, error } = await supabase.functions.invoke('upload-thumbnail', {
      body: {
        image_data: base64,
        recording_id: options.recordingId,
        meeting_id: options.meetingId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success || !data?.thumbnail_url) {
      throw new Error('Upload failed');
    }

    // Update meeting record
    await supabase
      .from('meetings')
      .update({ thumbnail_url: data.thumbnail_url })
      .eq('id', options.meetingId);

    return {
      success: true,
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Helper: Convert blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data:image/jpeg;base64, prefix
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper: Extract token from Fathom share URL
 */
function extractTokenFromShareUrl(shareUrl: string): string {
  try {
    const url = new URL(shareUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  } catch {
    return '';
  }
}

/**
 * Simple approach: Use backend screenshot with video-player selector
 * This is the most reliable method since we fixed the backend to target video elements
 */
export async function captureThumbnailSimple(
  meetingId: string,
  recordingId: string,
  shareUrl: string
): Promise<CaptureResult> {
  return await captureViaBackend({
    meetingId,
    recordingId,
    shareUrl,
  });
}
