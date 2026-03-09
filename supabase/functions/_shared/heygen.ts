/**
 * _shared/heygen.ts — Typed HeyGen API client
 *
 * Covers: Photo Avatar pipeline, Video Generation, Voice listing, Account info.
 * Auth: x-api-key header.
 * Base URL: https://api.heygen.com
 */

const HEYGEN_BASE = 'https://api.heygen.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeyGenError {
  status: number;
  message: string;
  code?: string;
}

// -- Avatars --

export interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string;
  preview_video_url?: string;
}

export interface GeneratePhotoRequest {
  name: string;
  age: string;
  gender: string;
  ethnicity: string;
  orientation: string;
  pose: string;
  style: string;
  appearance: string;
}

export interface GeneratePhotoResponse {
  generation_id: string;
}

export interface GenerationStatus {
  status: 'pending' | 'processing' | 'completed' | 'success' | 'failed';
  image_key_list?: string[];
  image_url_list?: string[];
  error?: string;
}

export interface CreateGroupRequest {
  name: string;
  image_key: string;
  generation_id: string;
}

export interface CreateGroupResponse {
  group_id: string;
}

export interface TrainResponse {
  status: string;
}

export interface TrainingStatus {
  status: 'pending' | 'training' | 'completed' | 'failed';
  error?: string;
}

export interface GenerateLookRequest {
  group_id: string;
  prompt: string;
  orientation: string;
  pose: string;
  style: string;
}

export interface GenerateLookResponse {
  generation_id: string;
}

export interface AddMotionResponse {
  id: string;
}

// -- Videos --

export interface VideoCharacter {
  type: 'avatar' | 'talking_photo';
  avatar_id?: string;
  talking_photo_id?: string;
  avatar_version?: 'v3' | 'v4';
  scale?: number;
  avatar_style?: 'circle' | 'closeUp' | 'normal';
  offset?: { x: number; y: number };
  matting?: boolean;
}

export interface VideoVoice {
  type: 'text' | 'audio' | 'silence';
  voice_id?: string;
  input_text?: string;
  speed?: number;
  emotion?: 'Excited' | 'Friendly' | 'Serious' | 'Soothing' | 'Broadcaster';
  audio_url?: string;
  duration?: number;
}

export interface VideoBackground {
  type: 'color' | 'image' | 'video';
  value?: string;
  url?: string;
}

export interface VideoScene {
  character: VideoCharacter;
  voice: VideoVoice;
  background?: VideoBackground;
}

export interface GenerateVideoRequest {
  video_inputs: VideoScene[];
  dimension?: { width: number; height: number };
  caption?: boolean;
  title?: string;
  callback_id?: string;
  callback_url?: string;
}

export interface GenerateVideoResponse {
  video_id: string;
}

export interface VideoStatus {
  status: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  error?: { message?: string; detail?: string };
}

// -- Voices --

export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
  support_pause?: boolean;
  emotion_support?: boolean;
}

// -- Templates --

export interface TemplateVariable {
  name: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'avatar';
  properties: { content: string };
}

