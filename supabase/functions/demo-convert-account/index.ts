/**
 * demo-convert-account
 *
 * Converts a newly signed-up demo user into a fully onboarded account.
 * Seeds org, enrichment, skills, agent config, and welcome credits
 * from the research data collected during the /demo-v2 flow.
 *
 * Deployed with --no-verify-jwt (public endpoint, auth is via user_id + service role).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { loadPrompt, interpolateVariables } from '../_shared/promptLoader.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchCompany {
  name: string;
  domain: string;
  vertical: string;
  product_summary: string;
  value_props: string[];
  employee_range?: string;
  competitors?: string[];
  icp: {
    title: string;
    company_size: string;
    industry: string;
  };
}

interface ResearchData {
  company: ResearchCompany;
  demo_actions?: {
    cold_outreach?: {
      personalised_hook?: string;
      email_preview?: string;
    };
  };
  stats?: Record<string, number>;
}

interface RequestBody {
  user_id: string;
  domain: string;
  research_data: ResearchData | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Infer sales motion from employee range string. */
function inferSalesMotion(employeeRange?: string): string {
  if (!employeeRange) return 'mid_market';
  const lower = employeeRange.toLowerCase();
  if (lower.includes('1-') || lower.includes('1–') || lower.includes('2-') || lower.includes('< 50') || lower.includes('startup')) return 'plg';
  if (lower.includes('500') || lower.includes('1000') || lower.includes('enterprise')) return 'enterprise';
  return 'mid_market';
}

