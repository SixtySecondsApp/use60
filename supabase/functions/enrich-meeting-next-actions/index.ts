import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

/**
 * Enrich meetings ops table with AI-extracted next actions using Claude Haiku.
 *
 * Supports 3 actions:
 *   - "setup"    → Create missing summary/next_actions columns
 *   - "backfill" → Populate summary cells from meetings table
 *   - "enrich"   → Extract next_actions from summaries using Haiku (default)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function extractNextActions(
  apiKey: string,
  title: string,
  summary: string
): Promise<string | null> {
  const truncated = summary.length > 1500 ? summary.slice(0, 1500) + '...' : summary;
  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 100,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `Extract 1-3 concrete next action items from this meeting summary. Return ONLY a comma-separated list of short action items (max 8 words each). No numbering, no bullets.\n\nMeeting: ${title}\nSummary: ${truncated}`,
      }],
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text || text.toLowerCase().includes('no action') || text.toLowerCase().includes('none identified')) {
    return null;
  }
  return text;
}

function extractSummaryText(summary: any): string | null {
  if (!summary || typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.summary || parsed.text || parsed.content || trimmed;
    } catch { return trimmed; }
  }
  return trimmed;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const { table_id, batch_size, action = 'enrich' } = body;

    if (!table_id) return json({ error: 'table_id required' }, 400);

    // Use SB_SERVICE_KEY (custom secret) — the auto-provisioned SUPABASE_SERVICE_ROLE_KEY
    // is a 41-char raw key that doesn't work as a JWT apikey for PostgREST
    const serviceKey = Deno.env.get('SB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey
    );

    // ─── ACTION: SETUP — create missing columns ───
    if (action === 'setup') {
      const { data: existingCols } = await supabase
        .from('dynamic_table_columns')
        .select('id, key')
        .eq('table_id', table_id);

      const existing = new Set((existingCols || []).map((c: any) => c.key));
      const { data: maxRow } = await supabase
        .from('dynamic_table_columns')
        .select('sort_order')
        .eq('table_id', table_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      let nextOrder = (maxRow?.[0]?.sort_order ?? 0) + 1;

      const created: string[] = [];
      for (const col of [
        { key: 'summary', label: 'Summary', type: 'text' },
        { key: 'next_actions', label: 'Next Actions', type: 'text' },
      ]) {
        if (!existing.has(col.key)) {
          const { error } = await supabase
            .from('dynamic_table_columns')
            .insert({ table_id, key: col.key, label: col.label, type: col.type, sort_order: nextOrder++ });
          if (!error) created.push(col.key);
          else console.error(`Failed to create ${col.key}:`, error.message);
        }
      }
      return json({ success: true, created, already_existed: [...existing].filter(k => ['summary', 'next_actions'].includes(k)) });
    }

    // Get column IDs for all subsequent actions
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)
      .in('key', ['next_actions', 'summary', 'title']);

    const colMap: Record<string, string> = {};
    columns?.forEach((c: any) => { colMap[c.key] = c.id; });

    // ─── ACTION: BACKFILL — populate summary cells from meetings table ───
    if (action === 'backfill') {
      if (!colMap.summary) return json({ error: 'No summary column. Run action=setup first.' }, 400);

      // source_type varies ('app', 'meeting') — just get all rows for this table
      const { data: rows } = await supabase
        .from('dynamic_table_rows')
        .select('id, source_id')
        .eq('table_id', table_id)
        .not('source_id', 'is', null)
        .limit(5000);

      if (!rows?.length) return json({ success: true, backfilled: 0, message: 'No meeting rows' });

      // Check which rows already have summaries
      const { data: existingSummaries } = await supabase
        .from('dynamic_table_cells')
        .select('row_id')
        .eq('column_id', colMap.summary)
        .not('value', 'is', null)
        .not('value', 'eq', '')
        .limit(5000);
      const hasSummary = new Set((existingSummaries || []).map((r: any) => r.row_id));
      const needsSummary = rows.filter((r: any) => !hasSummary.has(r.id));

      if (!needsSummary.length) return json({ success: true, backfilled: 0, total_rows: rows.length, already_have: hasSummary.size });

      // Fetch meeting summaries in chunks of 200
      let backfilled = 0;
      for (let i = 0; i < needsSummary.length; i += 200) {
        const chunk = needsSummary.slice(i, i + 200);
        const sourceIds = chunk.map((r: any) => r.source_id).filter(Boolean);
        if (!sourceIds.length) continue;

        const { data: meetings } = await supabase
          .from('meetings')
          .select('id, summary')
          .in('id', sourceIds);

        const summaryMap = new Map<string, string>();
        meetings?.forEach((m: any) => {
          const text = extractSummaryText(m.summary);
          if (text) summaryMap.set(m.id, text);
        });

        const cells = chunk
          .filter((r: any) => summaryMap.has(r.source_id))
          .map((r: any) => ({ row_id: r.id, column_id: colMap.summary, value: summaryMap.get(r.source_id)! }));

        if (cells.length) {
          const { error } = await supabase.from('dynamic_table_cells').upsert(cells, { onConflict: 'row_id,column_id' });
          if (!error) backfilled += cells.length;
        }
      }

      return json({ success: true, backfilled, total_rows: rows.length, already_have: hasSummary.size, remaining: needsSummary.length - backfilled });
    }

    // ─── ACTION: ENRICH — extract next_actions from summaries using Haiku ───
    if (!colMap.next_actions || !colMap.summary) {
      return json({ error: 'Missing columns. Run action=setup then action=backfill first.' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    // Get summary cells
    const { data: summaryRows } = await supabase
      .from('dynamic_table_cells')
      .select('row_id, value')
      .eq('column_id', colMap.summary)
      .not('value', 'is', null)
      .not('value', 'eq', '')
      .limit(5000);

    if (!summaryRows?.length) return json({ success: true, stats: { processed: 0, enriched: 0, message: 'No summaries found' } });

    // Get ALL existing next_actions (avoid .in() with 1000+ UUIDs)
    const { data: existingActions } = await supabase
      .from('dynamic_table_cells')
      .select('row_id')
      .eq('column_id', colMap.next_actions)
      .not('value', 'is', null)
      .not('value', 'eq', '')
      .limit(5000);

    const hasActions = new Set((existingActions || []).map((r: any) => r.row_id));
    const needsEnrichment = summaryRows.filter((r: any) => !hasActions.has(r.row_id));

    // Get ALL titles
    const titleMap = new Map<string, string>();
    if (colMap.title && needsEnrichment.length > 0) {
      const { data: titleCells } = await supabase
        .from('dynamic_table_cells')
        .select('row_id, value')
        .eq('column_id', colMap.title)
        .not('value', 'is', null)
        .limit(5000);
      titleCells?.forEach((c: any) => { titleMap.set(c.row_id, c.value); });
    }

    const limit = Math.min(batch_size || 50, needsEnrichment.length);
    const toProcess = needsEnrichment.slice(0, limit);
    let enriched = 0;
    const startTime = Date.now();

    for (let i = 0; i < toProcess.length; i += 5) {
      if (Date.now() - startTime > 250_000) break;

      const batch = toProcess.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (row: any) => {
          const title = titleMap.get(row.row_id) || 'Meeting';
          const actions = await extractNextActions(apiKey, title, row.value);
          return { rowId: row.row_id, actions };
        })
      );

      const cellsToInsert = results
        .filter(r => r.actions)
        .map(r => ({ row_id: r.rowId, column_id: colMap.next_actions, value: r.actions! }));

      if (cellsToInsert.length > 0) {
        const { error } = await supabase
          .from('dynamic_table_cells')
          .upsert(cellsToInsert, { onConflict: 'row_id,column_id' });
        if (!error) enriched += cellsToInsert.length;
      }
    }

    return json({
      success: true,
      stats: {
        total_with_summaries: summaryRows.length,
        already_have_actions: hasActions.size,
        needs_enrichment: needsEnrichment.length,
        processed: Math.min(limit, toProcess.length),
        enriched,
        remaining: needsEnrichment.length - limit,
        duration_ms: Date.now() - startTime,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
