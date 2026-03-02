/**
 * Primary Contact Selection Utilities for Fathom Sync
 * Shared utilities for edge functions (Deno runtime)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

export interface Contact {
  id: string
  first_name: string
  last_name: string
  full_name: string | null
  email: string
  company_id: string | null
  title: string | null
  total_meetings_count: number
}

export interface ContactScore {
  contact: Contact
  score: number
  reasons: string[]
}

// Job title keywords indicating seniority
const SENIORITY_KEYWORDS: Record<string, number> = {
  'CEO': 100,
  'Chief Executive': 100,
  'Founder': 95,
  'Co-Founder': 95,
  'President': 90,
  'CFO': 90,
  'Chief Financial': 90,
  'COO': 90,
  'Chief Operating': 90,
  'CTO': 90,
  'Chief Technology': 90,
  'CMO': 85,
  'Chief Marketing': 85,
  'CRO': 85,
  'Chief Revenue': 85,
  'VP': 70,
  'Vice President': 70,
  'EVP': 75,
  'Executive Vice President': 75,
  'SVP': 75,
  'Senior Vice President': 75,
  'Director': 50,
  'Managing Director': 60,
  'Executive Director': 55,
  'Manager': 30,
  'Senior Manager': 35,
  'Lead': 25,
  'Team Lead': 25,
  'Senior': 15,
  'Principal': 20,
  'Staff': 10,
}

/**
 * Calculate seniority score from job title
 */
function calculateSeniorityScore(title: string | null): number {
  if (!title) return 0

  const titleUpper = title.toUpperCase()
  let maxScore = 0

  for (const [keyword, score] of Object.entries(SENIORITY_KEYWORDS)) {
    if (titleUpper.includes(keyword.toUpperCase())) {
      maxScore = Math.max(maxScore, score)
    }
  }

  return maxScore
}

/**
 * Select primary contact from list of contact IDs
 */
export async function selectPrimaryContact(
  supabase: SupabaseClient,
  contactIds: string[],
  userId: string
): Promise<string | null> {
  if (!contactIds || contactIds.length === 0) {
    return null
  }

  if (contactIds.length === 1) {
    return contactIds[0]
  }

  // Fetch all contacts
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, full_name, email, company_id, title, total_meetings_count')
    .in('id', contactIds)
    .eq('owner_id', userId)

  if (error || !contacts || contacts.length === 0) {
    return contactIds[0]
  }

  // Calculate scores
  const scores: ContactScore[] = contacts.map(contact => ({
    contact,
    score: 0,
    reasons: [],
  }))

  // 1. Meeting History Score (40% weight)
  const maxMeetings = Math.max(...contacts.map(c => c.total_meetings_count || 0))
  if (maxMeetings > 0) {
    scores.forEach(item => {
      const meetingScore = ((item.contact.total_meetings_count || 0) / maxMeetings) * 40
      item.score += meetingScore
      if (item.contact.total_meetings_count > 0) {
        item.reasons.push(
          `${item.contact.total_meetings_count} previous meeting${item.contact.total_meetings_count > 1 ? 's' : ''}`
        )
      }
    })
  }

  // 2. Seniority Score (30% weight)
  scores.forEach(item => {
    const seniorityScore = (calculateSeniorityScore(item.contact.title) / 100) * 30
    item.score += seniorityScore
    if (seniorityScore > 5) {
      item.reasons.push(`Senior title: ${item.contact.title}`)
    }
  })

  // 3. Company Majority Score (20% weight)
  const companyCount = new Map<string, number>()
  contacts.forEach(contact => {
    if (contact.company_id) {
      const count = companyCount.get(contact.company_id) || 0
      companyCount.set(contact.company_id, count + 1)
    }
  })

  const maxCompanyCount = Math.max(...Array.from(companyCount.values()), 0)
  if (maxCompanyCount > 1) {
    scores.forEach(item => {
      if (item.contact.company_id) {
        const count = companyCount.get(item.contact.company_id) || 0
        if (count === maxCompanyCount) {
          item.score += 20
          item.reasons.push(`Majority company (${count} attendees)`)
        }
      }
    })
  }

  // 4. Email Domain Quality Score (10% weight)
  scores.forEach(item => {
    const email = item.contact.email.toLowerCase()
    if (email.includes('@')) {
      const domain = email.split('@')[1]

      const genericProviders = ['zoho.com', 'mail.com', 'fastmail.com']
      const isGeneric = genericProviders.some(provider => domain.includes(provider))

      if (!isGeneric) {
        item.score += 10
        item.reasons.push('Corporate email domain')
      }
    }
  })

  // Sort by score
  scores.sort((a, b) => b.score - a.score)

  const winner = scores[0]

  const displayName = winner.contact.full_name || `${winner.contact.first_name} ${winner.contact.last_name}`.trim()
  return winner.contact.id
}

/**
 * Determine meeting company based on primary contact or attendee majority
 */
export async function determineMeetingCompany(
  supabase: SupabaseClient,
  contactIds: string[],
  primaryContactId: string | null,
  userId: string
): Promise<string | null> {
  if (!contactIds || contactIds.length === 0) {
    return null
  }

  // If we have a primary contact, use their company
  if (primaryContactId) {
    const { data: primaryContact } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', primaryContactId)
      .eq('owner_id', userId)
      .single()

    if (primaryContact?.company_id) {
      return primaryContact.company_id
    }
  }

  // Otherwise, find company with most attendees
  const { data: contacts } = await supabase
    .from('contacts')
    .select('company_id')
    .in('id', contactIds)
    .eq('owner_id', userId)

  if (!contacts || contacts.length === 0) {
    return null
  }

  const companyCount = new Map<string, number>()
  contacts.forEach(contact => {
    if (contact.company_id) {
      const count = companyCount.get(contact.company_id) || 0
      companyCount.set(contact.company_id, count + 1)
    }
  })

  if (companyCount.size === 0) {
    return null
  }

  let maxCompanyId: string | null = null
  let maxCount = 0

  companyCount.forEach((count, companyId) => {
    if (count > maxCount) {
      maxCount = count
      maxCompanyId = companyId
    }
  })

  return maxCompanyId
}
