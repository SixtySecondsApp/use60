/**
 * Transcript handlers: list, detail
 */

import { getRailwayDb } from '../db.ts';
import { jsonResponse, successResponse, errorResponse } from '../helpers.ts';

export async function handleGetTranscripts(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const orderBy = url.searchParams.get('orderBy') || 'created_at';
  const order = (url.searchParams.get('order') || 'DESC') as 'ASC' | 'DESC';
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  const db = getRailwayDb();
  const validCols = ['created_at', 'title', 'audio_duration', 'word_count'];
  const safeOrderBy = validCols.includes(orderBy) ? orderBy : 'created_at';
  const safeOrder = order === 'ASC' ? 'ASC' : 'DESC';

  let whereClause = '';
  if (demoOnly) {
    whereClause = 'WHERE t.is_demo = TRUE';
  } else if (!includeDemo) {
    whereClause = 'WHERE (t.is_demo = FALSE OR t.is_demo IS NULL)';
  }

  const transcripts = await db.unsafe(
    `SELECT t.id, t.external_id as "externalId", t.source_url as "sourceUrl", t.title,
            t.language_code as "languageCode", t.audio_duration as "audioDuration",
            t.overall_confidence as "overallConfidence", t.full_text as "fullText",
            t.word_count as "wordCount", t.created_at as "createdAt",
            t.processed_at as "processedAt", COALESCE(t.is_demo, false) as "isDemo",
            t.demo_session_id as "demoSessionId"
     FROM transcripts t ${whereClause}
     ORDER BY t.${safeOrderBy} ${safeOrder}
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await db.unsafe(
    `SELECT COUNT(*)::text as count FROM transcripts t ${whereClause}`,
    []
  );
  const total = parseInt((countResult[0] as Record<string, unknown>)?.count as string || '0', 10);

  const rows = Array.isArray(transcripts) ? transcripts : [];
  const data = rows.map((r: Record<string, unknown>) => ({
    ...r,
    overallConfidence: r.overallConfidence != null ? parseFloat(String(r.overallConfidence)) : null,
    createdAt: r.createdAt instanceof Date ? (r.createdAt as Date).toISOString() : r.createdAt,
    processedAt: r.processedAt instanceof Date ? (r.processedAt as Date).toISOString() : r.processedAt,
  }));

  return jsonResponse(
    { success: true, data, pagination: { total, limit, offset, hasMore: offset + data.length < total } },
    200,
    req
  );
}

export async function handleGetTranscript(id: string, req: Request): Promise<Response> {
  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT t.*,
      (SELECT COUNT(*) FROM transcript_segments WHERE transcript_id = t.id)::int as segment_count,
      (SELECT COUNT(*) FROM topics WHERE transcript_id = t.id)::int as topic_count,
      (SELECT COUNT(*) FROM action_items WHERE transcript_id = t.id)::int as action_item_count,
      (SELECT COUNT(*) FROM key_moments WHERE transcript_id = t.id)::int as key_moment_count,
      (SELECT COUNT(*) FROM qa_pairs WHERE transcript_id = t.id)::int as qa_pair_count,
      EXISTS(SELECT 1 FROM summaries WHERE transcript_id = t.id) as has_summary,
      EXISTS(SELECT 1 FROM sentiment_analysis WHERE transcript_id = t.id) as has_sentiment
     FROM transcripts t WHERE t.id = $1`,
    [id]
  );

  const row = Array.isArray(rows) ? rows[0] as Record<string, unknown> : null;
  if (!row) return errorResponse('Transcript not found', 404, req);

  const transcript = {
    id: row.id,
    externalId: row.external_id,
    sourceUrl: row.source_url,
    title: row.title,
    languageCode: row.language_code,
    audioDuration: row.audio_duration,
    overallConfidence: row.overall_confidence != null ? parseFloat(String(row.overall_confidence)) : null,
    fullText: row.full_text,
    wordCount: row.word_count,
    createdAt: row.created_at instanceof Date ? (row.created_at as Date).toISOString() : row.created_at,
    processedAt: row.processed_at instanceof Date ? (row.processed_at as Date)?.toISOString() : row.processed_at,
    isDemo: row.is_demo ?? false,
    demoSessionId: row.demo_session_id,
    stats: {
      segmentCount: row.segment_count ?? 0,
      topicCount: row.topic_count ?? 0,
      actionItemCount: row.action_item_count ?? 0,
      keyMomentCount: row.key_moment_count ?? 0,
      qaPairCount: row.qa_pair_count ?? 0,
      hasSummary: row.has_summary ?? false,
      hasSentiment: row.has_sentiment ?? false,
    },
  };

  return successResponse(transcript, req);
}
