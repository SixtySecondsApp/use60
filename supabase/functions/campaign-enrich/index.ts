/**
 * campaign-enrich  (CMP-002)
 *
 * POST /campaign-enrich
 * Body: { campaign_name, campaign_source?, prospects[], expires_in_days? }
 *
 * Creates campaign links with pre-enriched research data.
 * For each prospect:
 *   1. Generates a unique 6-char base62 short code
 *   2. Inserts a campaign_links row
 *   3. Calls sandbox-personalize to generate AI content (email draft, meeting prep)
 *   4. Stores the enrichment result in research_data + ai_content JSONB columns
 *
 * Returns array of { code, url, visitor_company } for every created link.
 * Enrichment failures are non-fatal — the link still works, just without AI content.
 *
 * Requires authentication (the rep creating the campaign).
 * Max 100 prospects per batch.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

// ── Base62 short-code generation ──────────────────────────────────────

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function generateCode(length = 6): string {
  let code = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const byte of arr) {
    code += BASE62[byte % 62];
  }
  return code;
}

// ── Types ─────────────────────────────────────────────────────────────

interface ProspectInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  title?: string;
  company: string;
  domain?: string;
}

interface CreateCampaignRequest {
  campaign_name: string;
  campaign_source?: string;
  prospects: ProspectInput[];
  expires_in_days?: number;
}

interface EnrichmentResult {
  email_draft?: { subject: string; body: string };
  meeting_prep?: {
    overview: string;
    talking_points: string[];
    risk_signals: string[];
    questions_to_ask: string[];
    deal_context: string;
  };
}

// ── Enrichment helper ─────────────────────────────────────────────────

async function enrichProspect(
  supabaseUrl: string,
  serviceKey: string,
  prospect: {
    company_name: string;
    company_domain: string;
    visitor_name: string;
    visitor_title: string | null;
  },
): Promise<EnrichmentResult | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sandbox-personalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        company_name: prospect.company_name,
        company_domain: prospect.company_domain,
        visitor_name: prospect.visitor_name,
        visitor_title: prospect.visitor_title,
      }),
    });

    if (!res.ok) {
      console.warn(
        `[campaign-enrich] sandbox-personalize returned ${res.status} for ${prospect.company_domain}`,
      );
      return null;
    }

    const json = await res.json();
    return (json.data ?? json) as EnrichmentResult;
  } catch (err) {
    console.error(
      `[campaign-enrich] Enrichment failed for ${prospect.company_domain}:`,
      err,
    );
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // ── Validate input ─────────────────────────────────────────────
    const body: CreateCampaignRequest = await req.json();

    if (!body.campaign_name || !body.prospects?.length) {
      return errorResponse('campaign_name and prospects[] required', req, 400);
    }

    if (body.prospects.length > 100) {
      return errorResponse('Max 100 prospects per batch', req, 400);
    }

    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400000).toISOString()
      : null;

    // ── Build rows ─────────────────────────────────────────────────
    const rows = body.prospects.map((prospect) => {
      const code = generateCode();
      const domain =
        prospect.domain ||
        `${prospect.company.toLowerCase().replace(/\s+/g, '')}.com`;

      return {
        code,
        campaign_name: body.campaign_name,
        campaign_source: body.campaign_source || null,
        visitor_first_name: prospect.first_name || null,
        visitor_last_name: prospect.last_name || null,
        visitor_email: prospect.email || null,
        visitor_title: prospect.title || null,
        visitor_company: prospect.company,
        visitor_domain: domain,
        research_data: null as unknown,
        ai_content: null as unknown,
        created_by: user.id,
        status: 'active',
        expires_at: expiresAt,
      };
    });

    // ── Insert links ───────────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from('campaign_links')
      .insert(rows)
      .select('id, code, visitor_company, visitor_domain, status');

    if (insertError || !inserted) {
      console.error('[campaign-enrich] Insert error:', insertError);
      return errorResponse(
        `Failed to create links: ${insertError?.message ?? 'no data returned'}`,
        req,
        500,
      );
    }

    // ── Enrich each prospect via sandbox-personalize ───────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey);

      const enrichResults = await Promise.allSettled(
        inserted.map(async (link) => {
          // Find the matching row we built earlier (shares the same code)
          const row = rows.find((r) => r.code === link.code);
          if (!row) return;

          const visitorName = [row.visitor_first_name, row.visitor_last_name]
            .filter(Boolean)
            .join(' ') || row.visitor_company;

          const enrichment = await enrichProspect(supabaseUrl, serviceKey, {
            company_name: row.visitor_company,
            company_domain: link.visitor_domain,
            visitor_name: visitorName,
            visitor_title: row.visitor_title,
          });

          if (enrichment) {
            const { error: updateError } = await adminClient
              .from('campaign_links')
              .update({
                research_data: enrichment.meeting_prep ?? null,
                ai_content: enrichment,
              })
              .eq('id', link.id);

            if (updateError) {
              console.warn(
                `[campaign-enrich] Failed to store enrichment for ${link.code}:`,
                updateError.message,
              );
            }
          }
        }),
      );

      const enriched = enrichResults.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const failed = enrichResults.filter(
        (r) => r.status === 'rejected',
      ).length;

      if (failed > 0) {
        console.warn(
          `[campaign-enrich] ${failed}/${inserted.length} enrichments failed`,
        );
      }
      console.log(
        `[campaign-enrich] Enriched ${enriched}/${inserted.length} prospects for campaign "${body.campaign_name}"`,
      );
    }

    // ── Build response ─────────────────────────────────────────────
    const baseUrl = req.headers.get('origin') || 'https://www.use60.com';
    const result = inserted.map((link) => ({
      code: link.code,
      visitor_company: link.visitor_company,
      url: `${baseUrl}/t/${link.code}`,
      status: link.status,
    }));

    return jsonResponse(
      {
        success: true,
        campaign: body.campaign_name,
        links_created: result.length,
        links: result,
      },
      req,
    );
  } catch (err) {
    console.error('[campaign-enrich] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
