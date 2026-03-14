/**
 * Resolve the API key for a given provider and user.
 * Priority: user's own key (BYOK) -> platform key (env var)
 *
 * When using BYOK key, no credits are deducted for AI operations.
 * When using platform key, credits are deducted via the credit system.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface KeyResolution {
  key: string;
  source: 'byok' | 'platform';
  deductCredits: boolean;
}

export async function resolveAIKey(
  userId: string,
  provider: 'anthropic' | 'openai'
): Promise<KeyResolution> {
  // Try user's own key first
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data } = await supabase
    .from('user_settings')
    .select('ai_provider_keys')
    .eq('user_id', userId)
    .maybeSingle();

  const userKey = data?.ai_provider_keys?.[provider];
  if (userKey) {
    return { key: userKey, source: 'byok', deductCredits: false };
  }

  // Fall back to platform key
  const envKeyMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  };
  const platformKey = Deno.env.get(envKeyMap[provider]);
  if (platformKey) {
    return { key: platformKey, source: 'platform', deductCredits: true };
  }

  throw new Error(`No API key available for provider: ${provider}`);
}