/** Generate 5 AI skills from research data via Gemini. */
async function generateSkills(
  supabase: ReturnType<typeof createClient>,
  research: ResearchData,
): Promise<Record<string, unknown> | null> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    console.warn('[demo-convert] GEMINI_API_KEY not set, using fallback skills');
    return null;
  }

  try {
    const promptConfig = await loadPrompt(supabase, 'organization_skill_generation');

    const enrichmentData = {
      company_name: research.company.name,
      domain: research.company.domain,
      industry: research.company.vertical,
      description: research.company.product_summary,
      value_propositions: research.company.value_props,
      competitors: research.company.competitors || [],
      target_market: research.company.icp.industry,
      employee_count: research.company.employee_range || 'Unknown',
      products: [],
    };

    const variables = {
      domain: research.company.domain,
      companyIntelligence: JSON.stringify(enrichmentData, null, 2),
    };

    const systemPrompt = interpolateVariables(promptConfig.systemPrompt, variables);
    const userPrompt = interpolateVariables(promptConfig.userPrompt, variables);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${promptConfig.model}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: {
            temperature: promptConfig.temperature,
            maxOutputTokens: promptConfig.maxTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn('[demo-convert] Gemini API error:', await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.find((p: { thought?: boolean }) => !p.thought)?.text
      || data.candidates?.[0]?.content?.parts?.[0]?.text
      || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[demo-convert] Could not parse Gemini skill response');
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('[demo-convert] Skill generation failed:', err);
    return null;
  }
}

/** Build fallback skills from research data (no AI). */
function buildFallbackSkills(research: ResearchData): Record<string, unknown> {
  const { company } = research;
  return {
    icp: {
      companyProfile: `${company.icp.company_size} companies in ${company.icp.industry}`,
      buyerPersona: company.icp.title,
      buyingSignals: ['Active evaluation', 'Budget approved', 'Pain point identified'],
    },
    lead_qualification: {
      criteria: [
        `Company size: ${company.icp.company_size}`,
        `Industry: ${company.icp.industry}`,
        `Decision maker: ${company.icp.title}`,
      ],
      disqualifiers: ['No budget', 'Wrong industry', 'Too small'],
    },
    lead_enrichment: {
      questions: [
        `What challenges are you facing with ${company.vertical.toLowerCase()}?`,
        'What does your current process look like?',
        'What would success look like for your team?',
      ],
    },
    brand_voice: {
      tone: 'Professional, knowledgeable, and helpful',
      avoid: ['Jargon', 'Pushy language', 'Buzzwords'],
    },
    objection_handling: {
      objections: (company.competitors || []).slice(0, 3).map((c) => ({
        trigger: `We already use ${c}`,
        response: `${c} is solid for [X]. Where teams tend to complement it with ${company.name} is [Y].`,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const body: RequestBody = await req.json();
    const { user_id, domain, research_data } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), { status: 400, headers });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ------------------------------------------------------------------
    // 0. Auto-verify email (service role can do this directly)
    // ------------------------------------------------------------------
    try {
      await supabase.auth.admin.updateUserById(user_id, { email_confirm: true });
    } catch (err) {
      console.warn('[demo-convert] Email verification failed (non-critical):', err);
    }

    const company = research_data?.company;
    const companyName = company?.name || domain;
    const companyDomain = company?.domain || domain;

    // ------------------------------------------------------------------
    // 1. Create organization
    // ------------------------------------------------------------------
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: companyName,
        company_domain: companyDomain,
        company_bio: company?.product_summary || null,
        created_by: user_id,
        is_active: true,
        onboarding_version: 'demo-v2',
      })
      .select('id')
      .single();

    if (orgError) {
      console.error('[demo-convert] Org creation error:', orgError);
      return new Response(JSON.stringify({ error: 'Failed to create organization', detail: orgError.message }), { status: 500, headers });
    }

    const orgId = org.id;

    // ------------------------------------------------------------------
    // 2. Create organization membership (owner)
    // ------------------------------------------------------------------
    const { error: memberError } = await supabase
      .from('organization_memberships')
      .insert({
        organization_id: orgId,
        user_id,
        role: 'owner',
      });

    if (memberError) {
      console.error('[demo-convert] Membership error:', memberError);
    }

    // ------------------------------------------------------------------
    // 3. Update profile with signup source
    // ------------------------------------------------------------------
    await supabase
      .from('profiles')
      .update({ signup_source: 'demo-v2' })
      .eq('id', user_id);

    // ------------------------------------------------------------------
    // 4. Write organization_enrichment from research data
    // ------------------------------------------------------------------
    if (company) {
      const { error: enrichError } = await supabase
        .from('organization_enrichment')
        .upsert({
          organization_id: orgId,
          domain: companyDomain,
          status: 'completed',
          company_name: companyName,
          description: company.product_summary,
          industry: company.vertical,
          employee_count: company.employee_range || null,
          value_propositions: company.value_props || [],
          competitors: company.competitors || [],
          target_market: company.icp?.industry || null,
          enrichment_source: 'demo-v2',
          confidence_score: 0.75,
          enrichment_version: 1,
        }, {
          onConflict: 'organization_id',
        });

      if (enrichError) {
        console.error('[demo-convert] Enrichment write error:', enrichError);
      }
    }

    // ------------------------------------------------------------------
    // 5. Generate and save organization skills
    // ------------------------------------------------------------------
    let skills: Record<string, unknown> | null = null;

    if (research_data) {
      skills = await generateSkills(supabase, research_data);
      if (!skills) {
        skills = buildFallbackSkills(research_data);
      }
    }

    if (skills) {
      const skillEntries: Array<{ id: string; name: string }> = [
        { id: 'icp', name: 'Ideal Customer Profile' },
        { id: 'lead_qualification', name: 'Lead Qualification' },
        { id: 'lead_enrichment', name: 'Discovery & Enrichment' },
        { id: 'brand_voice', name: 'Brand Voice' },
        { id: 'objection_handling', name: 'Objection Handling' },
      ];

      for (const entry of skillEntries) {
        const config = (skills as Record<string, unknown>)[entry.id];
        if (!config) continue;

        try {
          await supabase.rpc('save_organization_skill', {
            p_org_id: orgId,
            p_skill_id: entry.id,
            p_skill_name: entry.name,
            p_config: config,
            p_user_id: user_id,
            p_ai_generated: true,
            p_change_reason: 'Auto-generated from demo research',
          });
        } catch (err) {
          console.error(`[demo-convert] Failed to save skill ${entry.id}:`, err);
        }
      }
    }

    // ------------------------------------------------------------------
    // 6. Write agent config defaults
    // ------------------------------------------------------------------
    const agentDefaults = [
      { config_key: 'sales_methodology', value: 'generic', agent_type: 'global' },
      { config_key: 'fiscal_year_start_month', value: 1, agent_type: 'global' },
      { config_key: 'sales_motion_type', value: inferSalesMotion(company?.employee_range), agent_type: 'global' },
    ];

    if (company?.competitors?.length) {
      agentDefaults.push({
        config_key: 'key_competitors',
        value: company.competitors as unknown as string,
        agent_type: 'global',
      });
    }

    for (const cfg of agentDefaults) {
      await supabase
        .from('agent_config_org_overrides')
        .upsert({
          org_id: orgId,
          agent_type: cfg.agent_type,
          config_key: cfg.config_key,
          config_value: cfg.value,
          updated_by: user_id,
        }, {
          onConflict: 'org_id,agent_type,config_key',
        });
    }

    // ------------------------------------------------------------------
    // 7. Mark onboarding as complete
    // ------------------------------------------------------------------
    await supabase
      .from('user_onboarding_progress')
      .upsert({
        user_id,
        onboarding_step: 'complete',
        onboarding_completed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    // ------------------------------------------------------------------
    // 8. Grant welcome credits (10)
    // ------------------------------------------------------------------
    try {
      await supabase.rpc('add_credits', {
        p_org_id: orgId,
        p_amount: 10,
        p_type: 'bonus',
        p_description: 'Welcome — 10 free AI credits (demo signup)',
      });
    } catch (err) {
      console.warn('[demo-convert] Credit grant failed (may not have credits table):', err);
    }

    // ------------------------------------------------------------------
    // 9. Fire deep-enrich in background (non-blocking)
    // ------------------------------------------------------------------
    try {
      const enrichUrl = `${supabaseUrl}/functions/v1/deep-enrich-organization`;
      fetch(enrichUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          action: 'start',
          organization_id: orgId,
          domain: companyDomain,
          force: false, // don't overwrite the demo data if enrichment already seeded
        }),
      }).catch((e) => console.warn('[demo-convert] Background enrichment fire-and-forget error:', e));
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        organization_id: orgId,
        skills_generated: !!skills,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error('[demo-convert] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      { status: 500, headers },
    );
  }
});
