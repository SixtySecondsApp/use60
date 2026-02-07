// supabase/functions/slack-events/index.ts
// Handles Slack Events API - URL verification and event routing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../_shared/cors.ts';
import { parseIntent, buildCapabilityList } from '../_shared/slackIntentParser.ts';

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: ReturnType<typeof createClient>,
  args: {
    orgId?: string | null
    userId?: string | null
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error'
    direction: 'inbound' | 'outbound'
    entityType: string
    entityId?: string | null
    entityName?: string | null
    status?: 'success' | 'failed' | 'skipped'
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    batchId?: string | null
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId ?? null,
      p_user_id: args.userId ?? null,
      p_integration_name: 'slack',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    })
  } catch (e) {
    console.error('[slack-events] Failed to log sync operation:', e)
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET');

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string
): Promise<boolean> {
  if (!slackSigningSecret) {
    // Allow opting into insecure mode for local development only.
    const allowInsecure = (Deno.env.get('ALLOW_INSECURE_SLACK_SIGNATURES') || '').toLowerCase() === 'true';
    if (allowInsecure) {
      console.warn('ALLOW_INSECURE_SLACK_SIGNATURES=true - skipping signature verification');
      return true;
    }
    console.error('SLACK_SIGNING_SECRET not set - refusing request');
    return false;
  }

  // Check timestamp to prevent replay attacks (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('Request timestamp too old');
    return false;
  }

  // Create signature base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Create HMAC SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(slackSigningSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sigBasestring)
  );

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signatureBytes));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const computedSignature = `v0=${hashHex}`;

  return computedSignature === signature;
}

/**
 * Handle Slack URL verification challenge
 */
