// supabase/functions/health-recalculate/attioSync.ts
// Provisions Attio custom fields and pushes health scores to Attio deal records

import { AttioClient, toAttioValues } from '../_shared/attio.ts';

// =============================================================================
// Types
// =============================================================================

interface AttioFieldDefinition {
  slug: string;
  title: string;
  type: 'number' | 'select' | 'text';
  description: string;
  config?: {
    options?: Array<{ title: string; value: string }>;
  };
}

interface DealWithHealthScore {
  deal_id: string;
  attio_deal_id: string;
  overall_health_score: number;
  health_status: string;
  risk_level: string;
  relationship_health_score: number | null;
  ghost_probability: number | null;
  days_in_stage: number;
}

// =============================================================================
// Attio Custom Field Definitions
// =============================================================================

const HEALTH_SCORE_FIELDS: AttioFieldDefinition[] = [
  {
    slug: 'sixty_deal_health_score',
    title: '60 Deal Health Score',
    type: 'number',
    description: 'Overall deal health score (0-100) calculated by 60 using stage velocity, sentiment, engagement, and activity signals',
  },
  {
    slug: 'sixty_health_status',
    title: '60 Health Status',
    type: 'select',
    description: 'Deal health status: healthy, warning, critical, or stalled',
    config: {
      options: [
        { title: 'Healthy', value: 'healthy' },
        { title: 'Warning', value: 'warning' },
        { title: 'Critical', value: 'critical' },
        { title: 'Stalled', value: 'stalled' },
      ],
    },
  },
  {
    slug: 'sixty_risk_level',
    title: '60 Risk Level',
    type: 'select',
    description: 'Deal risk level based on health indicators',
    config: {
      options: [
        { title: 'Low', value: 'low' },
        { title: 'Medium', value: 'medium' },
        { title: 'High', value: 'high' },
        { title: 'Critical', value: 'critical' },
      ],
    },
  },
  {
    slug: 'sixty_relationship_health',
    title: '60 Relationship Health Score',
    type: 'number',
    description: 'Relationship health score (0-100) for primary contact based on communication frequency and engagement',
  },
  {
    slug: 'sixty_ghost_risk',
    title: '60 Ghost Risk %',
    type: 'number',
    description: 'Probability (0-100%) that the contact is ghosting based on response patterns',
  },
  {
    slug: 'sixty_days_in_stage',
    title: '60 Days in Stage',
    type: 'number',
    description: 'Number of days the deal has been in the current stage',
  },
];

// =============================================================================
// Field Provisioning
// =============================================================================

/**
 * Provision custom fields on Attio deal object (idempotent)
 */
export async function provisionAttioFields(
  attioClient: AttioClient
): Promise<{ success: boolean; provisioned: number; error?: string }> {
  let provisionedCount = 0;

  try {
    // Get existing deal object attributes
    const { data: attributes } = await attioClient.listAttributes('deals');
    const existingSlugs = new Set(attributes?.map((a: any) => a.slug) || []);

    for (const field of HEALTH_SCORE_FIELDS) {
      try {
        if (existingSlugs.has(field.slug)) {
          console.log(`[Attio] Field ${field.slug} already exists, skipping`);
          continue;
        }

        // Create the attribute
        const body: any = {
          title: field.title,
          api_slug: field.slug,
          type: field.type,
          description: field.description,
        };

        if (field.config) {
          body.config = field.config;
        }

        await attioClient.request({
          method: 'POST',
          path: '/v2/objects/deals/attributes',
          body: { data: body },
        });

        provisionedCount++;
        console.log(`[Attio] Provisioned field: ${field.slug}`);
      } catch (error: any) {
        console.error(`[Attio] Error provisioning field ${field.slug}:`, error);
        // Continue with other fields even if one fails
      }
    }

    return { success: true, provisioned: provisionedCount };
  } catch (error: any) {
    console.error('[Attio] Error provisioning fields:', error);
    return { success: false, provisioned: 0, error: error.message };
  }
}

// =============================================================================
// Health Score Push
// =============================================================================

/**
 * Push health scores to Attio deal records (batch updates)
 */
