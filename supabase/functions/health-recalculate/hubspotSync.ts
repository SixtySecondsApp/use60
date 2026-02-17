// supabase/functions/health-recalculate/hubspotSync.ts
// Provisions HubSpot custom properties and pushes health scores to HubSpot deals

import { HubSpotClient } from '../_shared/hubspot.ts';

// =============================================================================
// Types
// =============================================================================

interface HubSpotPropertyDefinition {
  name: string;
  label: string;
  type: 'number' | 'string' | 'enumeration';
  fieldType: 'number' | 'text' | 'select';
  groupName: string;
  description: string;
  options?: Array<{ label: string; value: string }>;
}

interface DealWithHealthScore {
  deal_id: string;
  hubspot_deal_id: string;
  overall_health_score: number;
  health_status: string;
  risk_level: string;
  relationship_health_score: number | null;
  ghost_probability: number | null;
  days_in_stage: number;
}

// =============================================================================
// HubSpot Custom Properties
// =============================================================================

const HEALTH_SCORE_PROPERTIES: HubSpotPropertyDefinition[] = [
  {
    name: 'sixty_deal_health_score',
    label: '60 Deal Health Score',
    type: 'number',
    fieldType: 'number',
    groupName: 'dealinformation',
    description: 'Overall deal health score (0-100) calculated by 60 using stage velocity, sentiment, engagement, and activity signals',
  },
  {
    name: 'sixty_health_status',
    label: '60 Health Status',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'dealinformation',
    description: 'Deal health status: healthy, warning, critical, or stalled',
    options: [
      { label: 'Healthy', value: 'healthy' },
      { label: 'Warning', value: 'warning' },
      { label: 'Critical', value: 'critical' },
      { label: 'Stalled', value: 'stalled' },
    ],
  },
  {
    name: 'sixty_risk_level',
    label: '60 Risk Level',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'dealinformation',
    description: 'Deal risk level based on health indicators',
    options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
      { label: 'Critical', value: 'critical' },
    ],
  },
  {
    name: 'sixty_relationship_health',
    label: '60 Relationship Health Score',
    type: 'number',
    fieldType: 'number',
    groupName: 'dealinformation',
    description: 'Relationship health score (0-100) for primary contact based on communication frequency and engagement',
  },
  {
    name: 'sixty_ghost_risk',
    label: '60 Ghost Risk %',
    type: 'number',
    fieldType: 'number',
    groupName: 'dealinformation',
    description: 'Probability (0-100%) that the contact is ghosting based on response patterns',
  },
  {
    name: 'sixty_days_in_stage',
    label: '60 Days in Stage',
    type: 'number',
    fieldType: 'number',
    groupName: 'dealinformation',
    description: 'Number of days the deal has been in the current stage',
  },
];

// =============================================================================
// Property Provisioning
// =============================================================================

/**
 * Provision custom properties in HubSpot (idempotent)
 */
export async function provisionHubSpotProperties(
  hubspotClient: HubSpotClient
): Promise<{ success: boolean; provisioned: number; error?: string }> {
  let provisionedCount = 0;

  for (const prop of HEALTH_SCORE_PROPERTIES) {
    try {
      // Check if property exists
      const existingProp = await hubspotClient
        .request<any>({
          method: 'GET',
          path: `/crm/v3/properties/deals/${prop.name}`,
        })
        .catch(() => null);

      if (existingProp) {
        console.log(`[HubSpot] Property ${prop.name} already exists, skipping`);
        continue;
      }

      // Create the property
      const body: any = {
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        groupName: prop.groupName,
        description: prop.description,
      };

      if (prop.options) {
        body.options = prop.options;
      }

      await hubspotClient.request({
        method: 'POST',
        path: '/crm/v3/properties/deals',
        body,
      });

      provisionedCount++;
      console.log(`[HubSpot] Provisioned property: ${prop.name}`);
    } catch (error: any) {
      console.error(`[HubSpot] Error provisioning property ${prop.name}:`, error);
      // Continue with other properties even if one fails
    }
  }

  return { success: true, provisioned: provisionedCount };
}

// =============================================================================
// Health Score Push
// =============================================================================

/**
 * Push health scores to HubSpot deals (batch API, up to 100 per call)
 */
