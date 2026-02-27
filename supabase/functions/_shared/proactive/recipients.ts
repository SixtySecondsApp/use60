/**
 * Recipient Resolution
 * 
 * Resolves Slack user mappings and filters recipients based on org settings.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface Recipient {
  userId: string;
  slackUserId: string;
  email?: string;
  name?: string;
}

/**
 * Get Slack user mappings for an org
 */
export async function getSlackRecipients(
  supabase: SupabaseClient,
  orgId: string
): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from('slack_user_mappings')
    .select(`
      sixty_user_id,
      slack_user_id,
      profiles:sixty_user_id (
        email,
        full_name
      )
    `)
    .eq('org_id', orgId)
    .not('sixty_user_id', 'is', null)
    .not('slack_user_id', 'is', null);

  if (error || !data) {
    return [];
  }

  return data
    .filter(mapping => mapping.sixty_user_id && mapping.slack_user_id)
    .map(mapping => ({
      userId: mapping.sixty_user_id,
      slackUserId: mapping.slack_user_id,
      email: (mapping.profiles as any)?.email,
      name: (mapping.profiles as any)?.full_name,
    }));
}

/**
 * Get Slack user mapping for a specific user
 */
export async function getSlackRecipient(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<Recipient | null> {
  const { data, error } = await supabase
    .from('slack_user_mappings')
    .select(`
      sixty_user_id,
      slack_user_id,
      profiles:sixty_user_id (
        email,
        full_name
      )
    `)
    .eq('org_id', orgId)
    .eq('sixty_user_id', userId)
    .maybeSingle();

  if (error || !data || !data.slack_user_id) {
    return null;
  }

  return {
    userId: data.sixty_user_id,
    slackUserId: data.slack_user_id,
    email: (data.profiles as any)?.email,
    name: (data.profiles as any)?.full_name,
  };
}
