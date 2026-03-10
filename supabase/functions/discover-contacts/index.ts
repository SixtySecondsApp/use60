import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

const AI_ARK_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'
const APOLLO_BASE = 'https://api.apollo.io/api/v1'

const DEFAULT_ICP_TITLES = [
  'VP Sales',
  'Head of Sales',
  'CRO',
  'VP Marketing',
  'Head of Growth',
  'CEO',
  'Founder',
]

const SENIORITY_RANK: Record<string, number> = {
  'c_suite': 1,
  'c-suite': 1,
  'csuite': 1,
  'owner': 1,
  'founder': 1,
  'cxo': 1,
  'partner': 2,
  'vp': 3,
  'vice_president': 3,
  'vice-president': 3,
  'director': 4,
  'head': 4,
  'senior': 5,
  'manager': 6,
}

interface DiscoveredContact {
  first_name: string
  last_name: string
  full_name: string
  title: string
  seniority: string
  department?: string
  linkedin_url?: string | null
  photo_url?: string | null
  email?: string | null
  company_name: string
  location?: string | null
  recent_posts?: string[]
}

function getSeniorityScore(seniority: string): number {
  if (!seniority) return 99
  const key = seniority.toLowerCase().trim().replace(/\s+/g, '_')
  // Check exact match first
  if (SENIORITY_RANK[key] !== undefined) return SENIORITY_RANK[key]
  // Check partial match
  for (const [term, rank] of Object.entries(SENIORITY_RANK)) {
    if (key.includes(term) || term.includes(key)) return rank
  }
  return 99
}

