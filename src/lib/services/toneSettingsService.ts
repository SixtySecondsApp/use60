import { supabase } from '@/lib/supabase/clientV2';
import type { ContentType } from './contentService';

/**
 * Tone Settings Service
 *
 * Purpose: Manage per-content-type tone settings for content generation
 * Features:
 * - Get/save tone settings for each content type
 * - Brand voice configuration
 * - Words to avoid/prefer lists
 * - Formality and emoji settings
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Emoji usage level
 */
export type EmojiUsage = 'none' | 'minimal' | 'moderate' | 'liberal';

/**
 * CTA style options
 */
export type CTAStyle = 'soft' | 'direct' | 'question' | 'none';

/**
 * Tone settings for a content type
 */
export interface ToneSettings {
  id?: string;
  user_id?: string;
  content_type: ContentType;
  tone_style: string;
  formality_level: number; // 1-10
  emoji_usage: EmojiUsage;
  brand_voice_description?: string;
  sample_phrases?: string[];
  words_to_avoid?: string[];
  preferred_keywords?: string[];
  max_length_override?: number;
  include_cta?: boolean;
  cta_style?: CTAStyle;
  email_sign_off?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Input for saving tone settings (subset of fields)
 */
export interface ToneSettingsInput {
  content_type: ContentType;
  tone_style?: string;
  formality_level?: number;
  emoji_usage?: EmojiUsage;
  brand_voice_description?: string;
  sample_phrases?: string[];
  words_to_avoid?: string[];
  preferred_keywords?: string[];
  max_length_override?: number;
  include_cta?: boolean;
  cta_style?: CTAStyle;
}

/**
 * All tone settings for a user
 */
export interface AllToneSettings {
  social?: ToneSettings;
  blog?: ToneSettings;
  email?: ToneSettings;
  video?: ToneSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

export const DEFAULT_TONE_SETTINGS: Record<ContentType, ToneSettings> = {
  social: {
    content_type: 'social',
    tone_style: 'conversational and engaging',
    formality_level: 4,
    emoji_usage: 'minimal',
    include_cta: true,
    cta_style: 'question',
  },
  blog: {
    content_type: 'blog',
    tone_style: 'professional and authoritative',
    formality_level: 5,
    emoji_usage: 'none',
    include_cta: true,
    cta_style: 'soft',
  },
  video: {
    content_type: 'video',
    tone_style: 'energetic and conversational',
    formality_level: 3,
    emoji_usage: 'none',
    include_cta: true,
    cta_style: 'direct',
  },
  email: {
    content_type: 'email',
    tone_style: 'friendly and professional',
    formality_level: 5,
    emoji_usage: 'none',
    include_cta: true,
    cta_style: 'direct',
  },
};

// ============================================================================
// Custom Error Class
// ============================================================================

export class ToneSettingsServiceError extends Error {
  public status: number;
  public details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ToneSettingsServiceError';
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// Tone Settings Service Class
// ============================================================================

export class ToneSettingsService {
  /**
   * Get tone settings for a specific content type
   *
   * @param contentType - The content type to get settings for
   * @returns ToneSettings or default if not set
   */
  async getToneSettings(contentType: ContentType): Promise<ToneSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return DEFAULT_TONE_SETTINGS[contentType];
      }

      const { data, error } = await supabase
        .from('user_tone_settings' as never)
        .select('*')
        .eq('user_id', user.id)
        .eq('content_type', contentType)
        .single();

      if (error || !data) {
        // Return defaults if no custom settings
        return DEFAULT_TONE_SETTINGS[contentType];
      }

      const typedData = data as ToneSettings;
      return {
        ...DEFAULT_TONE_SETTINGS[contentType],
        ...typedData,
      };
    } catch {
      return DEFAULT_TONE_SETTINGS[contentType];
    }
  }

