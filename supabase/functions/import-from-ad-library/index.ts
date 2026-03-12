// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

/**
 * import-from-ad-library — Import selected LinkedIn Ad Library ads into a new (or existing)
 * ops table, archiving media assets to Supabase Storage in the process.
 *
 * POST body: {
 *   org_id: string,
 *   user_id: string,
 *   ad_ids: string[],                          // UUIDs from linkedin_ad_library_ads
 *   table_id?: string | null,                  // Existing ops table; null = create new
 *   table_name?: string,                       // Required when table_id is null
 *   column_mapping: Record<string, string>,    // ad field key → column label
 *   template?: 'creative_testing',             // Pre-configured column set
 * }
 *
 * Returns: { table_id, rows_imported, columns_matched, columns_skipped }
 */

// ---------------------------------------------------------------------------
// Creative Testing Template — pre-configured columns for ad creative analysis
// ---------------------------------------------------------------------------

type ColumnDef = {
  key: string
  label: string
  column_type: string
}

const CREATIVE_TESTING_COLUMNS: ColumnDef[] = [
  { key: 'advertiser',       label: 'Advertiser',        column_type: 'text'    },
  { key: 'headline',         label: 'Headline',          column_type: 'text'    },
  { key: 'body_text',        label: 'Body Text',         column_type: 'text'    },
  { key: 'cta',              label: 'CTA',               column_type: 'text'    },
  { key: 'landing_page_url', label: 'Landing Page URL',  column_type: 'url'     },
  { key: 'creative_image',   label: 'Creative Image',    column_type: 'url'     },
  { key: 'ai_image_remix',   label: 'AI Image Remix',    column_type: 'ai_image'  },
  { key: 'ai_video',         label: 'AI Video',          column_type: 'fal_video' },
  { key: 'svg_animation',    label: 'SVG Animation',     column_type: 'svg_animation' },
]

// Ad fields that map directly to column keys (used for auto-mapping)
const AD_FIELD_TO_COLUMN_KEY: Record<string, string> = {
  advertiser_name:   'advertiser',
  headline:          'headline',
  body_text:         'body_text',
  cta_text:          'cta',
  destination_url:   'landing_page_url',
  image_url:         'creative_image',
}

// Infer column_type for non-template columns created from column_mapping
function inferColumnType(fieldKey: string): string {
  if (fieldKey.endsWith('_url') || fieldKey === 'url') return 'url'
  if (fieldKey === 'image_url' || fieldKey === 'creative_image') return 'url'
  return 'text'
}

// ---------------------------------------------------------------------------
// Media archival helpers
// ---------------------------------------------------------------------------

/**
 * Download a remote URL and upload it to Supabase Storage.
 * Returns the public Storage URL, or null if the download/upload fails.
 * Failures are non-fatal — import continues without the archived asset.
 */
