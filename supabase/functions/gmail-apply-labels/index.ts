/**
 * Edge Function: Apply Gmail Labels
 *
 * Applies Sixty category labels to Gmail messages (modeC).
 * Can be called:
 * 1. For a single message (messageId + category)
 * 2. For pending messages (batch apply all uncategorized)
 * 
 * SECURITY:
 * - POST only
 * - User JWT or service-role authentication
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest, getUserOrgId } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Default label names for each category (plain names, no prefix per user preference)
const DEFAULT_LABEL_NAMES: Record<string, string> = {
  to_respond: 'To Respond',
  fyi: 'FYI',
  marketing: 'Marketing',
  calendar_related: 'Calendar',
  automated: 'Automated',
};

// Label colors for each category
const LABEL_COLORS: Record<string, { backgroundColor: string; textColor: string }> = {
  to_respond: { backgroundColor: '#16a765', textColor: '#ffffff' },   // Green
  fyi: { backgroundColor: '#4986e7', textColor: '#ffffff' },           // Blue
  marketing: { backgroundColor: '#ffad47', textColor: '#000000' },     // Orange
  calendar_related: { backgroundColor: '#fb4c2f', textColor: '#ffffff' }, // Red
  automated: { backgroundColor: '#b99aff', textColor: '#000000' },     // Purple
};

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const { action, messageId, category, limit = 20, userId: bodyUserId } = body;

    // Authenticate
    const { userId } = await authenticateRequest(
      req,
      supabase,
      SUPABASE_SERVICE_ROLE_KEY,
      bodyUserId
    );

    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return errorResponse('Google integration not found', req, 400);
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.expires_at);
    
    if (new Date() >= expiresAt && integration.refresh_token) {
      accessToken = await refreshAccessToken(integration.refresh_token, supabase, userId);
    }

    // Get org settings to verify modeC is enabled
    const orgId = await getUserOrgId(supabase, userId);
    let orgSettings = null;
    
    if (orgId) {
      const { data: settings } = await supabase
        .from('org_email_categorization_settings')
        .select('*')
        .eq('org_id', orgId)
        .single();
      orgSettings = settings;
    }

    if (orgSettings?.label_mode !== 'mode_c_sync_labels') {
      return jsonResponse({
        success: false,
        message: 'Gmail label sync is not enabled. Set label_mode to mode_c_sync_labels to enable.',
      }, req);
    }

    let result;

    switch (action) {
      case 'apply-single':
        if (!messageId || !category) {
          return errorResponse('messageId and category required for apply-single', req, 400);
        }
        result = await applySingleLabel(accessToken, supabase, userId, messageId, category);
        break;

      case 'apply-pending':
        result = await applyPendingLabels(accessToken, supabase, userId, limit);
        break;

      case 'setup-labels':
        result = await setupCategoryLabels(accessToken, supabase, userId, orgId);
        break;

      default:
        return errorResponse('Unknown action. Use: apply-single, apply-pending, setup-labels', req, 400);
    }

    return jsonResponse(result, req);

  } catch (error: any) {
    console.error('[gmail-apply-labels] Error:', error);
    return errorResponse(error.message || 'Label application failed', req, 500);
  }
});

/**
 * Apply label to a single message
 */