function handleUrlVerification(payload: { challenge: string }) {
  console.log('Handling URL verification challenge');
  return new Response(
    JSON.stringify({ challenge: payload.challenge }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle incoming Slack events
 */
async function handleEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    [key: string]: unknown;
  },
  teamId: string
) {
  console.log(`Processing event type: ${event.type}`, { teamId });

  switch (event.type) {
    case 'app_home_opened':
      // User opened the app home tab
      console.log('App home opened by user:', event.user);
      // Future: Show personalized dashboard in app home
      break;

    case 'member_joined_channel':
      // Bot was added to a channel
      console.log('Member joined channel:', event.channel);
      break;

    case 'channel_archive':
      // A channel was archived - update our deal rooms if applicable
      if (event.channel) {
        const { data: archivedRoom, error } = await supabase
          .from('slack_deal_rooms')
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .eq('slack_channel_id', event.channel)
          .select('id, org_id, channel_name')
          .single();

        if (error) {
          console.error('Error updating deal room archive status:', error);
        } else if (archivedRoom) {
          await logSyncOperation(supabase, {
            orgId: archivedRoom.org_id,
            operation: 'webhook',
            direction: 'inbound',
            entityType: 'channel',
            entityId: event.channel as string,
            entityName: `#${archivedRoom.channel_name || event.channel} (archived)`,
            metadata: { team_id: teamId },
          });
        }
      }
      break;

    case 'channel_unarchive':
      // A channel was unarchived
      if (event.channel) {
        const { data: unarchivedRoom, error } = await supabase
          .from('slack_deal_rooms')
          .update({ is_archived: false, archived_at: null })
          .eq('slack_channel_id', event.channel)
          .select('id, org_id, channel_name')
          .single();

        if (error) {
          console.error('Error updating deal room unarchive status:', error);
        } else if (unarchivedRoom) {
          await logSyncOperation(supabase, {
            orgId: unarchivedRoom.org_id,
            operation: 'webhook',
            direction: 'inbound',
            entityType: 'channel',
            entityId: event.channel as string,
            entityName: `#${unarchivedRoom.channel_name || event.channel} (unarchived)`,
            metadata: { team_id: teamId },
          });
        }
      }
      break;

    case 'team_join':
      // A new user joined the workspace - try to auto-map them
      if (event.user && typeof event.user === 'object') {
        const user = event.user as {
          id: string;
          name?: string;
          real_name?: string;
          profile?: {
            email?: string;
            display_name?: string;
            image_72?: string;
          };
        };

        // Find orgs connected to this workspace
        const { data: orgSettings } = await supabase
          .from('slack_org_settings')
          .select('org_id')
          .eq('slack_team_id', teamId)
          .eq('is_connected', true);

        if (orgSettings && orgSettings.length > 0) {
          for (const org of orgSettings) {
            // Try to auto-match by email
            if (user.profile?.email) {
              const { data: sixtyUser } = await supabase
                .from('profiles')
                .select('id, email')
                .eq('email', user.profile.email)
                .single();

              const { error: upsertError } = await supabase.from('slack_user_mappings').upsert({
                org_id: org.org_id,
                slack_user_id: user.id,
                slack_username: user.name,
                slack_display_name: user.profile?.display_name || user.real_name,
                slack_email: user.profile?.email,
                slack_avatar_url: user.profile?.image_72,
                sixty_user_id: sixtyUser?.id || null,
                is_auto_matched: !!sixtyUser,
              }, {
                onConflict: 'org_id,slack_user_id',
              });

              if (!upsertError) {
                await logSyncOperation(supabase, {
                  orgId: org.org_id,
                  operation: 'webhook',
                  direction: 'inbound',
                  entityType: 'user',
                  entityId: user.id,
                  entityName: `${user.profile?.display_name || user.real_name || user.name} (${user.profile?.email || 'no email'})`,
                  metadata: {
                    team_id: teamId,
                    is_auto_matched: !!sixtyUser,
                  },
                });
              }
            }
          }
        }
      }
      break;

    case 'user_change':
      // A user's profile was updated - update our mapping
      if (event.user && typeof event.user === 'object') {
        const user = event.user as {
          id: string;
          name?: string;
          real_name?: string;
          profile?: {
            email?: string;
            display_name?: string;
            image_72?: string;
          };
        };

        const { error } = await supabase
          .from('slack_user_mappings')
          .update({
            slack_username: user.name,
            slack_display_name: user.profile?.display_name || user.real_name,
            slack_email: user.profile?.email,
            slack_avatar_url: user.profile?.image_72,
          })
          .eq('slack_user_id', user.id);

        if (error) {
          console.error('Error updating user mapping:', error);
        }
      }
      break;

    case 'message':
      // A message was posted - we might handle slash command responses here
      // For now, just log
      console.log('Message event received in channel:', event.channel);
      break;

    case 'app_mention':
      // SLACK-023: @60 mention — route to intent parser
      await handleAppMention(supabase, event, teamId);
      break;

    case 'reaction_added':
      // A reaction was added - potential future feature for task completion
      console.log('Reaction added:', {
        reaction: (event as { reaction?: string }).reaction,
        user: event.user,
        item: (event as { item?: unknown }).item,
      });
      break;

    default:
      console.log('Unhandled event type:', event.type);
  }
}

/**
 * SLACK-023: Handle @60 app_mention events
 * Parses the message, routes to the appropriate handler, and responds in-thread.
 */
async function handleAppMention(
  supabase: ReturnType<typeof createClient>,
  event: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    [key: string]: unknown;
  },
  teamId: string
) {
  const startTime = Date.now();
  const slackUserId = event.user;
  const channel = event.channel;
  const threadTs = event.thread_ts || event.ts;
  const text = event.text || '';

  if (!slackUserId || !channel) {
    console.warn('[slack-events] app_mention missing user or channel');
    return;
  }

  // Resolve Slack user to Sixty user
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('org_id, bot_access_token')
    .eq('slack_team_id', teamId)
    .eq('is_connected', true)
    .limit(1)
    .maybeSingle();

  if (!orgSettings?.bot_access_token) {
    console.warn('[slack-events] No connected org for team:', teamId);
    return;
  }

  const botToken = orgSettings.bot_access_token;
  const orgId = orgSettings.org_id;

  // Resolve user
  const { data: userMapping } = await supabase
    .from('slack_user_mappings')
    .select('sixty_user_id')
    .eq('org_id', orgId)
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (!userMapping?.sixty_user_id) {
    await postSlackMessage(botToken, channel, threadTs,
      'Please link your Slack account first in Settings > Slack > Personal Slack.');
    return;
  }

  const userId = userMapping.sixty_user_id;

  // SLACK-028: Rate limiting (max 20 commands per user per hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { count: recentCommands } = await supabase
    .from('slack_command_analytics')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo.toISOString());

  if ((recentCommands || 0) >= 20) {
    await postSlackMessage(botToken, channel, threadTs,
      "You've reached the limit of 20 commands per hour. Please try again later.");
    return;
  }

  // Parse intent
  const result = parseIntent(text);
  let responseText = '';
  let success = true;

  try {
    if (!result.intent || result.intent.type === 'help') {
      // SLACK-027: Fallback handler with capability list
      responseText = buildCapabilityList();
    } else {
      // Route to handlers
      switch (result.intent.type) {
        case 'today':
          responseText = "I'm pulling up your day... Check your DM for the full brief, or use `/sixty today` for an instant snapshot.";
          // Trigger morning brief edge function for this user (async)
          break;

        case 'pipeline_summary':
          responseText = "Checking your pipeline... Use `/sixty pipeline` for the full summary.";
          break;

        case 'prep_meeting':
          responseText = `Got it — prepping you for your ${result.intent.meetingName ? `meeting with ${result.intent.meetingName}` : 'next meeting'}. Check your DM shortly.`;
          break;

        case 'follow_up': {
          const target = result.intent.contactName || result.intent.dealName || 'your contact';
          responseText = `Drafting a follow-up for *${target}*... I'll send you a preview via DM for approval.`;
          break;
        }

        case 'deal_summary': {
          const dealName = result.intent.dealName || 'your deal';
          // Search for the deal
          const { data: deals } = await supabase
            .from('deals')
            .select('id, title, value, stage, close_date, health_status')
            .eq('owner_id', userId)
            .ilike('title', `%${result.intent.dealName}%`)
            .limit(3);

          if (deals && deals.length === 1) {
            const d = deals[0];
            responseText = `*${d.title}*\nStage: ${d.stage} | Value: ${d.value || 'N/A'} | Health: ${d.health_status || 'unknown'}\n<${APP_URL}/deals/${d.id}|View in app>`;
          } else if (deals && deals.length > 1) {
            const list = deals.map(d => `• *${d.title}* — ${d.stage}`).join('\n');
            responseText = `Found ${deals.length} deals matching "${dealName}":\n${list}\n\nBe more specific or use \`/sixty deal [name]\`.`;
          } else {
            responseText = `I couldn't find a deal matching "${dealName}". Try \`/sixty deal [name]\`.`;
          }
          break;
        }

        case 'add_to_campaign': {
          responseText = await handleAddToCampaign(supabase, orgId, userId, result.intent);
          break;
        }

        case 'find_contacts': {
          responseText = await handleFindContacts(supabase, orgId, userId, result.intent);
          break;
        }

        case 'focus':
          responseText = "Analyzing your priorities... Check your DM for today's focus items.";
          break;

        default:
          responseText = buildCapabilityList();
      }
    }

    // Respond in-thread
    await postSlackMessage(botToken, channel, threadTs, responseText);
  } catch (err) {
    console.error('[slack-events] Error handling app_mention:', err);
    success = false;
    await postSlackMessage(botToken, channel, threadTs,
      'Sorry, something went wrong. Please try again or use `/sixty help`.');
  }

  // SLACK-028: Log analytics
  const responseTimeMs = Date.now() - startTime;
  try {
    await supabase.from('slack_command_analytics').insert({
      user_id: userId,
      org_id: orgId,
      command_type: 'app_mention',
      intent: result.intent?.type || 'unknown',
      raw_text: text.substring(0, 500),
      response_time_ms: responseTimeMs,
      success,
    });
  } catch {
    // Non-critical
  }
}

