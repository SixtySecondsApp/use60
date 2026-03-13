// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { InstantlyClient } from '../_shared/instantly.ts'

/**
 * setup-pipeline-template — Create an ops table from any pipeline template config.
 *
 * POST body: {
 *   org_id: string,
 *   template_key: string,
 *   template_config: PipelineTemplate  // full config from frontend
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Auth
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const body = await req.json()
    const { org_id, template_key, template_config, filters, use_synthetic, existing_table_id } = body
    if (!org_id || !template_config) {
      return new Response(
        JSON.stringify({ error: 'org_id and template_config required' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const isAppendMode = !!existing_table_id
    console.log(`[setup-pipeline-template] Starting template="${template_key}" org=${org_id} user=${user.id}${isAppendMode ? ` APPEND to ${existing_table_id}` : ''}`)

    // ── 1. Fetch source data ────────────────────────────────────

    const dataSource = template_config.dataSource
    let sourceRows: Record<string, string>[] = []

    // If use_synthetic is explicitly requested, skip fetching real data
    if (use_synthetic) {
      sourceRows = dataSource.synthetic_rows ?? []
      console.log(`[setup-pipeline-template] Using ${sourceRows.length} synthetic rows (user requested)`)
    }

    if (sourceRows.length === 0 && dataSource.type === 'meetings') {
      let meetQuery = supabase
        .from('meetings')
        .select('id, title, meeting_start, owner_user_id, transcript_text, contact_id, primary_contact_id, company_id, summary, sentiment_score')
        .eq('org_id', org_id)
        .not('transcript_text', 'is', null)
        .order('meeting_start', { ascending: false })
        .limit(dataSource.limit ?? 500)

      // Apply optional filters
      if (filters?.date_from) meetQuery = meetQuery.gte('meeting_start', filters.date_from)
      if (filters?.sentiment === 'positive') meetQuery = meetQuery.gte('sentiment_score', 0.6)
      else if (filters?.sentiment === 'negative') meetQuery = meetQuery.lte('sentiment_score', -0.3)
      else if (filters?.sentiment === 'neutral') meetQuery = meetQuery.gt('sentiment_score', -0.3).lt('sentiment_score', 0.6)

      const { data: meetings, error: meetErr } = await meetQuery

      if (meetErr) throw meetErr

      // Resolve contacts — use contact_id or primary_contact_id
      const contactIds = (meetings ?? []).map(m => m.contact_id ?? m.primary_contact_id).filter(Boolean)
      let contactMap: Record<string, { first_name: string; last_name: string; company: string; email: string }> = {}
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, company, company_id, email')
          .in('id', contactIds)
        for (const c of contacts ?? []) {
          contactMap[c.id] = { first_name: c.first_name ?? '', last_name: c.last_name ?? '', company: c.company ?? '', company_id: c.company_id ?? '', email: c.email ?? '' }
        }
      }

      // Batch-fetch company names from companies table
      const companyIds = new Set<string>()
      for (const m of meetings ?? []) {
        if (m.company_id) companyIds.add(m.company_id)
      }
      for (const c of Object.values(contactMap)) {
        if (c.company_id) companyIds.add(c.company_id)
      }
      let companyMap: Record<string, { name: string; domain: string }> = {}
      if (companyIds.size > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name, domain')
          .in('id', Array.from(companyIds))
        for (const co of companies ?? []) {
          companyMap[co.id] = { name: co.name ?? '', domain: co.domain ?? '' }
        }
      }

      // Fetch meeting_attendees as fallback when contact_id is null
      const meetingIds = (meetings ?? []).map(m => m.id).filter(Boolean)
      // Collect ALL external attendees per meeting so we can pick the best match
      let allAttendeesMap: Record<string, Array<{ name: string; email: string }>> = {}
      let attendeeMap: Record<string, { first_name: string; last_name: string; email: string }> = {}
      if (meetingIds.length > 0) {
        const { data: attendees } = await supabase
          .from('meeting_attendees')
          .select('meeting_id, name, email, is_external')
          .in('meeting_id', meetingIds)
          .eq('is_external', true)
        for (const a of attendees ?? []) {
          if (!allAttendeesMap[a.meeting_id]) allAttendeesMap[a.meeting_id] = []
          allAttendeesMap[a.meeting_id].push({ name: a.name ?? '', email: a.email ?? '' })
        }
      }

      // Build profileMap early so we can use rep names for title matching
      const ownerIds = (meetings ?? []).map(m => m.owner_user_id).filter(Boolean)
      const uniqueOwnerIds = [...new Set(ownerIds)]
      let profileMap: Record<string, string> = {}
      if (uniqueOwnerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', uniqueOwnerIds)
        for (const p of profiles ?? []) {
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
          profileMap[p.id] = name || p.email || 'Unknown Rep'
        }
      }

      // Helper: parse meeting title as prospect name (fallback for 1:1 sales calls)
      const skipTitleWords = ['stand up', 'standup', 'check-in', 'checkin', 'catch up', 'catchup', 'sync', 'meeting', 'internal', 'team', 'weekly', 'biweekly', 'impromptu', 'google meet', 'pipeline', 'demo']
      function parseTitleAsName(title: string, repName?: string): { first_name: string; last_name: string } | null {
        if (!title) return null
        const lower = title.toLowerCase()
        if (skipTitleWords.some(w => lower.includes(w))) return null
        if (title.includes('<>')) return null

        // Handle "Name and Name" or "Name & Name" titles — pick the non-rep person
        const andMatch = title.match(/^(.+?)\s+(?:and|&)\s+(.+)$/i)
        if (andMatch) {
          const [, personA, personB] = andMatch
          if (repName) {
            const repLower = repName.toLowerCase().trim()
            const aLower = personA.trim().toLowerCase()
            const bLower = personB.trim().toLowerCase()
            const prospect = repLower.startsWith(aLower.split(' ')[0]) || aLower.startsWith(repLower.split(' ')[0])
              ? personB.trim()
              : personA.trim()
            const parts = prospect.split(/\s+/)
            return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
          }
          const parts = personB.trim().split(/\s+/)
          return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
        }

        // Handle "Name — Name" or "Name - Name" separator titles
        const sepMatch = title.match(/^(.+?)\s*(?:—|-)\s*(.+)$/)
        if (sepMatch) {
          const [, personA, personB] = sepMatch
          if (repName) {
            const repLower = repName.toLowerCase().trim()
            const aLower = personA.trim().toLowerCase()
            const prospect = repLower.startsWith(aLower.split(' ')[0]) || aLower.startsWith(repLower.split(' ')[0])
              ? personB.trim()
              : personA.trim()
            const parts = prospect.split(/\s+/)
            return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
          }
          const parts = personB.trim().split(/\s+/)
          return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
        }

        // Simple single-name title (e.g. "James Bedford")
        const parts = title.trim().split(/\s+/)
        if (parts.length < 1 || parts.length > 4) return null
        return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
      }

      // Resolve best attendee per meeting using title matching
      for (const meeting of meetings ?? []) {
        const candidates = allAttendeesMap[meeting.id] ?? []
        if (candidates.length === 0) continue

        let bestCandidate = candidates[0]

        if (candidates.length > 1 && meeting.title) {
          // Parse the title to find the prospect name, excluding the rep
          const repName = meeting.owner_user_id ? profileMap[meeting.owner_user_id] : undefined
          const titleParsed = parseTitleAsName(meeting.title, repName)

          if (titleParsed) {
            // Match attendees against the name extracted from the title
            const titleFirst = titleParsed.first_name.toLowerCase()
            const titleLast = titleParsed.last_name.toLowerCase()
            const matched = candidates.find(c => {
              const nameLower = (c.name ?? '').toLowerCase()
              return nameLower.includes(titleFirst) && (!titleLast || nameLower.includes(titleLast))
            })
            if (matched) bestCandidate = matched
          } else {
            // No parseable title — try matching each attendee name against the raw title
            const titleLower = meeting.title.toLowerCase()
            const matched = candidates.find(c => {
              const firstName = (c.name ?? '').split(' ')[0]?.toLowerCase()
              return firstName && firstName.length > 1 && titleLower.includes(firstName)
            })
            if (matched) bestCandidate = matched
          }
        }

        const parts = (bestCandidate.name ?? '').split(' ')
        attendeeMap[meeting.id] = {
          first_name: parts[0] ?? '',
          last_name: parts.slice(1).join(' ') ?? '',
          email: bestCandidate.email ?? '',
        }
      }

      // Try to match attendee emails to contacts for company info
      const attendeeEmails = Object.values(attendeeMap).map(a => a.email).filter(Boolean)
      let emailContactMap: Record<string, { company: string }> = {}
      if (attendeeEmails.length > 0) {
        const { data: emailContacts } = await supabase
          .from('contacts')
          .select('email, company')
          .in('email', attendeeEmails)
        for (const c of emailContacts ?? []) {
          if (c.email && c.company) {
            emailContactMap[c.email] = { company: c.company }
          }
        }
      }

      for (const meeting of meetings ?? []) {
        const resolvedContactId = meeting.contact_id ?? meeting.primary_contact_id
        let contact = resolvedContactId ? contactMap[resolvedContactId] : null
        let attendee = attendeeMap[meeting.id] ?? null
        const repName = meeting.owner_user_id ? profileMap[meeting.owner_user_id] : undefined

        // Helper: check if a name matches the rep
        function isRep(firstName: string, lastName: string, repFullName?: string): boolean {
          if (!repFullName) return false
          const repLower = repFullName.toLowerCase().trim()
          const first = (firstName ?? '').toLowerCase().trim()
          const last = (lastName ?? '').toLowerCase().trim()
          const fullName = [first, last].filter(Boolean).join(' ')
          // Exact full name match
          if (fullName === repLower) return true
          // First name match (handles cases where last name is missing or different format)
          const repFirst = repLower.split(' ')[0]
          const repLast = repLower.split(' ').slice(1).join(' ')
          if (first && repFirst && first === repFirst && (!last || !repLast || last === repLast)) return true
          return false
        }

        // Guard: if the resolved contact IS the rep, discard and fall back to attendee
        if (contact && isRep(contact.first_name, contact.last_name, repName)) {
          console.log(`[setup-pipeline-template] Contact "${contact.first_name} ${contact.last_name}" matches rep "${repName}", falling back to attendee`)
          contact = null
        }

        // Guard: if the resolved attendee IS the rep, try the next candidate
        if (attendee && isRep(attendee.first_name, attendee.last_name, repName)) {
          console.log(`[setup-pipeline-template] Attendee "${attendee.first_name} ${attendee.last_name}" matches rep "${repName}", picking alternate`)
          const candidates = allAttendeesMap[meeting.id] ?? []
          const alternate = candidates.find(c => {
            const cParts = (c.name ?? '').split(' ')
            return !isRep(cParts[0] ?? '', cParts.slice(1).join(' '), repName)
          })
          if (alternate) {
            const parts = (alternate.name ?? '').split(' ')
            attendee = { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') ?? '', email: alternate.email ?? '' }
          } else {
            attendee = null
          }
        }

        // Extra guard: if STILL no contact/attendee resolved, or the name ended up matching the rep anyway,
        // parse the title to find the prospect (the non-rep person)
        const resolvedFirstName = contact?.first_name || attendee?.first_name || ''
        if (isRep(resolvedFirstName, contact?.last_name || attendee?.last_name || '', repName) || (!contact && !attendee)) {
          contact = null
          // Don't use attendee if it matched the rep
          if (attendee && isRep(attendee.first_name, attendee.last_name, repName)) attendee = null
        }

        const attendeeCompany = attendee?.email ? emailContactMap[attendee.email]?.company : null
        let titleName = (!contact && !attendee) ? parseTitleAsName(meeting.title ?? '', repName) : null
        // Final guard on title-parsed name: if it still matches the rep, discard it
        if (titleName && isRep(titleName.first_name, titleName.last_name, repName)) {
          console.log(`[setup-pipeline-template] Title-parsed name "${titleName.first_name} ${titleName.last_name}" matches rep, discarding`)
          titleName = null
        }

        // If we still have nothing, try to extract the OTHER speaker from the transcript
        if (!contact && !attendee && !titleName && meeting.transcript_text && repName) {
          const speakerMatch = meeting.transcript_text.match(/\[[\d:]+\]\s+([^:]+):/g)
          if (speakerMatch) {
            const speakers = [...new Set(speakerMatch.map((s: string) => s.replace(/\[[\d:]+\]\s+/, '').replace(':', '').trim()))]
            const prospect = speakers.find((s: string) => !isRep(s.split(' ')[0], s.split(' ').slice(1).join(' '), repName))
            if (prospect) {
              const parts = prospect.split(' ')
              titleName = { first_name: parts[0], last_name: parts.slice(1).join(' ') }
              console.log(`[setup-pipeline-template] Extracted prospect "${prospect}" from transcript speakers`)
            }
          }
        }

        const finalFirst = contact?.first_name || attendee?.first_name || titleName?.first_name || 'Unknown'
        const finalLast = contact?.last_name || attendee?.last_name || titleName?.last_name || ''

        // Build a set of all known person names to check company against
        const knownPersonNames = new Set<string>()
        // Add prospect name
        const prospectFull = `${finalFirst} ${finalLast}`.toLowerCase().trim()
        if (prospectFull.length > 1) knownPersonNames.add(prospectFull)
        if (finalFirst.toLowerCase().trim().length > 1) knownPersonNames.add(finalFirst.toLowerCase().trim())
        // Add rep name
        if (repName) knownPersonNames.add(repName.toLowerCase().trim())
        // Add all attendee names for this meeting
        const allCandidates = allAttendeesMap[meeting.id] ?? []
        for (const c of allCandidates) {
          const n = (c.name ?? '').toLowerCase().trim()
          if (n.length > 1) knownPersonNames.add(n)
        }

        // Helper: detect if a string looks like a person name (e.g. "Louise Laurie", "Paul E Ryder")
        function looksLikePersonName(val: string): boolean {
          if (!val) return false
          const words = val.trim().split(/\s+/)
          if (words.length < 2 || words.length > 4) return false
          // All words start with uppercase and are short (typical name parts)
          return words.every(w => /^[A-Z][a-z]*$/.test(w) && w.length <= 15)
        }

        // Try all company sources in order, skip any that match a person name
        // Priority: meeting.company_id -> contact.company -> contact.company_id -> attendeeCompany -> domain
        const meetingCo = meeting.company_id ? companyMap[meeting.company_id] : null
        const contactCo = contact?.company_id ? companyMap[contact.company_id] : null
        const companyCandidates = [
          meetingCo?.name,
          contact?.company,
          contactCo?.name,
          attendeeCompany
        ].filter(Boolean) as string[]
        let cleanCompany = ''
        for (const candidate of companyCandidates) {
          const candidateLower = candidate.toLowerCase().trim()
          if (knownPersonNames.has(candidateLower)) {
            console.log(`[setup-pipeline-template] Company "${candidate}" matches a known person name, skipping`)
            continue
          }
          if (looksLikePersonName(candidate)) {
            console.log(`[setup-pipeline-template] Company "${candidate}" looks like a person name, skipping`)
            continue
          }
          cleanCompany = candidate
          break
        }

        // Fallback: use domain from companies table or extract from attendee email
        if (!cleanCompany) {
          const coDomain = meetingCo?.domain || contactCo?.domain || ''
          const prospectEmail = attendee?.email || ''
          const emailDomain = prospectEmail ? (prospectEmail.split('@')[1] ?? '') : ''
          const domain = coDomain || emailDomain
          const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'me.com', 'protonmail.com', 'mail.com']
          if (domain && !genericDomains.includes(domain.toLowerCase())) {
            cleanCompany = domain.split('.')[0]
            console.log(`[setup-pipeline-template] Extracted company "${cleanCompany}" from domain "${domain}"`)
          }
        }

        const row: Record<string, string> = { __source_id: meeting.id }
        const mapping = dataSource.column_mapping ?? {}

        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          if (sourceCol === 'contact_first_name') row[templateCol] = finalFirst
          else if (sourceCol === 'contact_last_name') row[templateCol] = finalLast
          else if (sourceCol === 'contact_email') row[templateCol] = contact?.email || attendee?.email || ''
          else if (sourceCol === 'contact_company') row[templateCol] = cleanCompany
          else if (sourceCol === 'meeting_date') row[templateCol] = meeting.meeting_start ?? ''
          else if (sourceCol === 'transcript_text') row[templateCol] = meeting.transcript_text ?? ''
          else if (sourceCol === 'rep_name') row[templateCol] = meeting.owner_user_id ? (profileMap[meeting.owner_user_id] ?? 'Unknown Rep') : 'Unknown Rep'
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Meetings found: ${sourceRows.length}`)
    }

    if (sourceRows.length === 0 && dataSource.type === 'contacts') {
      let contactQuery = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, title, email, engagement_level')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (filters?.search) {
        contactQuery = contactQuery.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`)
      }

      const { data: contacts, error: contactErr } = await contactQuery

      if (contactErr) throw contactErr

      const mapping = dataSource.column_mapping ?? {}
      for (const contact of contacts ?? []) {
        const row: Record<string, string> = {}
        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          row[templateCol] = (contact as any)[sourceCol] ?? ''
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Contacts found: ${sourceRows.length}`)
    }

    if (sourceRows.length === 0 && dataSource.type === 'deals') {
      const { data: deals, error: dealErr } = await supabase
        .from('deals')
        .select('id, name, stage, amount, close_date, company_name, contact_name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (dealErr) throw dealErr

      const mapping = dataSource.column_mapping ?? {}
      for (const deal of deals ?? []) {
        const row: Record<string, string> = {}
        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          row[templateCol] = String((deal as any)[sourceCol] ?? '')
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Deals found: ${sourceRows.length}`)
    }

    // Fallback to synthetic data if no real data found (and not already loaded via use_synthetic)
    if (sourceRows.length === 0 && !use_synthetic && dataSource.synthetic_rows && dataSource.synthetic_rows.length > 0) {
      sourceRows = dataSource.synthetic_rows
      console.log(`[setup-pipeline-template] Using ${sourceRows.length} synthetic rows (no real data)`)
    }

    // ── 2. Create or reuse table ─────────────────────────────────

    let tableId: string
    let tableName: string
    let colKeyToId: Record<string, string> = {}
    const columns = template_config.columns ?? []

    if (isAppendMode) {
      // Append mode: reuse existing table and columns
      const { data: existingTable, error: tableErr } = await supabase
        .from('dynamic_tables')
        .select('id, name')
        .eq('id', existing_table_id)
        .single()
      if (tableErr || !existingTable) throw new Error('Table not found')
      tableId = existingTable.id
      tableName = existingTable.name

      // Get existing columns
      const { data: existingCols } = await supabase
        .from('dynamic_table_columns')
        .select('id, key')
        .eq('table_id', tableId)
      for (const c of existingCols ?? []) {
        colKeyToId[c.key] = c.id
      }

      // Get existing rows for deduplication (source_id + cell-based fallback)
      const { data: existingRows } = await supabase
        .from('dynamic_table_rows')
        .select('id, source_id')
        .eq('table_id', tableId)
      const existingSourceIds = new Set(
        (existingRows ?? []).filter((r: any) => r.source_id).map((r: any) => r.source_id)
      )

      // For rows without source_id, build composite keys from cell values (first_name + last_name + meeting_date)
      // This handles tables created before source_id tracking was added
      const dedupColKeys = ['first_name', 'last_name', 'meeting_date']
      const rowsWithoutSourceId = (existingRows ?? []).filter((r: any) => !r.source_id)
      const existingCompositeKeys = new Set<string>()
      if (rowsWithoutSourceId.length > 0) {
        const dedupColIds = dedupColKeys.map((k) => colKeyToId[k]).filter(Boolean)
        if (dedupColIds.length > 0) {
          const rowIds = rowsWithoutSourceId.map((r: any) => r.id)
          const { data: existingCells } = await supabase
            .from('dynamic_table_cells')
            .select('row_id, column_id, value')
            .in('row_id', rowIds)
            .in('column_id', dedupColIds)
          // Build column_id -> key reverse lookup
          const colIdToKey: Record<string, string> = {}
          for (const [k, id] of Object.entries(colKeyToId)) { colIdToKey[id] = k }
          // Build per-row cell maps
          const rowCellMap: Record<string, Record<string, string>> = {}
          for (const cell of existingCells ?? []) {
            if (!rowCellMap[cell.row_id]) rowCellMap[cell.row_id] = {}
            const key = colIdToKey[cell.column_id]
            if (key) rowCellMap[cell.row_id][key] = (cell.value ?? '').toString().trim().toLowerCase()
          }
          for (const cells of Object.values(rowCellMap)) {
            const compositeKey = dedupColKeys.map((k) => cells[k] ?? '').join('|')
            if (compositeKey.replace(/\|/g, '').length > 0) {
              existingCompositeKeys.add(compositeKey)
            }
          }
          console.log(`[setup-pipeline-template] Built ${existingCompositeKeys.size} composite dedup keys from ${rowsWithoutSourceId.length} rows without source_id`)
        }
      }
      const beforeCount = sourceRows.length
      sourceRows = sourceRows.filter((r: any) => {
        // Check source_id match
        if (r.__source_id && existingSourceIds.has(r.__source_id)) return false
        // Check composite key match
        const compositeKey = dedupColKeys.map((k) => (r[k] ?? '').toString().trim().toLowerCase()).join('|')
        if (compositeKey.replace(/\|/g, '').length > 0 && existingCompositeKeys.has(compositeKey)) return false
        return true
      })
      console.log(`[setup-pipeline-template] Append dedup: ${beforeCount} fetched, ${beforeCount - sourceRows.length} already exist, ${sourceRows.length} new`)

      if (sourceRows.length === 0) {
        return new Response(
          JSON.stringify({ table_id: tableId, table_name: tableName, rows_created: 0, rows_skipped: beforeCount, columns_created: 0, used_synthetic: false }),
          { status: 200, headers: JSON_HEADERS },
        )
      }

      console.log(`[setup-pipeline-template] Appending ${sourceRows.length} rows to "${tableName}"`)
    } else {
      // Create mode: new table + columns
      const baseName = template_config.name
      const { data: existingTables } = await supabase
        .from('dynamic_tables')
        .select('name')
        .eq('organization_id', org_id)
        .like('name', `${baseName}%`)

      tableName = baseName
      if (existingTables && existingTables.length > 0) {
        const taken = new Set(existingTables.map((t: any) => t.name))
        let n = 2
        while (taken.has(tableName)) {
          tableName = `${baseName} ${n}`
          n++
        }
      }

      const { data: table, error: tableError } = await supabase
        .from('dynamic_tables')
        .insert({
          organization_id: org_id,
          created_by: user.id,
          name: tableName,
          description: template_config.description ?? '',
          source_type: 'manual',
          row_count: sourceRows.length,
        })
        .select('id')
        .single()

      if (tableError) throw tableError
      tableId = table.id
      console.log(`[setup-pipeline-template] Created table: ${tableId} "${tableName}"`)

      // ── 3. Create columns ───────────────────────────────────────

      const columnInserts = columns.map((col: any) => ({
        table_id: tableId,
        key: col.key,
        label: col.label,
        column_type: col.column_type,
        position: col.position,
        width: col.width ?? 150,
        is_visible: col.is_visible !== false,
        is_enrichment: false,
        ...(col.formula_expression ? { formula_expression: col.formula_expression } : {}),
        ...(col.action_config ? { action_config: col.action_config } : {}),
        ...(col.integration_config ? { integration_config: col.integration_config } : {}),
      }))

      const { data: createdColumns, error: colError } = await supabase
        .from('dynamic_table_columns')
        .insert(columnInserts)
        .select('id, key')

      if (colError) {
        console.error('[setup-pipeline-template] Column insert error:', JSON.stringify(colError))
        throw colError
      }

      for (const c of createdColumns ?? []) {
        colKeyToId[c.key] = c.id
      }
    }

    // ── 4. Create rows + cells ──────────────────────────────────

    const sourceColumnKeys = columns.filter((c: any) => c.is_source).map((c: any) => c.key)

    // In append mode, start row_index after existing rows
    let startRowIndex = 0
    if (isAppendMode) {
      const { data: maxRow } = await supabase
        .from('dynamic_table_rows')
        .select('row_index')
        .eq('table_id', tableId)
        .order('row_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      startRowIndex = (maxRow?.row_index ?? -1) + 1
    }

    for (let rowIdx = 0; rowIdx < sourceRows.length; rowIdx++) {
      const rowData = sourceRows[rowIdx]
      const sourceId = rowData.__source_id || null
      const { data: row, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert({ table_id: tableId, row_index: startRowIndex + rowIdx, ...(sourceId ? { source_id: sourceId } : {}) })
        .select('id')
        .single()

      if (rowError) throw rowError

      const cells = sourceColumnKeys
        .filter((key: string) => colKeyToId[key] && rowData[key])
        .map((key: string) => ({
          row_id: row.id,
          column_id: colKeyToId[key],
          value: rowData[key],
          source: 'import',
          status: 'complete',
          confidence: 1.0,
        }))

      if (cells.length > 0) {
        const { error: cellError } = await supabase
          .from('dynamic_table_cells')
          .insert(cells)
        if (cellError) throw cellError
      }
    }

    // Update row_count on the table
    if (isAppendMode) {
      const { count } = await supabase
        .from('dynamic_table_rows')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', tableId)
      await supabase.from('dynamic_tables').update({ row_count: count ?? 0 }).eq('id', tableId)
    }

    // ── 5. Create default view with formatting rules (if template has them) ──
    if (template_config.formatting_rules && template_config.formatting_rules.length > 0) {
      const { error: viewError } = await supabase
        .from('ops_table_views')
        .insert({
          table_id: tableId,
          created_by: user.id,
          name: 'Default',
          is_default: true,
          is_system: false,
          filter_config: [],
          sort_config: null,
          column_config: null,
          formatting_rules: template_config.formatting_rules,
          group_config: null,
          summary_config: null,
          position: 0,
        })
      if (viewError) {
        console.warn('[setup-pipeline-template] View creation failed (non-fatal):', viewError.message)
      } else {
        console.log(`[setup-pipeline-template] Default view created with ${template_config.formatting_rules.length} formatting rules`)
      }
    }

    // ── 6. Instantly integration (optional) ──────────────────────
    const instantlyConfig = body.instantly_config
    let instantlyCampaignId: string | null = null

    if (instantlyConfig?.enabled) {
      try {
        const { data: creds } = await supabase
          .from('instantly_org_credentials')
          .select('api_key')
          .eq('org_id', org_id)
          .maybeSingle()

        if (creds?.api_key) {
          const instantly = new InstantlyClient({ apiKey: creds.api_key })
          instantlyCampaignId = instantlyConfig.campaign_id ?? null

          if (instantlyConfig.create_new) {
            const sequences = [{
              steps: (instantlyConfig.steps ?? []).map((s: any) => ({
                type: 'email',
                delay: s.delay ?? 0,
                wait: s.delay ?? 0,
                variants: [{
                  subject: `{{step_${s.step_number}_subject}}`,
                  body: `{{step_${s.step_number}_body}}`,
                }],
              })),
            }]

            const campaign = await instantly.request<{ id?: string }>({
              method: 'POST',
              path: '/api/v2/campaigns',
              body: {
                name: instantlyConfig.campaign_name || tableName,
                campaign_schedule: {
                  schedules: [{
                    name: 'Default',
                    timing: { from: '09:00', to: '17:00' },
                    days: { 1: true, 2: true, 3: true, 4: true, 5: true },
                    timezone: 'America/Chicago',
                  }],
                },
                sequences,
              },
            })
            instantlyCampaignId = campaign?.id ?? null
            console.log(`[setup-pipeline-template] Instantly campaign created: ${instantlyCampaignId}`)
          }

          if (instantlyCampaignId) {
            await supabase.from('instantly_campaign_links').insert({
              table_id: tableId,
              campaign_id: instantlyCampaignId,
              campaign_name: instantlyConfig.campaign_name || tableName,
              field_mapping: instantlyConfig.field_mapping ?? {},
              auto_sync_engagement: true,
            })
            console.log(`[setup-pipeline-template] Instantly campaign linked to table ${tableId}`)
          }
        } else {
          console.warn('[setup-pipeline-template] Instantly enabled but no API key found for org')
        }
      } catch (instantlyErr: any) {
        // Non-fatal — table is still created even if Instantly setup fails
        console.warn('[setup-pipeline-template] Instantly setup failed (non-fatal):', instantlyErr?.message ?? instantlyErr)
      }
    }

    // ── 7. HubSpot Sequences (optional) ─────────────────────────
    const hubspotConfig = body.hubspot_sequence_config
    let hubspotEnrolledCount = 0

    if (hubspotConfig?.enabled && hubspotConfig?.sequence_id) {
      try {
        const { data: hsCreds } = await supabase
          .from('hubspot_org_credentials')
          .select('access_token')
          .eq('org_id', org_id)
          .maybeSingle()

        if (hsCreds?.access_token) {
          const emailColKey = sourceColumnKeys.find((k: string) => k === 'email' || k === 'contact_email')
          if (emailColKey) {
            for (const rowData of sourceRows) {
              const email = rowData[emailColKey]
              if (!email) continue

              try {
                // Look up HubSpot contact by email
                const searchResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${hsCreds.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
                    limit: 1,
                  }),
                })
                const searchData = await searchResp.json()
                const contactId = searchData?.results?.[0]?.id
                if (!contactId) continue

                // Enroll in sequence
                const enrollResp = await fetch('https://api.hubapi.com/automation/v4/sequences/enrollments', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${hsCreds.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    sequenceId: hubspotConfig.sequence_id,
                    contactId,
                    senderEmail: hubspotConfig.sender_email,
                  }),
                })
                if (enrollResp.ok) hubspotEnrolledCount++
              } catch (rowErr: any) {
                console.warn(`[setup-pipeline-template] HubSpot enroll failed for ${email}:`, rowErr?.message)
              }
            }
            console.log(`[setup-pipeline-template] HubSpot: enrolled ${hubspotEnrolledCount} contacts in sequence`)
          }
        } else {
          console.warn('[setup-pipeline-template] HubSpot enabled but no credentials found for org')
        }
      } catch (hsErr: any) {
        // Non-fatal
        console.warn('[setup-pipeline-template] HubSpot enrollment failed (non-fatal):', hsErr?.message ?? hsErr)
      }
    }

    console.log(`[setup-pipeline-template] Done. Rows: ${sourceRows.length}, Append: ${isAppendMode}`)

    return new Response(
      JSON.stringify({
        table_id: tableId,
        table_name: tableName,
        rows_created: sourceRows.length,
        columns_created: isAppendMode ? 0 : Object.keys(colKeyToId).length,
        used_synthetic: sourceRows === dataSource.synthetic_rows,
        ...(instantlyCampaignId ? { instantly_campaign_id: instantlyCampaignId } : {}),
        ...(hubspotEnrolledCount > 0 ? { hubspot_enrolled_count: hubspotEnrolledCount } : {}),
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const detail = error?.details ?? error?.hint ?? ''
    const code = error?.code ?? ''
    console.error('[setup-pipeline-template] Error:', msg, detail, code, JSON.stringify(error))
    return new Response(
      JSON.stringify({ error: msg, detail, code }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