async function applySingleLabel(
  accessToken: string,
  supabase: any,
  userId: string,
  messageId: string,
  category: string
): Promise<{ success: boolean; error?: string }> {
  // Get label mapping
  const { data: mapping } = await supabase
    .from('gmail_label_mappings')
    .select('gmail_label_id')
    .eq('user_id', userId)
    .eq('category_key', category)
    .single();

  if (!mapping?.gmail_label_id) {
    return { success: false, error: `No label mapping found for category: ${category}` };
  }

  // Apply label via Gmail API
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addLabelIds: [mapping.gmail_label_id],
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.error?.message || 'Gmail API error' };
  }

  // Mark as applied in database
  await supabase
    .from('email_categorizations')
    .update({
      gmail_label_applied: true,
      gmail_label_applied_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('external_id', messageId);

  return { success: true };
}

/**
 * Apply labels to all pending categorized emails
 */
async function applyPendingLabels(
  accessToken: string,
  supabase: any,
  userId: string,
  limit: number
): Promise<{ success: boolean; applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;

  // Get pending categorizations
  const { data: pending, error: pendingError } = await supabase
    .from('email_categorizations')
    .select('external_id, category')
    .eq('user_id', userId)
    .eq('gmail_label_applied', false)
    .neq('category', 'uncategorized')
    .order('processed_at', { ascending: false })
    .limit(limit);

  if (pendingError) {
    return { success: false, applied: 0, errors: [pendingError.message] };
  }

  if (!pending || pending.length === 0) {
    return { success: true, applied: 0, errors: [] };
  }

  // Get all label mappings for this user
  const { data: mappings } = await supabase
    .from('gmail_label_mappings')
    .select('category_key, gmail_label_id')
    .eq('user_id', userId);

  const mappingMap = new Map(
    (mappings || []).map((m: any) => [m.category_key, m.gmail_label_id])
  );

  // Apply labels
  for (const item of pending) {
    const labelId = mappingMap.get(item.category);
    if (!labelId) continue;

    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.external_id}/modify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            addLabelIds: [labelId],
          }),
        }
      );

      if (response.ok) {
        await supabase
          .from('email_categorizations')
          .update({
            gmail_label_applied: true,
            gmail_label_applied_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('external_id', item.external_id);
        applied++;
      } else {
        const errorData = await response.json().catch(() => ({}));
        errors.push(`${item.external_id}: ${errorData.error?.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      errors.push(`${item.external_id}: ${e.message}`);
    }

    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { success: errors.length === 0, applied, errors };
}

/**
 * Setup Gmail labels for all categories (collision-safe)
 */
async function setupCategoryLabels(
  accessToken: string,
  supabase: any,
  userId: string,
  orgId: string | null
): Promise<{ success: boolean; labels: any[]; errors: string[] }> {
  const errors: string[] = [];
  const labels: any[] = [];

  const categories = ['to_respond', 'fyi', 'marketing', 'calendar_related', 'automated'];

  for (const category of categories) {
    const labelName = DEFAULT_LABEL_NAMES[category];
    const colors = LABEL_COLORS[category];

    try {
      // Check if label already exists
      const listResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/labels',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        errors.push(`Failed to list labels for ${category}`);
        continue;
      }

      const listData = await listResponse.json();
      const existingLabel = (listData.labels || []).find(
        (l: any) => l.name?.toLowerCase() === labelName.toLowerCase()
      );

      let labelId: string;
      let isSixtyManaged = false;

      if (existingLabel) {
        // Use existing label (don't overwrite)
        labelId = existingLabel.id;
        isSixtyManaged = false;
      } else {
        // Create new label
        const createResponse = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/labels',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: labelName,
              labelListVisibility: 'labelShow',
              messageListVisibility: 'show',
              color: colors,
            }),
          }
        );

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          errors.push(`Failed to create label ${labelName}: ${errorData.error?.message}`);
          continue;
        }

        const newLabel = await createResponse.json();
        labelId = newLabel.id;
        isSixtyManaged = true;
      }

      // Store label mapping
      const { error: upsertError } = await supabase
        .from('gmail_label_mappings')
        .upsert({
          user_id: userId,
          org_id: orgId,
          category_key: category,
          gmail_label_id: labelId,
          gmail_label_name: labelName,
          is_sixty_managed: isSixtyManaged,
          sync_direction: 'sixty_to_gmail',
        }, {
          onConflict: 'user_id,category_key',
        });

      if (upsertError) {
        errors.push(`Failed to save mapping for ${category}: ${upsertError.message}`);
      }

      labels.push({
        category,
        labelName,
        labelId,
        isSixtyManaged,
      });

    } catch (e: any) {
      errors.push(`Error setting up ${category}: ${e.message}`);
    }
  }

  return { success: errors.length === 0, labels, errors };
}

/**
 * Refresh Google access token
 */
async function refreshAccessToken(
  refreshToken: string,
  supabase: any,
  userId: string
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await response.json();

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

  await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return data.access_token;
}

