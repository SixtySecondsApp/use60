// supabase/functions/slack-deal-room/index.ts
// Creates private Slack deal room channels when deals meet criteria

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { buildDealRoomWelcomeMessage, type DealRoomData } from '../_shared/slackBlocks.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

interface DealData {
  id: string;
  title: string;
  stage: string;
  value: number;
  monthly_value?: number;
  win_probability?: number;
  user_id: string;
  org_id?: string;
  company_id?: string;
  company?: {
    id: string;
    name: string;
    industry?: string;
    size?: string;
  };
  contacts?: Array<{
    id: string;
    name: string;
    title?: string;
    is_decision_maker?: boolean;
  }>;
}

interface DealRoomSettings {
  enabled: boolean;
  valueThreshold: number;
  stageThreshold: string;
  stakeholderSlackIds: string[];
}

type DealRoomRequest = {
  dealId?: string;
  orgId?: string;
  previousStage?: string;
  previousValue?: number;
  isTest?: boolean;
  inviteSlackUserIds?: string[];
  managerUserId?: string;
  managerSlackUserId?: string;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Resolve a human-meaningful deal value across schema variants.
 *
 * Some orgs use revenue model fields (monthly_mrr / one_off_revenue / annual_value)
 * and may leave deals.value as 0. For Slack display + threshold logic we prefer:
 * - explicit deals.value if > 0
 * - otherwise computed annual value (12×MRR + one-off)
 * - otherwise annual_value (stored LTV / lifetime)
 * - otherwise computed LTV (3×MRR + one-off)
 */
function resolveDealValue(dealLike: {
  value?: unknown;
  one_off_revenue?: unknown;
  monthly_mrr?: unknown;
  annual_value?: unknown;
}): number {
  const base = toNumber(dealLike.value);
  const oneOff = toNumber(dealLike.one_off_revenue);
  const monthly = toNumber(dealLike.monthly_mrr);
  const annual = toNumber(dealLike.annual_value);

  const computedAnnual = (monthly * 12) + oneOff;
  const computedLtv = (monthly * 3) + oneOff;

  const candidates = [base, computedAnnual, annual, computedLtv].filter((v) => v > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

async function getOrgMoneyConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ currencyCode: string; currencyLocale: string }> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('currency_code, currency_locale')
      .eq('id', orgId)
      .single();

    const currencyCode = ((data as any)?.currency_code as string | null | undefined) || 'GBP';
    const currencyLocale =
      ((data as any)?.currency_locale as string | null | undefined) ||
      (currencyCode === 'USD'
        ? 'en-US'
        : currencyCode === 'EUR'
          ? 'en-IE'
          : currencyCode === 'AUD'
            ? 'en-AU'
            : currencyCode === 'CAD'
              ? 'en-CA'
              : 'en-GB');

    return { currencyCode: currencyCode.toUpperCase(), currencyLocale };
  } catch {
    return { currencyCode: 'GBP', currencyLocale: 'en-GB' };
  }
}

function formatMoney(value: number, currencyCode: string, currencyLocale: string): string {
  try {
    return new Intl.NumberFormat(currencyLocale || 'en-GB', {
      style: 'currency',
      currency: (currencyCode || 'GBP').toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

async function getOwnerDisplayName(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email')
    .eq('id', userId)
    .single();

  if (!data) return undefined;

  const full = (data as any).full_name as string | null | undefined;
  if (full) return full;
  const first = (data as any).first_name as string | null | undefined;
  const last = (data as any).last_name as string | null | undefined;
  const combined = `${first || ''} ${last || ''}`.trim();
  if (combined) return combined;
  const email = (data as any).email as string | null | undefined;
  return email || undefined;
}

/**
 * Generate a Slack-safe channel name
 */
function generateChannelName(companyName: string, dealId: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  const shortId = dealId.substring(0, 4);
  return `deal-${slug}-${shortId}`;
}

/**
 * Get deal room settings for org
 */
async function getDealRoomSettings(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<DealRoomSettings | null> {
  // Get org Slack connection
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();

  if (!orgSettings?.bot_access_token) {
    return null;
  }

  // Get deal room feature settings
  const { data: featureSettings } = await supabase
    .from('slack_notification_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('feature', 'deal_rooms')
    .eq('is_enabled', true)
    .single();

  if (!featureSettings) {
    return null;
  }

  return {
    enabled: true,
    valueThreshold: featureSettings.deal_value_threshold || 25000,
    stageThreshold: featureSettings.deal_stage_threshold || 'opportunity',
    stakeholderSlackIds: featureSettings.stakeholder_slack_ids || [],
  };
}

/**
 * Get Slack user ID for a Sixty user
 */
async function getSlackUserId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  sixtyUserId: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', sixtyUserId)
    .single();

  return data?.slack_user_id;
}

/**
 * Get Slack bot token for org
 */
async function getSlackBotToken(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();

  return data?.bot_access_token || null;
}

/**
 * Create a private Slack channel
 */
async function createSlackChannel(
  botToken: string,
  channelName: string
): Promise<{ ok: boolean; channel?: { id: string; name: string }; error?: string }> {
  const response = await fetch('https://slack.com/api/conversations.create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: channelName,
      is_private: true,
    }),
  });

  return response.json();
}

/**
 * Invite users to a Slack channel
 */
async function inviteToChannel(
  botToken: string,
  channelId: string,
  userIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('https://slack.com/api/conversations.invite', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      users: userIds.join(','),
    }),
  });

  return response.json();
}