export async function pushHealthScoresToAttio(
  supabase: any,
  attioClient: AttioClient,
  dealIds: string[],
  orgId: string
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  if (!dealIds || dealIds.length === 0) {
    return { success: true, pushedCount: 0 };
  }

  try {
    // Fetch deals with health scores and Attio IDs
    const { data: deals, error: fetchError } = await supabase
      .from('deals')
      .select(`
        id,
        attio_deal_id,
        owner_id,
        deal_health_scores!inner(
          overall_health_score,
          health_status,
          risk_level,
          days_in_current_stage
        )
      `)
      .in('id', dealIds)
      .eq('clerk_org_id', orgId)
      .not('attio_deal_id', 'is', null);

    if (fetchError) {
      console.error('[Attio] Error fetching deals:', fetchError);
      return { success: false, pushedCount: 0, error: fetchError.message };
    }

    if (!deals || deals.length === 0) {
      console.log('[Attio] No deals with Attio IDs to sync');
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

    // Update each deal (Attio doesn't have a batch update endpoint for attributes)
    let pushedCount = 0;

    for (const deal of deals) {
      try {
        const healthScore = deal.deal_health_scores[0];
        const relationshipHealth = relationshipMap.get(deal.owner_id);

        // Prepare attribute values in Attio format
        const values: Record<string, any> = {
          sixty_deal_health_score: healthScore.overall_health_score,
          sixty_health_status: healthScore.health_status,
          sixty_risk_level: healthScore.risk_level,
          sixty_days_in_stage: healthScore.days_in_current_stage,
        };

        if (relationshipHealth) {
          values.sixty_relationship_health = relationshipHealth.overall_health_score;
          values.sixty_ghost_risk = relationshipHealth.ghost_probability_percent;
        }

        // Convert to Attio's array-wrapped value format
        const attioValues = toAttioValues(values);

        // Update the deal record
        await attioClient.updateRecord('deals', deal.attio_deal_id, attioValues);

        pushedCount++;
        console.log(`[Attio] Updated deal ${deal.attio_deal_id} (${pushedCount}/${deals.length})`);

        // Rate limiting: 25 writes/second
        // Sleep for 40ms between writes to stay under limit
        if (pushedCount < deals.length) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      } catch (updateError: any) {
        console.error(`[Attio] Error updating deal ${deal.attio_deal_id}:`, updateError);
        // Continue with other deals even if one fails
      }
    }

    return { success: true, pushedCount };
  } catch (error: any) {
    console.error('[Attio] Error pushing health scores:', error);
    return { success: false, pushedCount: 0, error: error.message };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Sync health scores to Attio for an organization
 */
export async function syncHealthScoresToAttio(
  supabase: any,
  dealIds: string[],
  clerkOrgId: string,
  orgUuid?: string // Optional: pass in org_id if already known
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  try {
    // If org_id not provided, look it up via hubspot_org_integrations (which has both IDs)
    // This is a workaround since deals only have clerk_org_id but attio integration needs org_id UUID
    if (!orgUuid) {
      const { data: orgMapping } = await supabase
        .from('hubspot_org_integrations')
        .select('org_id')
        .eq('clerk_org_id', clerkOrgId)
        .maybeSingle();

      orgUuid = orgMapping?.org_id;

      if (!orgUuid) {
        // If no hubspot integration, try getting from profiles table (users have org_id)
        const { data: dealWithOwner } = await supabase
          .from('deals')
          .select(`
            owner_id,
            profiles!inner(organization_id)
          `)
          .eq('clerk_org_id', clerkOrgId)
          .limit(1)
          .maybeSingle();

        orgUuid = dealWithOwner?.profiles?.organization_id;
      }

      if (!orgUuid) {
        console.log(`[Attio] No org_id UUID found for clerk_org_id ${clerkOrgId}`);
        return { success: true, pushedCount: 0 };
      }
    }

    // Check if Attio is connected for this org
    const { data: integration } = await supabase
      .from('attio_org_integrations')
      .select('id, is_active, is_connected, attio_workspace_id')
      .eq('org_id', orgUuid)
      .eq('is_active', true)
      .eq('is_connected', true)
      .maybeSingle();

    if (!integration) {
      console.log(`[Attio] No active Attio integration for org ${clerkOrgId}, skipping sync`);
      return { success: true, pushedCount: 0 };
    }

    // Get Attio access token from credentials table
    const { data: credentials } = await supabase
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', orgUuid)
      .maybeSingle();

    if (!credentials?.access_token) {
      console.error('[Attio] No access token found for org:', clerkOrgId);
      return { success: false, pushedCount: 0, error: 'No access token' };
    }

    // Create Attio client
    const attioClient = new AttioClient({
      accessToken: credentials.access_token,
    });

    // Provision fields (first time only, idempotent)
    await provisionAttioFields(attioClient);

    // Push health scores (pass clerk_org_id since deals use that)
    const result = await pushHealthScoresToAttio(supabase, attioClient, dealIds, clerkOrgId);

    // Update last_sync_at
    if (result.success && result.pushedCount > 0) {
      await supabase
        .from('attio_org_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('org_id', orgUuid);
    }

    return result;
  } catch (error: any) {
    console.error('[Attio] Sync error:', error);
    return { success: false, pushedCount: 0, error: error.message };
  }
}
