/**
 * Business Context Loader
 *
 * Unified loader for all org/user business context needed by the
 * NL table builder and workflow orchestrator. Fetches:
 *   1. ICP profiles (from generate-icp-profiles cache or org context)
 *   2. Org enrichment data (value_prop, tone, competitors, pain_points)
 *   3. Integration credentials (Apollo, Instantly API keys)
 *   4. User email sign-off preference (user_tone_settings table)
 *   5. Brand voice settings (organization_skills)
 *
 * Returns null fields gracefully — never throws on missing data.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

// ============================================================================
// Types
// ============================================================================

export interface ICPFilters {
  person_titles?: string[]
  person_seniorities?: string[]
  person_departments?: string[]
  person_locations?: string[]
  organization_num_employees_ranges?: string[]
  organization_latest_funding_stage_cd?: string[]
  q_keywords?: string
  q_organization_keyword_tags?: string[]
}

export interface ICPProfile {
  id: string
  name: string
  description: string
  filters: ICPFilters
}

export interface BrandVoice {
  tone?: string
  avoid?: string[]
}

export interface BusinessContext {
  // Org identity
  orgId: string
  companyName: string | null

  // ICP
  icp: ICPProfile | null

  // Business knowledge
  valueProp: string[] | null
  toneOfVoice: BrandVoice | null
  painPoints: string[] | null
  competitors: Array<{ name: string; domain?: string }> | null
  targetMarket: string | null
  products: Array<{ name: string; description: string }> | null

  // User preferences
  emailSignOff: string | null
  userName: string | null

  // Integration credentials
  apolloApiKey: string | null
  instantlyApiKey: string | null
}

// ============================================================================
// Loader
// ============================================================================

/**
 * Load all business context for a given org and user.
 *
 * @param serviceClient - Service role Supabase client (bypasses RLS for org-wide data)
 * @param orgId - Organization ID
 * @param userId - User ID (for user-level preferences)
 */
export async function loadBusinessContext(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string
): Promise<BusinessContext> {
  // Run all queries in parallel for speed
  const [
    enrichmentResult,
    skillsResult,
    credentialsResult,
    profileResult,
    emailToneResult,
    icpCacheResult,
  ] = await Promise.all([
    // 1. Organization enrichment (company knowledge)
    serviceClient
      .from('organization_enrichment')
      .select('company_name, products, value_propositions, competitors, target_market, pain_points')
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .maybeSingle(),

    // 2. Brand voice from organization_skills
    serviceClient
      .from('organization_skills')
      .select('skill_id, config')
      .eq('organization_id', orgId)
      .in('skill_id', ['brand_voice'])
      .limit(1),

    // 3. Integration credentials (Apollo + Instantly)
    serviceClient
      .from('integration_credentials')
      .select('provider, credentials')
      .eq('organization_id', orgId)
      .in('provider', ['apollo', 'instantly']),

    // 4. User profile (name)
    serviceClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle(),

    // 5. Email sign-off from user_tone_settings
    serviceClient
      .from('user_tone_settings')
      .select('email_sign_off')
      .eq('user_id', userId)
      .eq('content_type', 'email')
      .maybeSingle(),

    // 6. Cached ICP profiles from organization_context
    serviceClient
      .from('organization_context')
      .select('value')
      .eq('organization_id', orgId)
      .eq('context_key', 'icp_apollo_profiles')
      .maybeSingle(),
  ])

  // --- Extract enrichment ---
  const enrichment = enrichmentResult.data
  const companyName = enrichment?.company_name ?? null
  const products = enrichment?.products ?? null
  const valueProp = enrichment?.value_propositions ?? null
  const competitors = enrichment?.competitors ?? null
  const targetMarket = enrichment?.target_market ?? null
  const painPoints = enrichment?.pain_points ?? null

  // --- Extract brand voice ---
  let toneOfVoice: BrandVoice | null = null
  if (skillsResult.data && skillsResult.data.length > 0) {
    const brandVoiceSkill = skillsResult.data.find(
      (s: { skill_id: string; config: Record<string, unknown> }) => s.skill_id === 'brand_voice'
    )
    if (brandVoiceSkill?.config) {
      toneOfVoice = {
        tone: (brandVoiceSkill.config as Record<string, unknown>).tone as string | undefined,
        avoid: (brandVoiceSkill.config as Record<string, unknown>).avoid as string[] | undefined,
      }
    }
  }

  // --- Extract credentials ---
  let apolloApiKey: string | null = null
  let instantlyApiKey: string | null = null
  if (credentialsResult.data) {
    for (const cred of credentialsResult.data) {
      const credentials = cred.credentials as Record<string, string> | null
      if (cred.provider === 'apollo' && credentials?.api_key) {
        apolloApiKey = credentials.api_key
      }
      if (cred.provider === 'instantly' && credentials?.api_key) {
        instantlyApiKey = credentials.api_key
      }
    }
  }

  // --- Extract user profile ---
  const profile = profileResult.data
  const emailSignOff = emailToneResult.data?.email_sign_off ?? null
  const userName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
    : null

  // --- Extract ICP ---
  let icp: ICPProfile | null = null
  if (icpCacheResult.data?.value) {
    const profiles = icpCacheResult.data.value as ICPProfile[] | ICPProfile
    if (Array.isArray(profiles) && profiles.length > 0) {
      icp = profiles[0]
    } else if (!Array.isArray(profiles) && profiles.id) {
      icp = profiles
    }
  }

  return {
    orgId,
    companyName,
    icp,
    valueProp,
    toneOfVoice,
    painPoints,
    competitors,
    targetMarket,
    products,
    emailSignOff,
    userName,
    apolloApiKey,
    instantlyApiKey,
  }
}

/**
 * Build a concise context string for AI prompts from BusinessContext.
 * Used by the orchestrator and email generation to inject into system prompts.
 */
export function buildContextPrompt(ctx: BusinessContext): string {
  const parts: string[] = []

  if (ctx.companyName) {
    parts.push(`COMPANY: ${ctx.companyName}`)
  }

  if (ctx.products && ctx.products.length > 0) {
    const productList = ctx.products.map(p => `${p.name}: ${p.description}`).join('; ')
    parts.push(`PRODUCTS: ${productList}`)
  }

  if (ctx.valueProp && ctx.valueProp.length > 0) {
    parts.push(`VALUE PROPOSITIONS: ${ctx.valueProp.join('; ')}`)
  }

  if (ctx.painPoints && ctx.painPoints.length > 0) {
    parts.push(`PAIN POINTS WE SOLVE: ${ctx.painPoints.join('; ')}`)
  }

  if (ctx.competitors && ctx.competitors.length > 0) {
    parts.push(`COMPETITORS: ${ctx.competitors.map(c => c.name).join(', ')}`)
  }

  if (ctx.targetMarket) {
    parts.push(`TARGET MARKET: ${ctx.targetMarket}`)
  }

  if (ctx.toneOfVoice?.tone) {
    parts.push(`TONE OF VOICE: ${ctx.toneOfVoice.tone}`)
  }

  if (ctx.toneOfVoice?.avoid && ctx.toneOfVoice.avoid.length > 0) {
    parts.push(`NEVER USE THESE WORDS: ${ctx.toneOfVoice.avoid.join(', ')}`)
  }

  if (ctx.emailSignOff) {
    parts.push(`EMAIL SIGN-OFF: ${ctx.emailSignOff}`)
  }

  if (ctx.userName) {
    parts.push(`SENDER NAME: ${ctx.userName}`)
  }

  return parts.join('\n')
}
