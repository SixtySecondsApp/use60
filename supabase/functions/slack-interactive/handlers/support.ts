/**
 * Support ticket Slack interactive handlers.
 *
 * Handles button clicks from support ticket Slack notifications:
 * - support_assign::<ticketId>   — assign ticket to the clicking user
 * - support_view::<ticketId>     — return a link to the ticket in the platform
 * - support_priority_urgent::<ticketId> — escalate priority to urgent
 * - support_priority_high::<ticketId>   — escalate priority to high
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || 'https://app.use60.com';

// =============================================================================
// Types
// =============================================================================

interface SupportHandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  responseText?: string;
  ephemeral?: boolean;
  error?: string;
}

interface InteractivePayload {
  user: {
    id: string;
    name?: string;
  };
  response_url?: string;
  message?: {
    ts: string;
  };
  channel?: {
    id: string;
  };
  team?: {
    id: string;
  };
}

// =============================================================================
// Helpers
// =============================================================================

function section(text: string) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text.substring(0, 3000),
    },
  };
}

function contextBlock(elements: string[]) {
  return {
    type: 'context',
    elements: elements.map((text) => ({
      type: 'mrkdwn',
      text: text.substring(0, 300),
    })),
  };
}

/**
 * Look up the Sixty user ID for a given Slack user via slack_user_mappings.
 * Returns null if no mapping is found.
 */
async function getSixtyUserId(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string,
  slackTeamId?: string
): Promise<string | null> {
  let query = supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId);

  if (slackTeamId) {
    const { data: orgSettings } = await supabase
      .from('slack_org_settings')
      .select('org_id')
      .eq('slack_team_id', slackTeamId)
      .maybeSingle();

    if (orgSettings?.org_id) {
      query = query.eq('org_id', orgSettings.org_id as string);
    }
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data?.sixty_user_id) {
    console.warn('[Support] No Sixty user mapping found for Slack user:', slackUserId);
    return null;
  }

  return data.sixty_user_id as string;
}

// =============================================================================
// Sub-handlers
// =============================================================================

/**
 * Assign the ticket to the clicking Slack user.
 * Maps Slack user -> Sixty user, updates support_tickets.
 */
async function handleAssign(
  ticketId: string,
  payload: InteractivePayload,
  supabase: ReturnType<typeof createClient>
): Promise<SupportHandleResult> {
  const userId = await getSixtyUserId(supabase, payload.user.id, payload.team?.id);

  if (!userId) {
    return {
      success: false,
      error: 'Could not identify your account. Please make sure your Slack account is linked in Sixty.',
      ephemeral: true,
    };
  }

  const { error } = await supabase
    .from('support_tickets')
    .update({ assigned_to: userId, status: 'in_progress' })
    .eq('id', ticketId);

  if (error) {
    console.error('[Support] Failed to assign ticket:', error);
    return {
      success: false,
      error: `Failed to assign ticket: ${error.message}`,
      ephemeral: true,
    };
  }

  return {
    success: true,
    responseBlocks: [
      section(`Ticket assigned to <@${payload.user.id}> and marked *In Progress*.`),
      contextBlock([`Ticket ID: ${ticketId}`]),
    ],
    responseText: 'Ticket assigned',
    ephemeral: true,
  };
}

/**
 * Return an ephemeral link to view the ticket in the platform.
 */
function handleView(
  ticketId: string,
  payload: InteractivePayload
): SupportHandleResult {
  const link = `${appUrl}/platform/support-tickets?ticket=${ticketId}`;

  return {
    success: true,
    responseBlocks: [
      section(`<${link}|View ticket in platform>`),
    ],
    responseText: 'View ticket',
    ephemeral: true,
  };
}

/**
 * Update the ticket priority (urgent or high).
 */
async function handlePriorityChange(
  ticketId: string,
  newPriority: 'urgent' | 'high',
  payload: InteractivePayload,
  supabase: ReturnType<typeof createClient>
): Promise<SupportHandleResult> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ priority: newPriority })
    .eq('id', ticketId);

  if (error) {
    console.error('[Support] Failed to update ticket priority:', error);
    return {
      success: false,
      error: `Failed to update priority: ${error.message}`,
      ephemeral: true,
    };
  }

  const label = newPriority === 'urgent' ? 'Urgent' : 'High';

  return {
    success: true,
    responseBlocks: [
      section(`Ticket priority set to *${label}* by <@${payload.user.id}>.`),
      contextBlock([`Ticket ID: ${ticketId}`]),
    ],
    responseText: `Priority set to ${label}`,
    ephemeral: true,
  };
}

// =============================================================================
// Main router
// =============================================================================

/**
 * Route a support_* action to the appropriate sub-handler.
 * Returns null if the action_id is not a support action.
 */
export async function handleSupportAction(
  actionId: string,
  payload: InteractivePayload
): Promise<SupportHandleResult | null> {
  if (!actionId.startsWith('support_')) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // support_assign::<ticketId>
    if (actionId.startsWith('support_assign::')) {
      const ticketId = actionId.slice('support_assign::'.length);
      if (!ticketId) {
        return { success: false, error: 'Invalid ticket ID in action', ephemeral: true };
      }
      return await handleAssign(ticketId, payload, supabase);
    }

    // support_view::<ticketId>
    if (actionId.startsWith('support_view::')) {
      const ticketId = actionId.slice('support_view::'.length);
      if (!ticketId) {
        return { success: false, error: 'Invalid ticket ID in action', ephemeral: true };
      }
      return handleView(ticketId, payload);
    }

    // support_priority_urgent::<ticketId>
    if (actionId.startsWith('support_priority_urgent::')) {
      const ticketId = actionId.slice('support_priority_urgent::'.length);
      if (!ticketId) {
        return { success: false, error: 'Invalid ticket ID in action', ephemeral: true };
      }
      return await handlePriorityChange(ticketId, 'urgent', payload, supabase);
    }

    // support_priority_high::<ticketId>
    if (actionId.startsWith('support_priority_high::')) {
      const ticketId = actionId.slice('support_priority_high::'.length);
      if (!ticketId) {
        return { success: false, error: 'Invalid ticket ID in action', ephemeral: true };
      }
      return await handlePriorityChange(ticketId, 'high', payload, supabase);
    }

    console.log('[Support] Unknown support action:', actionId);
    return null;
  } catch (err) {
    console.error('[Support] Unexpected error handling action:', actionId, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error processing support action',
      ephemeral: true,
    };
  }
}
