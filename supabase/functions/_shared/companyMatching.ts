/**
 * Company Matching Utilities for Fathom Sync
 * Shared utilities for edge functions (Deno runtime)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export interface Company {
  id: string
  name: string
  domain: string | null
  owner_id: string
  source?: string
  first_seen_at?: string
  created_at: string
  updated_at: string
}

// Personal email domains to filter out
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'live.com',
  'msn.com',
  'protonmail.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'gmx.com',
  'fastmail.com',
]

/**
 * Extract business domain from email address
 */
export function extractBusinessDomain(email: string): string | null {
  if (!email || !email.includes('@')) {
    return null
  }

  const domain = email.split('@')[1]?.toLowerCase().trim()

  if (!domain) {
    return null
  }

  // Filter out personal email domains
  if (PERSONAL_EMAIL_DOMAINS.includes(domain)) {
    return null
  }

  return domain
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1

  const len1 = s1.length
  const len2 = s2.length

  if (len1 === 0 || len2 === 0) return 0

  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0))

  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  const distance = matrix[len1][len2]
  const maxLength = Math.max(len1, len2)

  return 1 - distance / maxLength
}

/**
 * Normalize company name for fuzzy matching
 */
function normalizeCompanyName(name: string): string {
  if (!name) return ''

  let normalized = name.toLowerCase().trim()

  const suffixes = [
    ' inc', ' inc.', ' incorporated',
    ' corp', ' corp.', ' corporation',
    ' ltd', ' ltd.', ' limited',
    ' llc', ' l.l.c.', ' llp',
    ' plc', ' gmbh', ' ag', ' sa', ' bv', ' nv',
    ' co', ' co.', ' company',
    ' group', ' holdings', ' enterprises',
  ]

  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length).trim()
    }
  }

  normalized = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
}

/**
 * Generate company name from domain
 */
function generateCompanyNameFromDomain(domain: string): string {
  if (!domain) return ''

  let name = domain
    .replace(/\.(com|org|net|co\.uk|io|ai|tech|app|dev|biz|info)$/i, '')
    .replace(/^www\./, '')

  const parts = name.split(/[.\-_]/)

  const formatted = parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return formatted
}

/**
 * Find company by domain (exact match)
 */
export async function findCompanyByDomain(
  supabase: SupabaseClient,
  domain: string,
  userId: string
): Promise<Company | null> {
  if (!domain || !userId) {
    return null
  }

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('owner_id', userId)
    .ilike('domain', domain)
    .single()

  if (error && error.code !== 'PGRST116') {
    return null
  }

  return data
}

/**
 * Find company by fuzzy name matching
 */
export async function findCompanyByFuzzyName(
  supabase: SupabaseClient,
  name: string,
  userId: string,
  similarityThreshold: number = 0.85
): Promise<Company | null> {
  if (!name || !userId) {
    return null
  }

  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .eq('owner_id', userId)

  if (error || !companies || companies.length === 0) {
    return null
  }

  const normalizedInput = normalizeCompanyName(name)

  let bestMatch: Company | null = null
  let highestSimilarity = 0

  for (const company of companies) {
    const normalizedCompanyName = normalizeCompanyName(company.name)
    const similarity = calculateStringSimilarity(normalizedInput, normalizedCompanyName)

    if (similarity > highestSimilarity && similarity >= similarityThreshold) {
      highestSimilarity = similarity
      bestMatch = company
    }
  }

  if (bestMatch) {
  }

  return bestMatch
}

/**
 * Create new company from domain
 */
export async function createCompanyFromDomain(
  supabase: SupabaseClient,
  domain: string,
  userId: string,
  suggestedName?: string,
  source: string = 'fathom_meeting'
): Promise<Company | null> {
  if (!domain || !userId) {
    return null
  }

  const companyName = suggestedName || generateCompanyNameFromDomain(domain)

  // Check if name already exists (fuzzy match)
  const existingCompany = await findCompanyByFuzzyName(supabase, companyName, userId)
  if (existingCompany) {
    // Update domain if missing
    if (!existingCompany.domain) {
      const { data: updated, error: updateError } = await supabase
        .from('companies')
        .update({
          domain,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCompany.id)
        .select()
        .single()

      if (updateError) {
        return existingCompany
      }

      return updated
    }

    return existingCompany
  }

  // Create new company
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: companyName,
      domain: domain.toLowerCase(),
      website: `https://${domain}`,
      owner_id: userId,
      source,
      first_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    // If duplicate domain, try to fetch it (race condition)
    if (error.code === '23505' && error.message?.includes('domain')) {
      return await findCompanyByDomain(supabase, domain, userId)
    }
    return null
  }
  return data
}

/**
 * Match or create company from email
 * Returns company and whether it was newly created
 */
export async function matchOrCreateCompany(
  supabase: SupabaseClient,
  email: string,
  userId: string,
  contactName?: string,
  source: string = 'fathom_meeting'
): Promise<{ company: Company | null; isNew: boolean }> {
  const domain = extractBusinessDomain(email)

  if (!domain) {
    return { company: null, isNew: false }
  }

  // Try exact domain match
  let company = await findCompanyByDomain(supabase, domain, userId)

  if (company) {
    return { company, isNew: false }
  }

  // Try fuzzy name match
  const generatedName = generateCompanyNameFromDomain(domain)
  company = await findCompanyByFuzzyName(supabase, generatedName, userId)

  if (company) {
    // Update domain if missing
    if (!company.domain) {
      const { data: updated } = await supabase
        .from('companies')
        .update({
          domain,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)
        .select()
        .single()

      return { company: updated || company, isNew: false }
    }

    return { company, isNew: false }
  }

  // Create new company
  const newCompany = await createCompanyFromDomain(supabase, domain, userId, contactName, source)
  return { company: newCompany, isNew: !!newCompany }
}