  /**
   * Get all tone settings for the current user
   *
   * @returns AllToneSettings object with settings for each content type
   */
  async getAllToneSettings(): Promise<AllToneSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          social: DEFAULT_TONE_SETTINGS.social,
          blog: DEFAULT_TONE_SETTINGS.blog,
          email: DEFAULT_TONE_SETTINGS.email,
          video: DEFAULT_TONE_SETTINGS.video,
        };
      }

      const { data, error } = await supabase
        .from('user_tone_settings' as never)
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        throw new ToneSettingsServiceError(
          'Failed to fetch tone settings',
          500,
          error.message
        );
      }

      // Build result with defaults
      const result: AllToneSettings = {
        social: DEFAULT_TONE_SETTINGS.social,
        blog: DEFAULT_TONE_SETTINGS.blog,
        email: DEFAULT_TONE_SETTINGS.email,
        video: DEFAULT_TONE_SETTINGS.video,
      };

      // Override with user settings
      const typedData = (data as ToneSettings[] | null) || [];
      typedData.forEach((setting) => {
        const contentType = setting.content_type as ContentType;
        result[contentType] = {
          ...DEFAULT_TONE_SETTINGS[contentType],
          ...setting,
        };
      });

      return result;
    } catch (error) {
      if (error instanceof ToneSettingsServiceError) {
        throw error;
      }

      throw new ToneSettingsServiceError(
        'Failed to fetch tone settings',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Save tone settings for a content type
   *
   * @param settings - The settings to save
   * @returns The saved settings
   */
  async saveToneSettings(settings: ToneSettingsInput): Promise<ToneSettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new ToneSettingsServiceError(
          'Please log in to save settings',
          401,
          'No active session'
        );
      }

      // Validate formality level
      if (settings.formality_level !== undefined) {
        if (settings.formality_level < 1 || settings.formality_level > 10) {
          throw new ToneSettingsServiceError(
            'Formality level must be between 1 and 10',
            400,
            'Invalid formality_level'
          );
        }
      }

      // Prepare data for upsert
      const dataToSave = {
        user_id: user.id,
        content_type: settings.content_type,
        tone_style: settings.tone_style ?? DEFAULT_TONE_SETTINGS[settings.content_type].tone_style,
        formality_level: settings.formality_level ?? DEFAULT_TONE_SETTINGS[settings.content_type].formality_level,
        emoji_usage: settings.emoji_usage ?? DEFAULT_TONE_SETTINGS[settings.content_type].emoji_usage,
        brand_voice_description: settings.brand_voice_description,
        sample_phrases: settings.sample_phrases || [],
        words_to_avoid: settings.words_to_avoid || [],
        preferred_keywords: settings.preferred_keywords || [],
        max_length_override: settings.max_length_override,
        include_cta: settings.include_cta ?? DEFAULT_TONE_SETTINGS[settings.content_type].include_cta,
        cta_style: settings.cta_style ?? DEFAULT_TONE_SETTINGS[settings.content_type].cta_style,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('user_tone_settings' as never)
        .upsert(dataToSave as never, {
          onConflict: 'user_id,content_type',
        } as never)
        .select()
        .single();

      if (error) {
        throw new ToneSettingsServiceError(
          'Failed to save tone settings',
          500,
          error.message
        );
      }

      return (data as ToneSettings) || dataToSave;
    } catch (error) {
      if (error instanceof ToneSettingsServiceError) {
        throw error;
      }

      throw new ToneSettingsServiceError(
        'Failed to save tone settings',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Reset tone settings for a content type to defaults
   *
   * @param contentType - The content type to reset
   */
  async resetToneSettings(contentType: ContentType): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new ToneSettingsServiceError(
          'Please log in to reset settings',
          401,
          'No active session'
        );
      }

      const { error } = await supabase
        .from('user_tone_settings' as never)
        .delete()
        .eq('user_id', user.id)
        .eq('content_type', contentType);

      if (error) {
        throw new ToneSettingsServiceError(
          'Failed to reset tone settings',
          500,
          error.message
        );
      }
    } catch (error) {
      if (error instanceof ToneSettingsServiceError) {
        throw error;
      }

      throw new ToneSettingsServiceError(
        'Failed to reset tone settings',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Reset all tone settings to defaults
   */
  async resetAllToneSettings(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new ToneSettingsServiceError(
          'Please log in to reset settings',
          401,
          'No active session'
        );
      }

      const { error } = await supabase
        .from('user_tone_settings' as never)
        .delete()
        .eq('user_id', user.id);

      if (error) {
        throw new ToneSettingsServiceError(
          'Failed to reset tone settings',
          500,
          error.message
        );
      }
    } catch (error) {
      if (error instanceof ToneSettingsServiceError) {
        throw error;
      }

      throw new ToneSettingsServiceError(
        'Failed to reset tone settings',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get default settings for a content type
   *
   * @param contentType - The content type
   * @returns Default tone settings
   */
  getDefaultSettings(contentType: ContentType): ToneSettings {
    return { ...DEFAULT_TONE_SETTINGS[contentType] };
  }

  /**
   * Validate tone settings input
   *
   * @param settings - Settings to validate
   * @returns True if valid
   */
  validateSettings(settings: ToneSettingsInput): boolean {
    const validContentTypes: ContentType[] = ['social', 'blog', 'video', 'email'];
    const validEmojiUsage: EmojiUsage[] = ['none', 'minimal', 'moderate', 'liberal'];
    const validCTAStyles: CTAStyle[] = ['soft', 'direct', 'question', 'none'];

    if (!validContentTypes.includes(settings.content_type)) {
      return false;
    }

    if (settings.formality_level !== undefined) {
      if (settings.formality_level < 1 || settings.formality_level > 10) {
        return false;
      }
    }

    if (settings.emoji_usage && !validEmojiUsage.includes(settings.emoji_usage)) {
      return false;
    }

    if (settings.cta_style && !validCTAStyles.includes(settings.cta_style)) {
      return false;
    }

    if (settings.max_length_override !== undefined && settings.max_length_override < 0) {
      return false;
    }

    return true;
  }
}

// Export singleton instance
export const toneSettingsService = new ToneSettingsService();

export default toneSettingsService;