function normalizeSeniority(raw: string | undefined | null): string {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase().trim()
  if (lower.includes('c_suite') || lower.includes('c-suite') || lower.includes('cxo') || lower === 'owner' || lower === 'founder') return 'C-Suite'
  if (lower.includes('vp') || lower.includes('vice')) return 'VP'
  if (lower.includes('director') || lower.includes('head')) return 'Director'
  if (lower.includes('senior')) return 'Senior'
  if (lower.includes('manager')) return 'Manager'
  if (lower.includes('partner')) return 'Partner'
  // Return original with first letter capitalized
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function searchAiArk(domain: string, titles: string[]): Promise<DiscoveredContact[]> {
  const apiKey = Deno.env.get('AI_ARK_API_KEY')
  if (!apiKey) {
    console.warn('[discover-contacts] AI_ARK_API_KEY not set, skipping AI Ark')
    return []
  }

  const body = {
    page: 0,
    size: 10,
    account: {
      domain: { any: { include: [domain] } },
    },
    contact: {
      title: { any: { include: titles, searchMode: 'SMART' } },
    },
  }

  console.log('[discover-contacts] AI Ark request:', JSON.stringify(body))

  const response = await fetchWithTimeout(`${AI_ARK_BASE}/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TOKEN': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`[discover-contacts] AI Ark error ${response.status}: ${text}`)
    return []
  }

  const data = await response.json()
  const people = data?.content || []
  console.log(`[discover-contacts] AI Ark returned ${people.length} contacts`)

  return people.map((p: any) => {
    const firstName = p.profile?.first_name || ''
    const lastName = p.profile?.last_name || ''
    return {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      title: p.profile?.title || '',
      seniority: normalizeSeniority(p.department?.seniority),
      department: p.department?.name || undefined,
      linkedin_url: p.link?.linkedin || null,
      photo_url: p.profile?.picture?.source || null,
      email: null,
      company_name: p.experiences?.[0]?.company?.name || domain,
      location: p.location?.default || null,
      recent_posts: [],
    } as DiscoveredContact
  })
}

async function searchApollo(domain: string, titles: string[]): Promise<DiscoveredContact[]> {
  const apiKey = Deno.env.get('APOLLO_API_KEY')
  if (!apiKey) {
    console.warn('[discover-contacts] APOLLO_API_KEY not set, skipping Apollo')
    return []
  }

  const body = {
    q_organization_domains: domain,
    person_titles: titles,
    per_page: 10,
  }

  console.log('[discover-contacts] Apollo request:', JSON.stringify(body))

  const response = await fetchWithTimeout(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`[discover-contacts] Apollo error ${response.status}: ${text}`)
    return []
  }

  const data = await response.json()
  const people = data?.people || []
  console.log(`[discover-contacts] Apollo returned ${people.length} contacts`)

  return people.map((p: any) => ({
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    title: p.title || '',
    seniority: normalizeSeniority(p.seniority),
    department: p.department || undefined,
    linkedin_url: p.linkedin_url || null,
    photo_url: p.photo_url || null,
    email: p.email || null,
    company_name: p.organization?.name || domain,
    location: p.city && p.state ? `${p.city}, ${p.state}` : (p.city || p.state || null),
    recent_posts: [],
  } as DiscoveredContact))
}

function normalizeLinkedin(url: string | null | undefined): string | null {
  if (!url) return null
  // Extract the path portion to normalize trailing slashes, http vs https, etc.
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/)
  return match ? match[1].toLowerCase() : url.toLowerCase()
}

function mergeContacts(
  aiArkContacts: DiscoveredContact[],
  apolloContacts: DiscoveredContact[],
  maxContacts: number,
): DiscoveredContact[] {
  // Build lookup maps for Apollo contacts
  const apolloByLinkedin = new Map<string, DiscoveredContact>()
  const apolloByName = new Map<string, DiscoveredContact>()

  for (const ac of apolloContacts) {
    const linkedinKey = normalizeLinkedin(ac.linkedin_url)
    if (linkedinKey) apolloByLinkedin.set(linkedinKey, ac)
    if (ac.full_name) apolloByName.set(ac.full_name.toLowerCase(), ac)
  }

  const merged: DiscoveredContact[] = []
  const usedApolloNames = new Set<string>()
  const usedLinkedins = new Set<string>()

  // Phase 1: Start with AI Ark results, enrich from Apollo
  for (const arkContact of aiArkContacts) {
    const linkedinKey = normalizeLinkedin(arkContact.linkedin_url)
    const nameKey = arkContact.full_name.toLowerCase()

    // Find matching Apollo contact
    let apolloMatch: DiscoveredContact | undefined
    if (linkedinKey && apolloByLinkedin.has(linkedinKey)) {
      apolloMatch = apolloByLinkedin.get(linkedinKey)
    } else if (apolloByName.has(nameKey)) {
      apolloMatch = apolloByName.get(nameKey)
    }

    // Fill gaps from Apollo
    if (apolloMatch) {
      if (!arkContact.photo_url && apolloMatch.photo_url) {
        arkContact.photo_url = apolloMatch.photo_url
      }
      if (!arkContact.email && apolloMatch.email) {
        arkContact.email = apolloMatch.email
      }
      if (!arkContact.linkedin_url && apolloMatch.linkedin_url) {
        arkContact.linkedin_url = apolloMatch.linkedin_url
      }
      if (!arkContact.location && apolloMatch.location) {
        arkContact.location = apolloMatch.location
      }
      if (arkContact.seniority === 'unknown' && apolloMatch.seniority !== 'unknown') {
        arkContact.seniority = apolloMatch.seniority
      }
      usedApolloNames.add(apolloMatch.full_name.toLowerCase())
    }

    merged.push(arkContact)
    if (linkedinKey) usedLinkedins.add(linkedinKey)
  }

  // Phase 2: Fill remaining slots with unique Apollo contacts
  if (merged.length < maxContacts) {
    for (const ac of apolloContacts) {
      if (merged.length >= maxContacts) break

      const linkedinKey = normalizeLinkedin(ac.linkedin_url)
      const nameKey = ac.full_name.toLowerCase()

      // Skip if already used
      if (usedApolloNames.has(nameKey)) continue
      if (linkedinKey && usedLinkedins.has(linkedinKey)) continue

      // Skip contacts with empty names
      if (!ac.full_name.trim()) continue

      merged.push(ac)
      usedApolloNames.add(nameKey)
      if (linkedinKey) usedLinkedins.add(linkedinKey)
    }
  }

  // Sort by seniority
  merged.sort((a, b) => getSeniorityScore(a.seniority) - getSeniorityScore(b.seniority))

  // Return up to maxContacts
  return merged.slice(0, maxContacts)
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    // Parse request body
    const body = await req.json()
    const { domain, icp_titles, max_contacts } = body as {
      domain?: string
      icp_titles?: string[]
      max_contacts?: number
    }

    if (!domain || typeof domain !== 'string') {
      return errorResponse('Missing required field: domain', req, 400)
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '')
    if (!cleanDomain) {
      return errorResponse('Invalid domain', req, 400)
    }

    const titles = icp_titles?.length ? icp_titles : DEFAULT_ICP_TITLES
    const limit = Math.min(Math.max(max_contacts || 5, 1), 10)

    console.log(`[discover-contacts] Searching for ${limit} contacts at ${cleanDomain} with titles: ${titles.join(', ')}`)

    // Run both searches in parallel for resilience
    const [aiArkResult, apolloResult] = await Promise.allSettled([
      searchAiArk(cleanDomain, titles),
      searchApollo(cleanDomain, titles),
    ])

    const aiArkContacts = aiArkResult.status === 'fulfilled' ? aiArkResult.value : []
    const apolloContacts = apolloResult.status === 'fulfilled' ? apolloResult.value : []

    if (aiArkResult.status === 'rejected') {
      console.error('[discover-contacts] AI Ark failed:', aiArkResult.reason)
    }
    if (apolloResult.status === 'rejected') {
      console.error('[discover-contacts] Apollo failed:', apolloResult.reason)
    }

    console.log(`[discover-contacts] AI Ark: ${aiArkContacts.length}, Apollo: ${apolloContacts.length}`)

    if (aiArkContacts.length === 0 && apolloContacts.length === 0) {
      return jsonResponse({
        success: true,
        contacts: [],
        message: 'No contacts found for this domain and title criteria',
      }, req)
    }

    const contacts = mergeContacts(aiArkContacts, apolloContacts, limit)

    // Secondary enrichment: EXA search for LinkedIn activity per contact
    const exaKey = Deno.env.get('EXA_API_KEY')
    if (exaKey && contacts.length > 0) {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const startDate = threeMonthsAgo.toISOString().split('T')[0]

      const activityResults = await Promise.allSettled(
        contacts.map(async (contact) => {
          const query = `${contact.full_name} ${contact.company_name} linkedin`
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 5000)
          try {
            const res = await fetch('https://api.exa.ai/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey },
              body: JSON.stringify({
                query,
                numResults: 3,
                contents: { text: true, highlights: true },
                useAutoprompt: true,
                type: 'neural',
                startPublishedDate: startDate,
              }),
              signal: controller.signal,
            })
            if (!res.ok) return []
            const data = await res.json()
            return (data.results || []).slice(0, 3).map((r: any) => r.title || '').filter(Boolean)
          } catch {
            return []
          } finally {
            clearTimeout(timer)
          }
        }),
      )

      activityResults.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          contacts[i].recent_posts = result.value
        }
      })

      const enrichedCount = activityResults.filter(r => r.status === 'fulfilled' && r.value.length > 0).length
      console.log(`[discover-contacts] EXA enriched ${enrichedCount}/${contacts.length} contacts with activity`)
    }

    console.log(`[discover-contacts] Returning ${contacts.length} merged contacts`)

    return jsonResponse({ success: true, contacts }, req)
  } catch (err) {
    console.error('[discover-contacts] Unexpected error:', err)
    if (err instanceof SyntaxError) {
      return errorResponse('Invalid JSON in request body', req, 400)
    }
    return errorResponse('Internal server error', req, 500)
  }
})
