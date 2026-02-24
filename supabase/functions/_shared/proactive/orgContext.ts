/**
 * Proactive Context Loader
 *
 * Loads ALL personalization context for proactive notifications in one call:
 * - User profile (name, email, title)
 * - User writing style (tone, formality, directness, warmth, phrases, sign-offs)
 * - User tone settings (formality, emoji, CTA style, sign-off, words to avoid)
 * - Organization context (name, industry)
 *
 * All queries are best-effort with fallbacks — a missing table or row never blocks delivery.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface ProactiveWritingStyle {
  name: string;
  toneDescription: string;
  formality: number;       // 1-5
  directness: number;      // 1-5
  warmth: number;          // 1-5
  commonPhrases: string[];
  greetings: string[];
  signoffs: string[];
  preferredLength: string; // 'brief' | 'moderate' | 'detailed'
}

export interface ProactiveToneSettings {
  formalityLevel: number;
  emojiUsage: string;
  ctaStyle: string;
  emailSignOff: string;
  wordsToAvoid: string[];
}

export interface ProactiveContext {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    title?: string;
  };
  writingStyle: ProactiveWritingStyle | null;
  toneSettings: ProactiveToneSettings | null;
  org: {
    name: string;
    industry?: string;
  };
}

/**
 * Load all personalization context for a user + org.
 * Every query is wrapped in try/catch so a missing table never blocks the pipeline.
 */
export async function loadProactiveContext(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<ProactiveContext> {
  // Defaults
  const ctx: ProactiveContext = {
    user: { firstName: 'there', lastName: '', email: '' },
    writingStyle: null,
    toneSettings: null,
    org: { name: 'the team', industry: undefined },
  };

  // 1. User profile
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, stage')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      ctx.user.firstName = (profile as any).first_name || 'there';
      ctx.user.lastName = (profile as any).last_name || '';
      ctx.user.email = (profile as any).email || '';
      ctx.user.title = (profile as any).stage || undefined;
    }
  } catch (e) {
    console.warn('[orgContext] Failed to load profile:', (e as any)?.message);
  }

  // 2. User writing style (default style)
  try {
    const { data: style } = await supabase
      .from('user_writing_styles')
      .select('name, tone_description, style_metadata, source')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    if (style) {
      const meta = (style as any).style_metadata || {};
      ctx.writingStyle = {
        name: (style as any).name || 'Default',
        toneDescription: (style as any).tone_description || '',
        formality: meta.formality ?? 3,
        directness: meta.directness ?? 3,
        warmth: meta.warmth ?? 3,
        commonPhrases: Array.isArray(meta.common_phrases) ? meta.common_phrases : [],
        greetings: Array.isArray(meta.greetings) ? meta.greetings : [],
        signoffs: Array.isArray(meta.signoffs) ? meta.signoffs : [],
        preferredLength: meta.preferred_length || 'moderate',
      };
    }
  } catch (e) {
    console.warn('[orgContext] Failed to load writing style:', (e as any)?.message);
  }

  // 3. User tone settings (email content type)
  try {
    const { data: tone } = await supabase
      .from('user_tone_settings')
      .select('formality_level, emoji_usage, cta_style, email_sign_off, words_to_avoid')
      .eq('user_id', userId)
      .eq('content_type', 'email')
      .maybeSingle();

    if (tone) {
      ctx.toneSettings = {
        formalityLevel: (tone as any).formality_level ?? 3,
        emojiUsage: (tone as any).emoji_usage || 'none',
        ctaStyle: (tone as any).cta_style || 'direct',
        emailSignOff: (tone as any).email_sign_off || '',
        wordsToAvoid: Array.isArray((tone as any).words_to_avoid) ? (tone as any).words_to_avoid : [],
      };
    }
  } catch (e) {
    console.warn('[orgContext] Failed to load tone settings:', (e as any)?.message);
  }

  // 4. Organization
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, industry')
      .eq('id', orgId)
      .maybeSingle();

    if (org) {
      ctx.org.name = (org as any).name || 'the team';
      ctx.org.industry = (org as any).industry || undefined;
    }
  } catch (e) {
    console.warn('[orgContext] Failed to load org:', (e as any)?.message);
  }

  return ctx;
}