const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';
const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1';

/**
 * SLACK-025: Handle "add to campaign" command.
 * Searches for the contact in the CRM, finds the campaign in Instantly, and adds the lead.
 */
async function handleAddToCampaign(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  intent: { type: 'add_to_campaign'; contactName?: string; campaignName?: string }
): Promise<string> {
  const contactQuery = intent.contactName || '';
  const campaignQuery = intent.campaignName || '';

  if (!contactQuery) {
    return 'Please specify a contact. Example: `@60 add john@acme.com to AI Round Table`';
  }
  if (!campaignQuery) {
    return `Please specify a campaign name. Example: \`@60 add ${contactQuery} to [campaign name]\``;
  }

  // 1. Try to resolve the contact — check if it's an email first, then search by name
  const isEmail = contactQuery.includes('@');

  let contactEmail: string | null = null;
  let contactDisplayName = contactQuery;

  if (isEmail) {
    contactEmail = contactQuery;
  } else {
    // Search contacts table by name
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('owner_id', userId)
      .or(`first_name.ilike.%${contactQuery}%,last_name.ilike.%${contactQuery}%,email.ilike.%${contactQuery}%`)
      .limit(5);

    if (contacts && contacts.length === 1) {
      contactEmail = contacts[0].email;
      contactDisplayName = `${contacts[0].first_name || ''} ${contacts[0].last_name || ''}`.trim() || contactQuery;
    } else if (contacts && contacts.length > 1) {
      const list = contacts.map(c => {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
        return `• ${name} (${c.email || 'no email'})`;
      }).join('\n');
      return `Found ${contacts.length} contacts matching "${contactQuery}":\n${list}\n\nBe more specific or use the email directly: \`@60 add email@example.com to ${campaignQuery}\``;
    } else {
      return `I couldn't find a contact matching "${contactQuery}" in your CRM. Try using their email: \`@60 add email@example.com to ${campaignQuery}\``;
    }
  }

  if (!contactEmail) {
    return `No email found for "${contactDisplayName}". Try using their email directly.`;
  }

  // 2. Get Instantly API key
  let instantlyApiKey: string | null = null;

  const { data: instantlyCreds } = await supabase
    .from('instantly_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  instantlyApiKey = instantlyCreds?.api_key || null;

  if (!instantlyApiKey) {
    const { data: integration } = await supabase
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'instantly')
      .maybeSingle();

    instantlyApiKey = (integration?.credentials as Record<string, string>)?.api_key || null;
  }

  if (!instantlyApiKey) {
    return 'Instantly is not configured for your organization. Please add your API key in Settings > Integrations.';
  }

  // 3. Find the campaign by name
  let campaignId: string | null = null;
  let campaignName = campaignQuery;
  try {
    const listRes = await fetch(
      `${INSTANTLY_API_BASE}/campaign/list?api_key=${encodeURIComponent(instantlyApiKey)}&limit=100`,
      { method: 'GET' }
    );

    if (!listRes.ok) {
      console.error('[slack-events] Instantly campaign/list error:', listRes.status);
      return 'Error fetching campaigns from Instantly. Please try again later.';
    }

    const campaigns = await listRes.json();

    if (Array.isArray(campaigns)) {
      // Fuzzy match: case-insensitive substring
      const match = campaigns.find((c: { id: string; name: string }) =>
        c.name.toLowerCase().includes(campaignQuery.toLowerCase())
      );
      if (match) {
        campaignId = match.id;
        campaignName = match.name;
      }
    }
  } catch (err) {
    console.error('[slack-events] Error listing Instantly campaigns:', err);
    return 'Error fetching campaigns from Instantly. Please try again later.';
  }

  if (!campaignId) {
    return `I couldn't find a campaign matching "${campaignQuery}" in Instantly. Check the campaign name and try again.`;
  }

  // 4. Add the lead to the campaign
  try {
    const pushRes = await fetch(`${INSTANTLY_API_BASE}/lead/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: instantlyApiKey,
        campaign_id: campaignId,
        skip_if_in_workspace: false,
        leads: [{
          email: contactEmail,
          first_name: isEmail ? undefined : contactQuery.split(' ')[0],
          last_name: isEmail ? undefined : contactQuery.split(' ').slice(1).join(' ') || undefined,
        }],
      }),
    });

    if (!pushRes.ok) {
      const errBody = await pushRes.text();
      console.error('[slack-events] Instantly lead/add error:', pushRes.status, errBody);
      if (pushRes.status === 429) {
        return 'Instantly rate limit exceeded. Please wait a moment and try again.';
      }
      return `Failed to add the lead to Instantly (${pushRes.status}). Please try again.`;
    }

    return `Added *${contactDisplayName}* (${contactEmail}) to the *${campaignName}* campaign in Instantly.`;
  } catch (err) {
    console.error('[slack-events] Error adding lead to Instantly:', err);
    return 'Something went wrong adding the lead. Please try again.';
  }
}

/**
 * SLACK-026: Handle "find contacts like X" command.
 * Calls the apollo-search edge function server-to-server and returns formatted results.
 */
async function handleFindContacts(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  intent: { type: 'find_contacts'; query: string; count?: number }
): Promise<string> {
  const query = intent.query || '';
  const count = Math.min(intent.count || 10, 25); // Cap at 25 for Slack readability

  if (!query) {
    return 'Please specify what contacts you\'re looking for. Example: `@60 find 10 contacts like VP Engineering at fintech`';
  }

  // Get Apollo API key
  const { data: integration } = await supabase
    .from('integration_credentials')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('provider', 'apollo')
    .maybeSingle();

  const apolloApiKey = (integration?.credentials as Record<string, string>)?.api_key
    || Deno.env.get('APOLLO_API_KEY');

  if (!apolloApiKey) {
    return 'Apollo is not configured for your organization. Please add your API key in Settings > Integrations.';
  }

  // Parse the natural language query into Apollo search params
  const searchParams = parseQueryToApolloParams(query, count);

  // Call Apollo API directly (server-to-server, no auth needed for our own API key)
  try {
    const apolloPayload: Record<string, unknown> = {
      api_key: apolloApiKey,
      per_page: count,
      page: 1,
      ...searchParams,
    };

    const apolloResponse = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apolloPayload),
    });

    if (!apolloResponse.ok) {
      if (apolloResponse.status === 429) {
        return 'Apollo rate limit exceeded. Please wait a moment and try again.';
      }
      const errText = await apolloResponse.text();
      console.error('[slack-events] Apollo API error:', apolloResponse.status, errText);
      return `Apollo search failed (${apolloResponse.status}). Please try again.`;
    }

    const data = await apolloResponse.json();
    const people = (data.people || []) as Record<string, unknown>[];
    const totalResults = (data.pagination?.total_entries as number) || 0;

    if (people.length === 0) {
      return `No contacts found matching "${query}". Try broadening your search criteria.`;
    }

    // Format results for Slack
    const lines: string[] = [
      `Found *${totalResults.toLocaleString()}* contacts matching "${query}" — here are the top ${people.length}:`,
      '',
    ];

    for (const person of people) {
      const name = (person.name as string) || `${person.first_name || ''} ${person.last_name || ''}`.trim();
      const title = (person.title as string) || (person.headline as string) || '';
      const company = (person.organization_name as string) || '';
      const linkedin = (person.linkedin_url as string) || '';

      let line = `• *${name}*`;
      if (title) line += ` — ${title}`;
      if (company) line += ` at ${company}`;
      if (linkedin) line += ` (<${linkedin}|LinkedIn>)`;

      lines.push(line);
    }

    if (totalResults > people.length) {
      lines.push('');
      lines.push(`_${totalResults - people.length} more results available. Use Apollo Search in the app for the full list._`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[slack-events] Error in Apollo search:', err);
    return 'Something went wrong with the search. Please try again.';
  }
}

/**
 * Parse a natural language query into Apollo search parameters.
 * Examples:
 *   "VP Engineering at fintech" → { person_titles: ["VP Engineering"], q_keywords: "fintech" }
 *   "CTOs in San Francisco" → { person_titles: ["CTO"], person_locations: ["San Francisco"] }
 *   "similar to Sarah Chen" → { q_keywords: "Sarah Chen" }
 */
function parseQueryToApolloParams(
  query: string,
  _count: number
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Extract "at [company/industry]" pattern
  const atMatch = query.match(/\bat\s+(.+)$/i);
  if (atMatch) {
    params.q_keywords = atMatch[1].trim();
    query = query.replace(atMatch[0], '').trim();
  }

  // Extract "in [location]" pattern
  const inMatch = query.match(/\bin\s+(.+?)(?:\s+at\s+|$)/i);
  if (inMatch) {
    params.person_locations = [inMatch[1].trim()];
    query = query.replace(inMatch[0], '').trim();
  }

  // Extract "like [person]" or "similar to [person]" pattern
  const likeMatch = query.match(/(?:like|similar\s+to)\s+(.+)/i);
  if (likeMatch) {
    // Use the person name as a keyword search
    params.q_keywords = likeMatch[1].trim();
    query = query.replace(likeMatch[0], '').trim();
  }

  // Remaining text is likely a title/role
  const cleaned = query
    .replace(/\b\d+\s*(?:contacts?|people|leads?)\b/i, '')
    .replace(/\b(?:me|find|search|get|look\s+for)\b/gi, '')
    .trim();

  if (cleaned) {
    params.person_titles = [cleaned];
  }

  return params;
}

/**
 * Post a message to a Slack channel (optionally in-thread)
 */
async function postSlackMessage(
  botToken: string,
  channel: string,
  threadTs?: string,
  text?: string
): Promise<void> {
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text: text || 'Working on it...',
        thread_ts: threadTs,
        mrkdwn: true,
      }),
    });
  } catch (err) {
    console.error('[slack-events] Error posting message:', err);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();

    // Verify Slack signature
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    if (!await verifySlackRequest(body, timestamp, signature)) {
      console.error('Invalid Slack signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(body);
    console.log('Received Slack event:', { type: payload.type });

    // Handle URL verification (required by Slack when setting up Events API)
    if (payload.type === 'url_verification') {
      return handleUrlVerification(payload);
    }

    // Initialize Supabase client for all other operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle event callbacks
    if (payload.type === 'event_callback') {
      const { event, team_id } = payload;

      if (!event) {
        return new Response(
          JSON.stringify({ error: 'No event in payload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Respond immediately to Slack (they expect response within 3 seconds)
      // Process event asynchronously
      const responsePromise = handleEvent(supabase, event, team_id);

      // Don't await - respond immediately
      responsePromise.catch((err) => {
        console.error('Error processing event:', err);
      });

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown payload type
    console.warn('Unknown payload type:', payload.type);
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing Slack event:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
