import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * Contact/Company Matching for LinkedIn Leads
 *
 * Match priority: email exact → LinkedIn URL → domain + company name
 * Creates new contacts/companies if no match found.
 * Ambiguous matches flagged for review (not auto-merged).
 */

interface NormalizedLead {
  notification_id: string
  lead_type: 'ad_form' | 'event_form'
  form_id: string
  submitted_at: string
  is_test: boolean
  campaign_name: string | null
  event_name: string | null
  ad_account_name: string | null
  associated_entity: string
  submitter_urn: string
  fields: Record<string, string>
  custom_fields: Record<string, string>
  raw_payload: Record<string, unknown>
}

export interface MatchResult {
  contact_id: string
  company_id: string | null
  match_type: 'email_exact' | 'linkedin_url' | 'domain_heuristic' | 'created_new' | 'ambiguous'
  is_new_contact: boolean
  is_new_company: boolean
}

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'live.com', 'msn.com',
  'me.com', 'mac.com', 'googlemail.com', 'ymail.com', 'rocketmail.com',
])

export async function matchOrCreateContact(
  supabase: SupabaseClient,
  lead: NormalizedLead,
  orgId: string,
  leadSourceId: string,
  ownerId: string | null
): Promise<MatchResult> {
  const email = lead.fields.email?.trim().toLowerCase() || null
  const linkedinUrl = lead.fields.linkedin_url?.trim() || null
  const companyName = lead.fields.company_name?.trim() || null
  const firstName = lead.fields.first_name?.trim() || null
  const lastName = lead.fields.last_name?.trim() || null
  const jobTitle = lead.fields.job_title?.trim() || null
  const phone = lead.fields.phone?.trim() || null

  // 1. Try email exact match
  if (email) {
    const { data: emailMatch } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('org_id', orgId)
      .ilike('email', email)
      .limit(2)

    if (emailMatch && emailMatch.length === 1) {
      // Exact single match — update with lead metadata
      await updateContactWithLeadData(supabase, emailMatch[0].id, lead, leadSourceId)
      return {
        contact_id: emailMatch[0].id,
        company_id: emailMatch[0].company_id,
        match_type: 'email_exact',
        is_new_contact: false,
        is_new_company: false,
      }
    }

    if (emailMatch && emailMatch.length > 1) {
      // Ambiguous — multiple contacts with same email, flag for review
      await updateContactWithLeadData(supabase, emailMatch[0].id, lead, leadSourceId)
      return {
        contact_id: emailMatch[0].id,
        company_id: emailMatch[0].company_id,
        match_type: 'ambiguous',
        is_new_contact: false,
        is_new_company: false,
      }
    }
  }

  // 2. Try LinkedIn URL match
  if (linkedinUrl) {
    const { data: linkedinMatch } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('org_id', orgId)
      .ilike('linkedin_url', `%${extractLinkedInSlug(linkedinUrl)}%`)
      .limit(2)

    if (linkedinMatch && linkedinMatch.length === 1) {
      await updateContactWithLeadData(supabase, linkedinMatch[0].id, lead, leadSourceId)
      return {
        contact_id: linkedinMatch[0].id,
        company_id: linkedinMatch[0].company_id,
        match_type: 'linkedin_url',
        is_new_contact: false,
        is_new_company: false,
      }
    }
  }

  // 3. Try domain + company name heuristic
  const domain = email ? email.split('@')[1] : null
  let companyId: string | null = null
  let isNewCompany = false

  if (domain && !PERSONAL_DOMAINS.has(domain)) {
    const { data: domainMatch } = await supabase
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .ilike('domain', domain)
      .limit(1)
      .maybeSingle()

    if (domainMatch) {
      companyId = domainMatch.id
    }
  }

  // No domain match — try company name
  if (!companyId && companyName) {
    const { data: nameMatch } = await supabase
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', companyName)
      .limit(1)
      .maybeSingle()

    if (nameMatch) {
      companyId = nameMatch.id
    }
  }

  // Create company if needed
  if (!companyId && companyName && domain && !PERSONAL_DOMAINS.has(domain)) {
    const { data: newCompany } = await supabase
      .from('companies')
      .insert({
        org_id: orgId,
        owner_id: ownerId,
        name: companyName,
        domain,
        industry: lead.fields.industry || null,
        size: lead.fields.company_size || null,
      })
      .select('id')
      .single()

    if (newCompany) {
      companyId = newCompany.id
      isNewCompany = true
    }
  }

  // 4. Create new contact
  const { data: newContact } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      owner_id: ownerId,
      first_name: firstName,
      last_name: lastName,
      email,
      title: jobTitle,
      phone,
      company_id: companyId,
      linkedin_url: linkedinUrl,
      linkedin_lead_source_id: leadSourceId,
      linkedin_lead_payload: lead.raw_payload,
      linkedin_lead_received_at: lead.submitted_at,
    })
    .select('id')
    .single()

  if (!newContact) {
    throw new Error('Failed to create contact from LinkedIn lead')
  }

  // Store custom form fields as contact custom fields
  if (Object.keys(lead.custom_fields).length > 0) {
    await storeCustomFields(supabase, newContact.id, orgId, lead.custom_fields)
  }

  return {
    contact_id: newContact.id,
    company_id: companyId,
    match_type: 'created_new',
    is_new_contact: true,
    is_new_company: isNewCompany,
  }
}

async function updateContactWithLeadData(
  supabase: SupabaseClient,
  contactId: string,
  lead: NormalizedLead,
  leadSourceId: string
): Promise<void> {
  await supabase
    .from('contacts')
    .update({
      linkedin_lead_source_id: leadSourceId,
      linkedin_lead_payload: lead.raw_payload,
      linkedin_lead_received_at: lead.submitted_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)

  if (Object.keys(lead.custom_fields).length > 0) {
    const orgResult = await supabase.from('contacts').select('org_id').eq('id', contactId).single()
    if (orgResult.data?.org_id) {
      await storeCustomFields(supabase, contactId, orgResult.data.org_id, lead.custom_fields)
    }
  }
}

async function storeCustomFields(
  supabase: SupabaseClient,
  contactId: string,
  orgId: string,
  customFields: Record<string, string>
): Promise<void> {
  // Store custom fields in contact_custom_fields (if table exists)
  // Graceful fallback — store in contacts.linkedin_lead_payload if custom fields table doesn't exist
  try {
    const entries = Object.entries(customFields).map(([key, value]) => ({
      contact_id: contactId,
      org_id: orgId,
      field_name: key,
      field_value: value,
      source: 'linkedin_lead',
    }))

    const { error } = await supabase.from('contact_custom_fields').upsert(entries, {
      onConflict: 'contact_id,field_name',
    })

    if (error) {
      // Table may not exist — that's fine, data is in linkedin_lead_payload
      console.warn('[matching] Custom fields table error (non-fatal):', error.message)
    }
  } catch {
    // Non-fatal
  }
}

function extractLinkedInSlug(url: string): string {
  // Extract the slug from various LinkedIn URL formats
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/)
  return match ? match[1] : url
}