async function archiveMediaUrl(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  adId: string,
  fieldKey: string,
  remoteUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(remoteUrl, { redirect: 'follow' })
    if (!response.ok) {
      console.warn(`[import-from-ad-library] Failed to fetch media ${remoteUrl}: ${response.status}`)
      return null
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const ext = contentType.split('/')[1]?.split(';')[0] ?? 'bin'
    const storagePath = `linkedin-ad-assets/${orgId}/${adId}/${fieldKey}.${ext}`

    const arrayBuffer = await response.arrayBuffer()
    const uint8 = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await supabase
      .storage
      .from('ad-assets')
      .upload(storagePath, uint8, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.warn(`[import-from-ad-library] Storage upload failed for ${storagePath}:`, uploadError.message)
      return null
    }

    const { data: publicData } = supabase
      .storage
      .from('ad-assets')
      .getPublicUrl(storagePath)

    return publicData?.publicUrl ?? null
  } catch (err: any) {
    console.warn(`[import-from-ad-library] archiveMediaUrl error for ${remoteUrl}:`, err.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return errorResponse('Unauthorized', req, 401)

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) return errorResponse('Unauthorized', req, 401)

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // ── Parse body ─────────────────────────────────────────────────────────
    let body: any
    try {
      body = await req.json()
    } catch {
      return errorResponse('Invalid JSON in request body', req, 400)
    }

    const {
      org_id,
      user_id,
      ad_ids,
      table_id: inputTableId,
      table_name,
      column_mapping,
      template,
    } = body

    if (!org_id || !user_id) {
      return errorResponse('org_id and user_id are required', req, 400)
    }

    if (!ad_ids || !Array.isArray(ad_ids) || ad_ids.length === 0) {
      return errorResponse('ad_ids must be a non-empty array', req, 400)
    }

    if (!inputTableId && !table_name) {
      return errorResponse('table_name is required when table_id is not provided', req, 400)
    }

    if (!column_mapping && template !== 'creative_testing') {
      return errorResponse('column_mapping is required when template is not set', req, 400)
    }

    console.log('[import-from-ad-library] Starting import', {
      org_id,
      user_id,
      ad_count: ad_ids.length,
      table_id: inputTableId ?? null,
      table_name: table_name ?? null,
      template: template ?? null,
    })

    // ── Org membership check ──────────────────────────────────────────────
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse('Not a member of this organization', req, 403)
    }

    // ── Resolve or create ops table ────────────────────────────────────────
    let tableId: string
    let finalTableName: string

    if (inputTableId) {
      // Validate the table belongs to this org
      const { data: existingTable, error: tableErr } = await svc
        .from('dynamic_tables')
        .select('id, name')
        .eq('id', inputTableId)
        .eq('organization_id', org_id)
        .maybeSingle()

      if (tableErr) throw tableErr
      if (!existingTable) return errorResponse('Table not found or access denied', req, 404)

      tableId = existingTable.id
      finalTableName = existingTable.name
    } else {
      // Create new table — retry up to 5 times on name collision
      let newTable: { id: string } | null = null
      finalTableName = table_name!

      for (let attempt = 0; attempt < 5; attempt++) {
        const tryName = attempt === 0 ? table_name! : `${table_name} (${attempt})`
        const { data, error: tableError } = await svc
          .from('dynamic_tables')
          .insert({
            organization_id: org_id,
            created_by: user_id,
            name: tryName,
            source_type: 'ad_library',
            source_query: {
              ad_ids,
              template: template ?? null,
              imported_at: new Date().toISOString(),
            },
          })
          .select('id')
          .single()

        if (!tableError) {
          newTable = data
          finalTableName = tryName
          break
        }

        if (!tableError.message?.includes('unique_table_name_per_org')) {
          throw tableError
        }

        console.log(`[import-from-ad-library] Table name "${tryName}" already exists, trying next`)
      }

      if (!newTable) {
        throw new Error(`Table name "${table_name}" already exists. Please choose a different name.`)
      }

      tableId = newTable.id
    }

    // ── Resolve columns ────────────────────────────────────────────────────
    // When creating a new table we always create columns.
    // When importing into an existing table we look up existing columns by key
    // and create any that are missing.

    let columnsMatchedCount = 0
    let columnsSkippedCount = 0

    // Build the intended column definitions from template or column_mapping
    let intendedColumns: ColumnDef[] = []

    if (template === 'creative_testing') {
      intendedColumns = CREATIVE_TESTING_COLUMNS
    } else {
      // column_mapping: { ad_field_key: column_label }
      // We derive column key from the ad field key (snake_case passthrough)
      intendedColumns = Object.entries(column_mapping as Record<string, string>).map(
        ([adFieldKey, label]) => ({
          key: AD_FIELD_TO_COLUMN_KEY[adFieldKey] ?? adFieldKey,
          label,
          column_type: inferColumnType(adFieldKey),
        }),
      )
    }

    // Fetch existing columns for this table
    const { data: existingColumns, error: existingColErr } = await svc
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId)
      .order('position')

    if (existingColErr) throw existingColErr

    const existingColMap = new Map<string, string>() // key → id
    for (const col of existingColumns ?? []) {
      existingColMap.set(col.key, col.id)
    }

    // Determine which columns need to be created
    const colsToCreate = intendedColumns.filter(c => !existingColMap.has(c.key))
    const startPosition = (existingColumns?.length ?? 0)

    let createdColumns: Array<{ id: string; key: string }> = []

    if (colsToCreate.length > 0) {
      const colInserts = colsToCreate.map((col, idx) => ({
        table_id: tableId,
        key: col.key,
        label: col.label,
        column_type: col.column_type,
        position: startPosition + idx,
      }))

      const { data: inserted, error: colErr } = await svc
        .from('dynamic_table_columns')
        .insert(colInserts)
        .select('id, key')

      if (colErr) throw colErr
      createdColumns = inserted ?? []
    }

    // Build final key→id map (existing + newly created)
    const columnKeyToId = new Map<string, string>(existingColMap)
    for (const col of createdColumns) {
      columnKeyToId.set(col.key, col.id)
    }

    columnsMatchedCount = intendedColumns.filter(c => columnKeyToId.has(c.key)).length
    columnsSkippedCount = intendedColumns.length - columnsMatchedCount

    // Build a map of ad_field_key → column_id for cell population
    // For creative testing template: use AD_FIELD_TO_COLUMN_KEY to map source fields
    // For manual mapping: use the same key derivation as column creation
    const adFieldToColumnId = new Map<string, string>()

    if (template === 'creative_testing') {
      for (const [adFieldKey, columnKey] of Object.entries(AD_FIELD_TO_COLUMN_KEY)) {
        const colId = columnKeyToId.get(columnKey)
        if (colId) adFieldToColumnId.set(adFieldKey, colId)
      }
    } else {
      for (const adFieldKey of Object.keys(column_mapping as Record<string, string>)) {
        const colKey = AD_FIELD_TO_COLUMN_KEY[adFieldKey] ?? adFieldKey
        const colId = columnKeyToId.get(colKey)
        if (colId) adFieldToColumnId.set(adFieldKey, colId)
      }
    }

    // ── Fetch ads in batches and insert rows + cells ───────────────────────
    let totalImported = 0

    for (let offset = 0; offset < ad_ids.length; offset += BATCH_SIZE) {
      const batchAdIds = ad_ids.slice(offset, offset + BATCH_SIZE)

      const { data: ads, error: adsErr } = await svc
        .from('linkedin_ad_library_ads')
        .select(
          'id, advertiser_name, headline, body_text, cta_text, destination_url, image_url, video_url, ad_format, status, start_date, end_date, raw_data',
        )
        .in('id', batchAdIds)

      if (adsErr) throw adsErr
      if (!ads || ads.length === 0) continue

      // Insert rows
      const rowInserts = ads.map((ad: any) => ({
        table_id: tableId,
        source_id: ad.id,
        source_data: {
          ad_library: {
            id: ad.id,
            advertiser_name: ad.advertiser_name,
            headline: ad.headline,
            body_text: ad.body_text,
            cta_text: ad.cta_text,
            destination_url: ad.destination_url,
            image_url: ad.image_url,
            video_url: ad.video_url,
            ad_format: ad.ad_format,
            status: ad.status,
            start_date: ad.start_date,
            end_date: ad.end_date,
            raw_data: ad.raw_data ?? null,
          },
        },
      }))

      const { data: insertedRows, error: rowErr } = await svc
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id, source_id')

      if (rowErr) throw rowErr

      // Archive media and build cells
      const cellInserts: any[] = []

      for (const row of insertedRows ?? []) {
        const ad = ads.find((a: any) => a.id === row.source_id)
        if (!ad) continue

        // Archive image URL in background — don't block on failure
        let archivedImageUrl: string | null = null
        if (ad.image_url) {
          archivedImageUrl = await archiveMediaUrl(svc, org_id, ad.id, 'image', ad.image_url)
        }

        // Map ad fields to cells
        for (const [adFieldKey, columnId] of adFieldToColumnId.entries()) {
          let rawValue: string | null = null

          switch (adFieldKey) {
            case 'advertiser_name':   rawValue = ad.advertiser_name ?? null;  break
            case 'headline':          rawValue = ad.headline ?? null;          break
            case 'body_text':         rawValue = ad.body_text ?? null;         break
            case 'cta_text':          rawValue = ad.cta_text ?? null;          break
            case 'destination_url':   rawValue = ad.destination_url ?? null;   break
            case 'image_url':
              // Use archived URL if available, fall back to original
              rawValue = archivedImageUrl ?? ad.image_url ?? null
              break
            default:
              // For non-template columns derived from raw_data or top-level fields
              rawValue = ad[adFieldKey] ?? ad.raw_data?.[adFieldKey] ?? null
          }

          if (rawValue == null || rawValue === '') continue

          cellInserts.push({
            row_id: row.id,
            column_id: columnId,
            value: String(rawValue),
            status: 'complete',
            source: 'ad_library',
            metadata: { ad_library_ad_id: ad.id },
          })
        }
      }

      // Insert cells in sub-batches of 500
      for (let ci = 0; ci < cellInserts.length; ci += 500) {
        const chunk = cellInserts.slice(ci, ci + 500)
        const { error: cellErr } = await svc
          .from('dynamic_table_cells')
          .upsert(chunk, { onConflict: 'row_id,column_id' })

        if (cellErr) {
          console.error('[import-from-ad-library] Cell upsert error:', cellErr)
        }
      }

      totalImported += ads.length
    }

    // ── Update row count ────────────────────────────────────────────────────
    // Note: A trigger on dynamic_table_rows already increments row_count per INSERT,
    // but we do an explicit update here to ensure accuracy after the full batch.
    const { data: currentTable } = await svc
      .from('dynamic_tables')
      .select('row_count')
      .eq('id', tableId)
      .single()

    await svc
      .from('dynamic_tables')
      .update({ row_count: (currentTable?.row_count ?? 0) })
      .eq('id', tableId)

    console.log('[import-from-ad-library] Import complete', {
      table_id: tableId,
      rows_imported: totalImported,
      columns_matched: columnsMatchedCount,
      columns_skipped: columnsSkippedCount,
    })

    return jsonResponse(
      {
        table_id: tableId,
        table_name: finalTableName,
        rows_imported: totalImported,
        columns_matched: columnsMatchedCount,
        columns_skipped: columnsSkippedCount,
      },
      req,
    )
  } catch (error: any) {
    console.error('[import-from-ad-library] Error:', error)
    return errorResponse(error.message ?? 'Internal error', req, 500)
  }
})
