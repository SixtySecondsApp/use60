import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * ICP Scoring + Owner Routing for LinkedIn Leads
 *
 * Scoring: 0-100 composite based on company size, role seniority, industry, domain, form context
 * Routing: territory → campaign → fallback owner
 */

interface ScoringInput {
  company_name: string | null
  company_size: string | null
  industry: string | null
  job_title: string | null
  domain: string | null
  lead_type: 'ad_form' | 'event_form'
  campaign_name: string | null
  custom_fields: Record<string, string>
}

export interface ScoreResult {
  icp_score: number
  score_breakdown: {
    company_size: number
    role_seniority: number
    industry_fit: number
    domain_quality: number
    form_context: number
  }
  urgency: 'critical' | 'high' | 'normal' | 'low'
  should_create_deal: boolean
}

export interface RoutingResult {
  owner_id: string | null
  routing_reason: string
}

// Seniority keywords ranked by value
const SENIORITY_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\b(ceo|cto|cfo|coo|cmo|cro|founder|co-founder|owner|president)\b/i, score: 100 },
  { pattern: /\b(vp|vice president|svp|evp|partner|managing director)\b/i, score: 90 },
  { pattern: /\b(director|head of|chief)\b/i, score: 80 },
  { pattern: /\b(senior manager|sr\.?\s*manager|group manager)\b/i, score: 65 },
  { pattern: /\b(manager|lead|principal|team lead)\b/i, score: 55 },
  { pattern: /\b(senior|sr\.?|specialist|consultant)\b/i, score: 40 },
  { pattern: /\b(analyst|coordinator|associate|executive)\b/i, score: 30 },
  { pattern: /\b(intern|trainee|student|assistant|junior|jr\.?)\b/i, score: 10 },
]

// Company size scoring
const SIZE_SCORES: Record<string, number> = {
  '10001+': 90,
  '5001-10000': 85,
  '1001-5000': 80,
  '501-1000': 70,
  '201-500': 65,
  '51-200': 55,
  '11-50': 40,
  '1-10': 25,
}

export function scoreLinkedInLead(input: ScoringInput): ScoreResult {
  // 1. Company size (0-100, weight 0.20)
  let companySizeScore = 40 // default
  if (input.company_size) {
    const normalized = input.company_size.replace(/\s/g, '')
    companySizeScore = SIZE_SCORES[normalized] ?? estimateSizeScore(input.company_size)
  }

  // 2. Role seniority (0-100, weight 0.30)
  let roleSeniorityScore = 30 // default
  if (input.job_title) {
    for (const { pattern, score } of SENIORITY_PATTERNS) {
      if (pattern.test(input.job_title)) {
        roleSeniorityScore = score
        break
      }
    }
  }

  // 3. Industry fit (0-100, weight 0.15)
  // Without org-specific ICP config, default to neutral
  const industryFitScore = input.industry ? 60 : 40

  // 4. Domain quality (0-100, weight 0.15)
  let domainQualityScore = 50
  if (input.domain) {
    if (input.domain.endsWith('.gov') || input.domain.endsWith('.edu')) {
      domainQualityScore = 85
    } else if (input.domain.endsWith('.io') || input.domain.endsWith('.ai')) {
      domainQualityScore = 70
    } else if (input.domain.endsWith('.com')) {
      domainQualityScore = 60
    }
  }

  // 5. Form context (0-100, weight 0.20)
  let formContextScore = 50
  if (input.lead_type === 'event_form') {
    formContextScore = 70 // event attendees tend to be higher intent
  }
  if (input.campaign_name?.toLowerCase().includes('demo')) {
    formContextScore = 90 // demo requests are highest intent
  } else if (input.campaign_name?.toLowerCase().includes('whitepaper') || input.campaign_name?.toLowerCase().includes('ebook')) {
    formContextScore = 45 // content downloads are lower intent
  }
  // Custom field answers can boost (e.g., budget, timeline questions)
  const customValues = Object.values(input.custom_fields).join(' ').toLowerCase()
  if (customValues.includes('immediately') || customValues.includes('asap') || customValues.includes('this quarter')) {
    formContextScore = Math.min(100, formContextScore + 20)
  }

  // Weighted composite
  const icpScore = Math.round(
    companySizeScore * 0.20 +
    roleSeniorityScore * 0.30 +
    industryFitScore * 0.15 +
    domainQualityScore * 0.15 +
    formContextScore * 0.20
  )

  return {
    icp_score: icpScore,
    score_breakdown: {
      company_size: companySizeScore,
      role_seniority: roleSeniorityScore,
      industry_fit: industryFitScore,
      domain_quality: domainQualityScore,
      form_context: formContextScore,
    },
    urgency: scoreToUrgency(icpScore),
    should_create_deal: icpScore >= 70,
  }
}

export async function routeToOwner(
  supabase: SupabaseClient,
  orgId: string,
  leadSourceId: string,
  campaignName: string | null
): Promise<RoutingResult> {
  // 1. Check if the lead source has a specific owner configured
  // (future: territory/campaign routing rules table)

  // 2. Fallback: org's default lead owner or first admin
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle()

  if (orgSettings?.owner_id) {
    return { owner_id: orgSettings.owner_id, routing_reason: 'org_default_owner' }
  }

  // 3. Last resort: first org admin
  const { data: firstAdmin } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  if (firstAdmin?.user_id) {
    return { owner_id: firstAdmin.user_id, routing_reason: 'first_org_owner' }
  }

  return { owner_id: null, routing_reason: 'no_owner_found' }
}

function scoreToUrgency(score: number): 'critical' | 'high' | 'normal' | 'low' {
  if (score >= 80) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 30) return 'normal'
  return 'low'
}

function estimateSizeScore(sizeStr: string): number {
  // Try to parse numeric values from free text
  const num = parseInt(sizeStr.replace(/[^\d]/g, ''), 10)
  if (isNaN(num)) return 40
  if (num >= 10000) return 90
  if (num >= 5000) return 85
  if (num >= 1000) return 80
  if (num >= 500) return 70
  if (num >= 200) return 65
  if (num >= 50) return 55
  if (num >= 10) return 40
  return 25
}