export async function pushHealthScoresToHubSpot(
  supabase: any,
  hubspotClient: HubSpotClient,
  dealIds: string[],
  orgId: string
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  if (!dealIds || dealIds.length === 0) {
    return { success: true, pushedCount: 0 };
  }

  try {
    // Fetch deals with health scores and HubSpot IDs
    const { data: deals, error: fetchError } = await supabase
      .from('deals')
      .select(`
        id,
        owner_id,
        hubspot_deal_id,
        deal_health_scores!inner(
          overall_health_score,
          health_status,
          risk_level,
          days_in_current_stage
        )
      `)
      .in('id', dealIds)
      .eq('clerk_org_id', orgId)
      .not('hubspot_deal_id', 'is', null);

    if (fetchError) {
      console.error('[HubSpot] Error fetching deals:', fetchError);
      return { success: false, pushedCount: 0, error: fetchError.message };
    }

    if (!deals || deals.length === 0) {
      console.log('[HubSpot] No deals with HubSpot IDs to sync');
      return { success: true, pushedCount: 0 };
    }

    // Fetch relationship health scores for these deals
    const { data: relationshipScores } = await supabase
      .from('relationship_health_scores')
      .select('user_id, overall_health_score, ghost_probability_percent')
      .in(
        'user_id',
        deals.map((d: any) => d.owner_id)
      );

    const relationshipMap = new Map(
      relationshipScores?.map((rs: any) => [rs.user_id, rs]) || []
    );

    // Prepare batch updates (HubSpot limit: 100 per batch)
    const batchSize = 100;
    let pushedCount = 0;

    for (let i = 0; i < deals.length; i += batchSize) {
      const batch = deals.slice(i, i + batchSize);
      const inputs = batch.map((deal: any) => {
        const healthScore = deal.deal_health_scores[0];
        const relationshipHealth = relationshipMap.get(deal.owner_id);

        return {
          id: deal.hubspot_deal_id,
          properties: {
            sixty_deal_health_score: healthScore.overall_health_score,
            sixty_health_status: healthScore.health_status,
            sixty_risk_level: healthScore.risk_level,
            sixty_days_in_stage: healthScore.days_in_current_stage,
            ...(relationshipHealth
              ? {
                  sixty_relationship_health: relationshipHealth.overall_health_score,
                  sixty_ghost_risk: relationshipHealth.ghost_probability_percent,
                }
              : {}),
          },
        };
      });

      try {
        await hubspotClient.request({
          method: 'POST',
          path: '/crm/v3/objects/deals/batch/update',
          body: { inputs },
        });

        pushedCount += inputs.length;
        console.log(`[HubSpot] Pushed batch of ${inputs.length} deals (${pushedCount}/${deals.length})`);
      } catch (batchError: any) {
        console.error('[HubSpot] Error pushing batch:', batchError);
        // Continue with next batch even if one fails
      }
    }

    return { success: true, pushedCount };
  } catch (error: any) {
    console.error('[HubSpot] Error pushing health scores:', error);
    return { success: false, pushedCount: 0, error: error.message };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Sync health scores to HubSpot for an organization
 */
export async function syncHealthScoresToHubSpot(
  supabase: any,
  dealIds: string[],
  clerkOrgId: string
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  try {
    // Check if HubSpot is connected for this org (hubspot_org_integrations has both org_id UUID and clerk_org_id text)
    const { data: integration } = await supabase
      .from('hubspot_org_integrations')
      .select('id, is_active, is_connected, hubspot_portal_id, org_id, clerk_org_id')
      .eq('clerk_org_id', clerkOrgId)
      .eq('is_active', true)
      .eq('is_connected', true)
      .maybeSingle();

    if (!integration) {
      console.log(`[HubSpot] No active HubSpot integration for org ${clerkOrgId}, skipping sync`);
      return { success: true, pushedCount: 0 };
    }

    const orgUuid = integration.org_id;

    // Get HubSpot access token from credentials table (using UUID)
    const { data: credentials } = await supabase
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', orgUuid)
      .maybeSingle();

    if (!credentials?.access_token) {
      console.error('[HubSpot] No access token found for org:', clerkOrgId);
      return { success: false, pushedCount: 0, error: 'No access token' };
    }

    // Create HubSpot client
    const hubspotClient = new HubSpotClient({
      accessToken: credentials.access_token,
    });

    // Provision properties (first time only, idempotent)
    await provisionHubSpotProperties(hubspotClient);

    // Push health scores (pass clerk_org_id since deals use that)
    const result = await pushHealthScoresToHubSpot(supabase, hubspotClient, dealIds, clerkOrgId);

    // Update last_sync_at
    if (result.success && result.pushedCount > 0) {
      await supabase
        .from('hubspot_org_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('org_id', orgUuid);
    }

    return result;
  } catch (error: any) {
    console.error('[HubSpot] Sync error:', error);
    return { success: false, pushedCount: 0, error: error.message };
  }
}
