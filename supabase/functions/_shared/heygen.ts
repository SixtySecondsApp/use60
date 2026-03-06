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
  status: 'pending' | 'processing' | 'completed' | 'failed';
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

  async getGenerationStatus(generationId: string): Promise<GenerationStatus> {
    return this.request('GET', `/v2/photo_avatar/generation/${generationId}`);
  }

  async createGroup(params: CreateGroupRequest): Promise<CreateGroupResponse> {
    return this.request('POST', '/v2/photo_avatar/avatar_group/create', params);
  }

  async addToGroup(groupId: string, imageKeys: string[], generationId: string): Promise<void> {
    await this.request('POST', '/v2/photo_avatar/avatar_group/add', {
      group_id: groupId,
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

export async function createHeyGenClient(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<HeyGenClient> {
  const { data, error } = await serviceClient
    .from('heygen_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch HeyGen credentials: ${error.message}`);
  if (!data?.api_key) throw new Error('HeyGen API key not configured for this organization');

  return new HeyGenClient(data.api_key);
}