/**
 * Post message to Slack channel
 */
async function postToChannel(
  botToken: string,
  channelId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  return response.json();
}

/**
 * Set channel topic
 */
async function setChannelTopic(
  botToken: string,
  channelId: string,
  topic: string
): Promise<void> {
  await fetch('https://slack.com/api/conversations.setTopic', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      topic,
    }),
  });
}

/**
 * Check if deal should trigger room creation
 */
function shouldCreateRoom(
  deal: DealData,
  settings: DealRoomSettings,
  previousStage?: string,
  previousValue?: number
): boolean {
  const stageOrder = ['sql', 'opportunity', 'verbal', 'signed'];
  const stageIndex = stageOrder.indexOf(deal.stage.toLowerCase());
  const thresholdIndex = stageOrder.indexOf(settings.stageThreshold.toLowerCase());

  const meetsStageThreshold = stageIndex >= thresholdIndex && thresholdIndex >= 0;
  const meetsValueThreshold = deal.value >= settings.valueThreshold;

  // Check if this is a new trigger (stage or value just crossed threshold)
  if (previousStage !== undefined) {
    const previousStageIndex = stageOrder.indexOf(previousStage.toLowerCase());
    const wasUnderStageThreshold = previousStageIndex < thresholdIndex;
    const stageJustCrossed = wasUnderStageThreshold && meetsStageThreshold;

    if (stageJustCrossed && meetsValueThreshold) {
      return true;
    }
  }

  if (previousValue !== undefined) {
    const wasUnderValueThreshold = previousValue < settings.valueThreshold;
    const valueJustCrossed = wasUnderValueThreshold && meetsValueThreshold;

    if (valueJustCrossed && meetsStageThreshold) {
      return true;
    }
  }

  // If no previous values, check if both thresholds are met
  if (previousStage === undefined && previousValue === undefined) {
    return meetsStageThreshold && meetsValueThreshold;
  }

  return false;
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = (await req.json().catch(() => ({}))) as DealRoomRequest;
    const dealId = body.dealId;
    const orgId = body.orgId;
    const previousStage = body.previousStage;
    const previousValue = body.previousValue;
    const isTest = !!body.isTest;
    const inviteSlackUserIds = Array.isArray(body.inviteSlackUserIds) ? body.inviteSlackUserIds.filter(Boolean) : [];
    const managerUserId = body.managerUserId;
    const managerSlackUserId = body.managerSlackUserId;

    if (!dealId && !isTest) {
      return new Response(
        JSON.stringify({ error: 'dealId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);

    let deal: DealData | null = null;

    // Test mode: use sample data instead of real deal lookup
    if (isTest && (!dealId || dealId === 'test-deal-id')) {
      // Create sample deal data for testing
      deal = {
        id: 'test-deal-' + Date.now(),
        title: 'Acme Corp Enterprise License',
        stage: 'opportunity',
        value: 75000,
        monthly_value: 5000,
        win_probability: 65,
        user_id: auth.userId || 'test-user',
        org_id: orgId,
        company_id: 'test-company',
        company: {
          id: 'test-company',
          name: 'Acme Corporation',
          industry: 'Technology',
          size: '500-1000',
        },
        contacts: [
          { id: 'c1', name: 'Sarah Johnson', title: 'VP of Sales', is_decision_maker: true },
          { id: 'c2', name: 'Mike Chen', title: 'Sales Director', is_decision_maker: false },
        ],
      };
    } else {
      // Fetch real deal data.
      // Deal schemas differ across environments; try the "new" schema first, then fall back.
      const tryNewSchema = async (): Promise<DealData | null> => {
        const { data: dealData, error: dealError } = await supabase
          .from('deals')
          .select(`
            id,
            title,
            stage,
            value,
            monthly_value,
            win_probability,
            user_id,
            org_id,
            company_id,
            primary_contact_id,
            companies:company_id (
              id,
              name,
              industry,
              size
            ),
            primary_contact:primary_contact_id (
              id,
              full_name,
              first_name,
              last_name,
              title,
              is_decision_maker
            )
          `)
          .eq('id', dealId)
          .single();

        if (dealError || !dealData) return null;

        const primaryContact = (dealData as any).primary_contact as any;
        return {
          ...(dealData as any),
          title: (dealData as any).title,
          stage: (dealData as any).stage,
          user_id: (dealData as any).user_id,
          org_id: (dealData as any).org_id,
          company_id: (dealData as any).company_id,
          company: (dealData as any).companies || null,
          contacts: primaryContact
            ? [
                {
                  id: primaryContact.id,
                  name:
                    primaryContact.full_name ||
                    `${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() ||
                    'Unknown',
                  title: primaryContact.title,
                  is_decision_maker: primaryContact.is_decision_maker,
                },
              ]
            : [],
        } as DealData;
      };

      const tryLegacySchema = async (): Promise<DealData | null> => {
        const { data: legacy, error: legacyErr } = await supabase
          .from('deals')
          .select(
            'id, name, company, contact_name, contact_email, value, one_off_revenue, monthly_mrr, annual_value, probability, owner_id, stage_id, deal_stages:stage_id(name)'
          )
          .eq('id', dealId)
          .single();

        if (legacyErr || !legacy) return null;

        const stageName = (legacy as any).deal_stages?.name || null;
        const contactName = (legacy as any).contact_name || null;
        const companyName = (legacy as any).company || null;
        const resolvedValue = resolveDealValue(legacy as any);

        return {
          id: legacy.id,
          title: (legacy as any).name,
          stage: stageName || 'sql',
          value: resolvedValue,
          win_probability: (legacy as any).probability ?? undefined,
          user_id: (legacy as any).owner_id,
          org_id: orgId,
          company: companyName ? { id: 'legacy-company', name: companyName } : { id: 'legacy-company', name: 'Unknown Company' },
          contacts: contactName
            ? [
                {
                  id: 'legacy-contact',
                  name: contactName,
                },
              ]
            : [],
        } as DealData;
      };

      const newDeal = await tryNewSchema();
      const legacyDeal = newDeal ? null : await tryLegacySchema();
      deal = newDeal || legacyDeal;

      if (!deal) {
        return new Response(
          JSON.stringify({ error: 'Deal not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const effectiveOrgId = orgId || deal.org_id;
    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: 'Org ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // External release hardening: only org admins (or platform admins) can create deal rooms.
    if (auth.mode === 'user' && auth.userId && !auth.isPlatformAdmin) {
      await requireOrgRole(supabase, effectiveOrgId, auth.userId, ['owner', 'admin']);
    }

    const dealKey = dealId || deal.id;

    // Check if deal room already exists
    const { data: existingRoom } = await supabase
      .from('slack_deal_rooms')
      .select('id, slack_channel_id, slack_channel_name')
      .eq('deal_id', dealKey)
      .eq('is_archived', false)
      .single();

    if (existingRoom) {
      // In test mode, we still want to validate who would be invited (owner + manager + extras),
      // so we "ensure invites" on the existing channel.
      if (!isTest) {
        console.log('Deal room already exists:', existingRoom.slack_channel_name);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Deal room already exists',
            channelId: existingRoom.slack_channel_id,
            channelName: existingRoom.slack_channel_name,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const botToken = await getSlackBotToken(supabase, effectiveOrgId);
      if (!botToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'No Slack bot token' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const ownerSlackId = await getSlackUserId(supabase, effectiveOrgId, deal.user_id);
      const managerSlackId =
        managerSlackUserId ||
        (managerUserId ? await getSlackUserId(supabase, effectiveOrgId, managerUserId) : undefined);

      const usersToInvite = [
        ...(ownerSlackId ? [ownerSlackId] : []),
        ...(managerSlackId ? [managerSlackId] : []),
        ...inviteSlackUserIds,
      ];
      const uniqueUsers = [...new Set(usersToInvite)].filter(Boolean);

      if (uniqueUsers.length > 0) {
        const inviteResult = await inviteToChannel(botToken, existingRoom.slack_channel_id, uniqueUsers);
        if (!inviteResult.ok && inviteResult.error !== 'already_in_channel') {
          return new Response(
            JSON.stringify({
              success: false,
              error: inviteResult.error || 'Failed to invite users',
              channelId: existingRoom.slack_channel_id,
              channelName: existingRoom.slack_channel_name,
              invitedSlackUserIds: uniqueUsers,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Test mode convenience: refresh topic + re-post the current snapshot message
      // so you can verify the latest formatting/mapping without deleting the channel.
      try {
        const money = await getOrgMoneyConfig(supabase, effectiveOrgId);
        const topic = `💰 ${deal.title} | ${formatMoney(deal.value, money.currencyCode, money.currencyLocale)} | Stage: ${deal.stage}`;
        await setChannelTopic(botToken, existingRoom.slack_channel_id, topic);

        const ownerName = await getOwnerDisplayName(supabase, deal.user_id);
        const contacts = deal.contacts || [];
        const money2 = money;
        const dealRoomData: DealRoomData = {
          dealName: deal.title,
          dealId: deal.id,
          dealValue: deal.value,
          dealStage: deal.stage,
          currencyCode: money2.currencyCode,
          currencyLocale: money2.currencyLocale,
          ownerName,
          ownerSlackUserId: ownerSlackId,
          winProbability: deal.win_probability,
          companyName: (deal.company as { name?: string })?.name || ((deal as any).companies as { name?: string } | undefined)?.name,
          companyIndustry: (deal.company as { industry?: string })?.industry || ((deal as any).companies as { industry?: string } | undefined)?.industry,
          companySize: (deal.company as { size?: string })?.size || ((deal as any).companies as { size?: string } | undefined)?.size,
          keyContacts: contacts.map((c: any) => ({
            name: c.name,
            title: c.title,
            isDecisionMaker: c.is_decision_maker,
          })),
          appUrl,
        };

        const welcomeMessage = buildDealRoomWelcomeMessage(dealRoomData);
        await postToChannel(botToken, existingRoom.slack_channel_id, welcomeMessage);
      } catch (err) {
        console.warn('Test-mode refresh failed:', err);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Deal room already exists (ensured invites)',
          channelId: existingRoom.slack_channel_id,
          channelName: existingRoom.slack_channel_name,
          invitedSlackUserIds: uniqueUsers,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get deal room settings.
    // In test mode, bypass "enabled" + threshold gating so you can validate channel membership immediately.
    const settings: DealRoomSettings | null = isTest
      ? { enabled: true, valueThreshold: 0, stageThreshold: 'sql', stakeholderSlackIds: [] }
      : await getDealRoomSettings(supabase, effectiveOrgId);

    if (!settings) {
      return new Response(
        JSON.stringify({ success: false, message: 'Deal rooms not enabled for org (enable feature deal_rooms)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isTest) {
      // Check if deal meets criteria
      if (!shouldCreateRoom(deal, settings, previousStage, previousValue)) {
        console.log('Deal does not meet room creation criteria');
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Deal does not meet room creation criteria',
            criteria: {
              valueThreshold: settings.valueThreshold,
              stageThreshold: settings.stageThreshold,
              currentValue: deal.value,
              currentStage: deal.stage,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get Slack bot token
    const botToken = await getSlackBotToken(supabase, effectiveOrgId);
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, message: 'No Slack bot token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate channel name
    const companyName =
      (deal.company as { name?: string } | undefined)?.name ||
      ((deal as any).companies as { name?: string } | undefined)?.name ||
      deal.title ||
      'unknown';
    const channelName = generateChannelName(companyName, deal.id);

    // Create the channel
    console.log('Creating Slack channel:', channelName);
    const createResult = await createSlackChannel(botToken, channelName);

    if (!createResult.ok) {
      // Handle name_taken error by appending timestamp
      if (createResult.error === 'name_taken') {
        const timestamp = Date.now().toString().slice(-4);
        const retryName = `${channelName}-${timestamp}`;
        const retryResult = await createSlackChannel(botToken, retryName);

        if (!retryResult.ok) {
          console.error('Failed to create channel (retry):', retryResult.error);
          return new Response(
            JSON.stringify({ success: false, error: retryResult.error }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        createResult.channel = retryResult.channel;
      } else {
        console.error('Failed to create channel:', createResult.error);
        return new Response(
          JSON.stringify({ success: false, error: createResult.error }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const channelId = createResult.channel!.id;
    const actualChannelName = createResult.channel!.name;

    // Collect users to invite
    const usersToInvite: string[] = [];

    // 1. Deal owner (required)
    const ownerSlackId = await getSlackUserId(supabase, effectiveOrgId, deal.user_id);
    if (ownerSlackId) {
      usersToInvite.push(ownerSlackId);
    }

    // 2. Manager (optional)
    if (managerSlackUserId) {
      usersToInvite.push(managerSlackUserId);
    } else if (managerUserId) {
      const mgrSlack = await getSlackUserId(supabase, effectiveOrgId, managerUserId);
      if (mgrSlack) usersToInvite.push(mgrSlack);
    }

    // 3. Stakeholders from settings
    if (settings.stakeholderSlackIds.length > 0) {
      usersToInvite.push(...settings.stakeholderSlackIds);
    }

    // 4. Explicit invitees from request (useful for testing “owner + manager”)
    if (inviteSlackUserIds.length > 0) {
      usersToInvite.push(...inviteSlackUserIds);
    }

    // Deduplicate
    const uniqueUsers = [...new Set(usersToInvite)];

    // Invite users to channel
    if (uniqueUsers.length > 0) {
      const inviteResult = await inviteToChannel(botToken, channelId, uniqueUsers);
      if (!inviteResult.ok && inviteResult.error !== 'already_in_channel') {
        console.warn('Some users could not be invited:', inviteResult.error);
      }
    }

    // Set channel topic
    const money = await getOrgMoneyConfig(supabase, effectiveOrgId);
    const topic = `💰 ${deal.title} | ${formatMoney(deal.value, money.currencyCode, money.currencyLocale)} | Stage: ${deal.stage}`;
    await setChannelTopic(botToken, channelId, topic);

    // Store deal room in database
    const { error: insertError } = await supabase
      .from('slack_deal_rooms')
      .insert({
        org_id: effectiveOrgId,
        deal_id: deal.id,
        slack_channel_id: channelId,
        slack_channel_name: actualChannelName,
      });

    if (insertError) {
      console.error('Failed to store deal room:', insertError);
    }

    // Build and post welcome message
    // Contacts are already in the expected format from our earlier transformation
    const contacts = deal.contacts || [];

    // Owner display (name + slack mention if available)
    const ownerName = await getOwnerDisplayName(supabase, deal.user_id);

    const dealRoomData: DealRoomData = {
      dealName: deal.title,
      dealId: deal.id,
      dealValue: deal.value,
      dealStage: deal.stage,
      currencyCode: money.currencyCode,
      currencyLocale: money.currencyLocale,
      ownerName,
      ownerSlackUserId: ownerSlackId,
      winProbability: deal.win_probability,
      companyName: (deal.company as { name?: string })?.name || ((deal as any).companies as { name?: string } | undefined)?.name,
      companyIndustry: (deal.company as { industry?: string })?.industry || ((deal as any).companies as { industry?: string } | undefined)?.industry,
      companySize: (deal.company as { size?: string })?.size || ((deal as any).companies as { size?: string } | undefined)?.size,
      keyContacts: contacts.map((c: any) => ({
        name: c.name,
        title: c.title,
        isDecisionMaker: c.is_decision_maker,
      })),
      appUrl,
    };

    const welcomeMessage = buildDealRoomWelcomeMessage(dealRoomData);
    const postResult = await postToChannel(botToken, channelId, welcomeMessage);

    if (!postResult.ok) {
      console.error('Failed to post welcome message:', postResult.error);
    }

    // Record notification
    await supabase.from('slack_notifications_sent').insert({
      org_id: effectiveOrgId,
      feature: 'deal_rooms',
      entity_type: 'deal',
      entity_id: deal.id,
      recipient_type: 'channel',
      recipient_id: channelId,
      slack_ts: postResult.ts || '',
      slack_channel_id: channelId,
    });

    console.log('Deal room created successfully:', actualChannelName);
    return new Response(
      JSON.stringify({
        success: true,
        channelId,
        channelName: actualChannelName,
        invitedUsers: uniqueUsers.length,
        invitedSlackUserIds: uniqueUsers,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating deal room:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
