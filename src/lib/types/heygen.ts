// HeyGen Integration Types

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export type AvatarStatus = 'creating' | 'training' | 'generating_looks' | 'ready' | 'failed';
export type AvatarType = 'photo' | 'digital_twin';

export interface AvatarLook {
  look_id: string;
  name: string;
  thumbnail_url: string;
  heygen_avatar_id: string | null;
}

export interface HeyGenAvatar {
  id: string;
  org_id: string;
  user_id: string;
  heygen_avatar_id: string | null;
  heygen_group_id: string | null;
  heygen_generation_id: string | null;
  avatar_name: string;
  avatar_type: AvatarType;
  status: AvatarStatus;
  error_message: string | null;
  looks: AvatarLook[];
  voice_id: string | null;
  voice_name: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface HeyGenVideo {
  id: string;
  org_id: string;
  user_id: string;
  avatar_id: string | null;
  heygen_video_id: string;
  template_id: string | null;
  callback_id: string | null;
  status: VideoStatus;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  prospect_data: Record<string, string>;
  campaign_link_id: string | null;
  dynamic_table_row_id: string | null;
  video_url_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
  emotion_support?: boolean;
}

// ---------------------------------------------------------------------------
// API Requests / Responses
// ---------------------------------------------------------------------------

export interface VideoGenerateRequest {
  avatar_id: string;
  script: string;
  variables?: Record<string, string>;
  prospects?: Array<Record<string, string>>;
  campaign_link_id?: string;
  dynamic_table_row_id?: string;
}

export interface VideoGenerateResult {
  total: number;
  succeeded: number;
  failed: number;
  videos: Array<{
    prospect: Record<string, string>;
    video_id?: string;
    heygen_video_id?: string;
    error?: string;
  }>;
}

export interface AvatarCreateRequest {
  action: string;
  avatar_id?: string;
  avatar_name?: string;
  name?: string;
  age?: string;
  gender?: string;
  ethnicity?: string;
  orientation?: string;
  pose?: string;
  style?: string;
  appearance?: string;
  image_key?: string;
  generation_id?: string;
  prompt?: string;
  photo_avatar_id?: string;
  look_id?: string;
  voice_id?: string;
  voice_name?: string;
}