export interface GenerateFromTemplateRequest {
  caption?: boolean;
  title?: string;
  variables: Record<string, TemplateVariable>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HeyGenClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  // -- Helpers --

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${HEYGEN_BASE}${path}`;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
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
      const err: HeyGenError = {
        status: 429,
        message: `Rate limited. Retry after ${retryAfter || 'unknown'} seconds.`,
        code: 'RATE_LIMITED',
      };
      throw err;
    }

    const json = await res.json();

    if (!res.ok || json.error) {
      const err: HeyGenError = {
        status: res.status,
        message: json.error?.message || json.message || `HeyGen API error (${res.status})`,
        code: json.error?.code,
      };
      throw err;
    }

    return json.data ?? json;
  }

  // -- Account --

  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/v2/avatars');
      return true;
    } catch {
      return false;
    }
  }

  // -- Avatar Listing --

  async listAvatars(): Promise<{ avatars: HeyGenAvatar[] }> {
    return this.request('GET', '/v2/avatars');
  }

  // -- Photo Avatar Pipeline --

  async generatePhoto(params: GeneratePhotoRequest): Promise<GeneratePhotoResponse> {
    return this.request('POST', '/v2/photo_avatar/photo/generate', params);
  }

  /**
   * Upload a user photo as a HeyGen asset (raw PNG body to upload.heygen.com).
   * Returns image_key for use in photo avatar pipeline (group → train).
   */
  async uploadPhoto(imageUrl: string): Promise<{ image_key: string; asset_url: string }> {
    // Fetch the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw { status: imgRes.status, message: 'Failed to fetch image from URL' } as HeyGenError;

    const imageBlob = await imgRes.blob();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

    const res = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': contentType,
      },
      body: imageBlob,
    });

    const json = await res.json();
    if (json.code !== 100 && (!res.ok || json.error)) {
      throw {
        status: res.status,
        message: json.message || json.error?.message || 'Failed to upload photo to HeyGen',
        code: json.error?.code || String(json.code),
      } as HeyGenError;
    }

    return {
      image_key: json.data.image_key,
      asset_url: json.data.url,
    };
  }

  async getGenerationStatus(generationId: string): Promise<GenerationStatus> {
    return this.request('GET', `/v2/photo_avatar/generation/${generationId}`);
  }

  async createGroup(params: CreateGroupRequest): Promise<CreateGroupResponse> {
    return this.request('POST', '/v2/photo_avatar/avatar_group/create', params);
  }

  async addToGroup(groupId: string, name: string, imageKeys: string[], generationId: string): Promise<void> {
    await this.request('POST', '/v2/photo_avatar/avatar_group/add', {
      group_id: groupId,
      name,
      image_keys: imageKeys,
      generation_id: generationId,
    });
  }

  async trainAvatar(groupId: string): Promise<TrainResponse> {
    return this.request('POST', '/v2/photo_avatar/train', { group_id: groupId });
  }

  async getTrainingStatus(groupId: string): Promise<TrainingStatus> {
    return this.request('GET', `/v2/photo_avatar/train/status/${groupId}`);
  }

  async generateLook(params: GenerateLookRequest): Promise<GenerateLookResponse> {
    return this.request('POST', '/v2/photo_avatar/look/generate', params);
  }

  async addMotion(photoAvatarId: string): Promise<AddMotionResponse> {
    return this.request('POST', '/v2/photo_avatar/add_motion', { id: photoAvatarId });
  }

  async getAvatarDetails(avatarId: string): Promise<HeyGenAvatar> {
    return this.request('GET', `/v2/photo_avatar/${avatarId}`);
  }

  // -- Digital Twin (Instant Avatar) --

  async createDigitalTwin(params: {
    training_footage_url: string;
    video_consent_url: string;
    avatar_name: string;
  }): Promise<{ avatar_id: string }> {
    return this.request('POST', '/v2/video_avatar', params);
  }

  async getDigitalTwinStatus(avatarId: string): Promise<{
    status: string;
    avatar_id: string;
  }> {
    return this.request('GET', `/v2/video_avatar/${avatarId}`);
  }

  async listAvatarGroups(): Promise<{
    avatar_group_list: Array<{
      id: string;
      name: string;
      group_type: string;
      train_status: string | null;
      num_looks: number;
      default_voice_id: string | null;
      preview_image: string;
      created_at: number;
    }>;
  }> {
    return this.request('GET', '/v2/avatar_group.list');
  }

  async listGroupAvatars(groupId: string): Promise<{
    avatar_list: Array<{
      avatar_id: string;
      avatar_name: string;
      preview_image_url: string;
      preview_video_url: string;
    }>;
  }> {
    return this.request('GET', `/v2/avatar_group/${groupId}/avatars`);
  }

  // -- Voices --

  async listVoices(): Promise<{ voices: HeyGenVoice[] }> {
    return this.request('GET', '/v2/voices');
  }

  // -- Video Generation --

  async generateVideo(params: GenerateVideoRequest): Promise<GenerateVideoResponse> {
    return this.request('POST', '/v2/video/generate', params);
  }

  async getVideoStatus(videoId: string): Promise<VideoStatus> {
    return this.request('GET', `/v1/video_status.get?video_id=${videoId}`);
  }

  // -- Template Video --

  async generateFromTemplate(
    templateId: string,
    params: GenerateFromTemplateRequest,
  ): Promise<GenerateVideoResponse> {
    return this.request('POST', `/v2/template/${templateId}/generate`, params);
  }

  async getTemplateDetails(templateId: string): Promise<unknown> {
    return this.request('GET', `/v3/template/${templateId}`);
  }
}

// ---------------------------------------------------------------------------
// Factory: create client from Supabase service-role + org_id
// ---------------------------------------------------------------------------

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Creates a HeyGenClient using:
 * 1. Org's own API key (if they brought their own), or
 * 2. Platform default key from HEYGEN_API_KEY env var
 */
export async function createHeyGenClient(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<HeyGenClient> {
  // Check for org-specific key first
  const { data } = await serviceClient
    .from('heygen_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  if (data?.api_key) {
    return new HeyGenClient(data.api_key);
  }

  // Fall back to platform default key
  const platformKey = Deno.env.get('HEYGEN_API_KEY');
  if (!platformKey) {
    throw new Error('Video Avatar not available — contact support');
  }

  return new HeyGenClient(platformKey);
}
