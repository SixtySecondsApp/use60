/**
 * _shared/fal.ts — Typed fal.ai API client
 *
 * Covers: Queue submit, status polling, result retrieval, cancellation.
 * Auth: Authorization: Key {FAL_KEY} header.
 * Base URL: https://queue.fal.run
 */

const FAL_QUEUE_BASE = 'https://queue.fal.run';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FalError {
  status: number;
  message: string;
  code?: string;
}

export type FalJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';

export interface FalQueueResponse {
  request_id: string;
  response_url: string;
  status_url: string;
  cancel_url: string;
}

export interface FalStatusResponse {
  status: FalJobStatus;
  queue_position?: number;
  logs?: Array<{ message: string; timestamp: string }>;
}

export interface FalVideoOutput {
  video: {
    url: string;
    content_type: string;
    file_name: string;
    file_size: number;
  };
  seed?: number;
}

export interface FalVideoInput {
  prompt?: string;
  image_url?: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  generate_audio?: boolean;
}

// ---------------------------------------------------------------------------
// Image generation types (Nano Banana 2)
// ---------------------------------------------------------------------------

export interface FalImageOutput {
  images: Array<{
    url: string;
    content_type: string;
    file_name: string;
    file_size?: number;
  }>;
  seed?: number;
  description?: string;
}

export interface FalImageInput {
  prompt: string;
  num_images?: number;
  aspect_ratio?: string;   // 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16, auto
  resolution?: string;     // 0.5K, 1K, 2K, 4K
  output_format?: string;  // png, jpeg
  safety_tolerance?: number; // 1 (strict) to 6 (lenient)
  image_url?: string;      // for /edit endpoint — source image
  seed?: number;           // for reproducible variations
}

export type FalModelId = string;

// ---------------------------------------------------------------------------
// Supported model IDs (for reference)
// ---------------------------------------------------------------------------

export const FAL_MODELS = {
  // Video models
  KLING_3_PRO_T2V: 'fal-ai/kling-video/v3/pro/text-to-video',
  KLING_3_PRO_I2V: 'fal-ai/kling-video/v3/pro/image-to-video',
  KLING_2_5_MASTER_T2V: 'fal-ai/kling-video/v2/master/text-to-video',
  VEO_3: 'fal-ai/veo3',
  WAN_2_5_I2V: 'fal-ai/wan-ai/wan2.1-i2v-720p',
  // Image models
  NANO_BANANA_2: 'fal-ai/nano-banana-2',
  NANO_BANANA_2_EDIT: 'fal-ai/nano-banana-2/edit',
} as const;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class FalClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  // -- Private helper --

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Key ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Respect rate limits
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const err: FalError = {
        status: 429,
        message: `Rate limited. Retry after ${retryAfter || 'unknown'} seconds.`,
        code: 'RATE_LIMITED',
      };
      throw err;
    }

    if (!res.ok) {
      let message = `fal.ai API error (${res.status})`;
      try {
        const json = await res.json();
        message = json.detail || json.message || json.error || message;
      } catch {
        // ignore parse errors
      }
      const err: FalError = { status: res.status, message };
      throw err;
    }

    return res.json() as Promise<T>;
  }

  // -- Core queue methods --

  async submitJob(
    modelId: FalModelId,
    input: FalVideoInput,
    webhookUrl?: string,
  ): Promise<FalQueueResponse> {
    const url = webhookUrl
      ? `${FAL_QUEUE_BASE}/${modelId}?fal_webhook=${encodeURIComponent(webhookUrl)}`
      : `${FAL_QUEUE_BASE}/${modelId}`;
    return this.request<FalQueueResponse>('POST', url, input);
  }

  async getJobStatus(modelId: FalModelId, requestId: string): Promise<FalStatusResponse> {
    const url = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}/status`;
    return this.request<FalStatusResponse>('GET', url);
  }

  async getJobResult<T = FalVideoOutput>(modelId: FalModelId, requestId: string): Promise<T> {
    const url = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}`;
    return this.request<T>('GET', url);
  }

  async cancelJob(modelId: FalModelId, requestId: string): Promise<void> {
    const url = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}/cancel`;
    await this.request<unknown>('PUT', url);
  }

  // -- Convenience --

  async testConnection(): Promise<boolean> {
    try {
      // Submit a minimal test job to verify the key is valid; cancel immediately
      const result = await this.submitJob(FAL_MODELS.KLING_3_PRO_T2V, {
        prompt: 'connection test',
        duration: '3',
      });
      // Cancel right away — we only needed to confirm the key works
      await this.cancelJob(FAL_MODELS.KLING_3_PRO_T2V, result.request_id).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory: create client from Supabase service-role + org_id
// ---------------------------------------------------------------------------

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Creates a FalClient using:
 * 1. Org's own API key (if they brought their own), or
 * 2. Platform default key from FAL_KEY env var
 */
export async function createFalClient(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<FalClient> {
  // Check for org-specific key first
  const { data } = await serviceClient
    .from('fal_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  if (data?.api_key) {
    return new FalClient(data.api_key);
  }

  // Fall back to platform default key
  const platformKey = Deno.env.get('FAL_KEY');
  if (!platformKey) {
    throw new Error('Video generation not available — contact support');
  }

  return new FalClient(platformKey);
}
