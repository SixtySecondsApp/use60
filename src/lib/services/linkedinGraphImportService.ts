import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveImport {
  id: string
  file_name?: string
  file_type?: string
  status: string
  total_records: number
  imported_records: number
  matched_records: number
  created_at: string
  completed_at?: string
}

export interface ImportContact {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  company?: string
  position?: string
  linkedin_url?: string
  connected_on?: string
  match_confidence?: string
  matched_contact_id?: string
}

export interface RelationshipScore {
  id: string
  contact_id: string
  trust_tier: string
  total_messages: number
  inbound_messages: number
  outbound_messages: number
  last_message_date?: string
  composite_score?: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const linkedinGraphImportService = {
  async listImports() {
    const { data, error } = await supabase
      .from('linkedin_archive_imports')
      .select('id, file_name, file_type, status, total_records, imported_records, matched_records, created_at, completed_at')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as ArchiveImport[]
  },

  async getImportContacts(importId: string) {
    const { data, error } = await supabase
      .from('linkedin_import_contacts')
      .select('id, first_name, last_name, email, company, position, linkedin_url, connected_on, match_confidence, matched_contact_id')
      .eq('import_id', importId)
      .order('connected_on', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as ImportContact[]
  },

  async getRelationshipScores(orgId: string) {
    const { data, error } = await supabase
      .from('linkedin_import_relationship_scores')
      .select('id, contact_id, trust_tier, total_messages, inbound_messages, outbound_messages, last_message_date, composite_score')
      .eq('org_id', orgId)
      .order('composite_score', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as RelationshipScore[]
  },

  async createImport(orgId: string, fileName: string, fileType: string) {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('linkedin_archive_imports')
      .insert({ user_id: userData.user.id, org_id: orgId, file_name: fileName, file_type: fileType })
      .select('id, file_name, file_type, status, total_records, imported_records, matched_records, created_at')
      .single()
    if (error) throw new Error(error.message)
    return data as ArchiveImport
  },
}
