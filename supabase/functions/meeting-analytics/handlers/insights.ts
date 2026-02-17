/**
 * Insight handlers: per-transcript insights, sub-resources
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

export async function handleGetInsights(transcriptId: string, req: Request): Promise<Response> {
  const db = getRailwayDb();
  const transcriptRows = await db.unsafe(`SELECT id FROM transcripts WHERE id = $1`, [transcriptId]);
  if (transcriptRows.length === 0) {
    return errorResponse('Transcript not found', 404, req);
  }

  const [topics, sentimentRows, segmentSentiments, actionItems, keyMoments, summaries, qaPairs] = await Promise.all([
    db.unsafe(`SELECT * FROM topics WHERE transcript_id = $1 ORDER BY relevance_score DESC NULLS LAST`, [transcriptId]),
    db.unsafe(`SELECT * FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [transcriptId]),
    db.unsafe(`SELECT * FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NOT NULL`, [transcriptId]),
    db.unsafe(`SELECT * FROM action_items WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]),
    db.unsafe(`SELECT * FROM key_moments WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]),
    db.unsafe(`SELECT * FROM summaries WHERE transcript_id = $1`, [transcriptId]),
    db.unsafe(`SELECT * FROM qa_pairs WHERE transcript_id = $1 ORDER BY question_time NULLS LAST`, [transcriptId]),
  ]);

  const mapRow = (r: Record<string, unknown>) => {
    const result: Record<string, unknown> = { ...r };
    if (r.created_at instanceof Date) result.created_at = (r.created_at as Date).toISOString();
    if (r.relevance_score != null) result.relevance_score = parseFloat(String(r.relevance_score));
    if (r.confidence != null) result.confidence = parseFloat(String(r.confidence));
    if (r.positive_score != null) result.positive_score = parseFloat(String(r.positive_score));
    if (r.negative_score != null) result.negative_score = parseFloat(String(r.negative_score));
    if (r.neutral_score != null) result.neutral_score = parseFloat(String(r.neutral_score));
    if (r.importance_score != null) result.importance_score = parseFloat(String(r.importance_score));
    if (r.due_date instanceof Date) result.due_date = (r.due_date as Date).toISOString().slice(0, 10);
    return result;
  };

  const insights = {
    transcriptId,
    topics: topics.map(mapRow),
    sentiment: sentimentRows[0] ? mapRow(sentimentRows[0] as Record<string, unknown>) : null,
    segmentSentiments: segmentSentiments.map(mapRow),
    actionItems: actionItems.map(mapRow),
    keyMoments: keyMoments.map(mapRow),
    summaries: summaries.map(mapRow),
    qaPairs: qaPairs.map(mapRow),
  };

  return successResponse(insights, req);
}

export async function handleGetInsightSubResource(
  transcriptId: string,
  resource: string,
  req: Request
): Promise<Response> {
  const db = getRailwayDb();
  const transcriptRows = await db.unsafe(`SELECT id FROM transcripts WHERE id = $1`, [transcriptId]);
  if (transcriptRows.length === 0) {
    return errorResponse('Transcript not found', 404, req);
  }

  let data: unknown;
  const url = new URL(req.url);
  switch (resource) {
    case 'topics':
      data = await db.unsafe(`SELECT * FROM topics WHERE transcript_id = $1 ORDER BY relevance_score DESC NULLS LAST`, [transcriptId]);
      break;
    case 'sentiment': {
      const overall = await db.unsafe(`SELECT * FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [transcriptId]);
      const includeSegments = url.searchParams.get('includeSegments') === 'true';
      if (includeSegments) {
        const segments = await db.unsafe(`SELECT * FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NOT NULL`, [transcriptId]);
        data = { overall: overall[0] ?? null, segments };
      } else {
        data = { overall: overall[0] ?? null };
      }
      break;
    }
    case 'action-items': {
      let items = await db.unsafe(`SELECT * FROM action_items WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]);
      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((i: Record<string, unknown>) => i.status === status);
      }
      data = items;
      break;
    }
    case 'key-moments': {
      let moments = await db.unsafe(`SELECT * FROM key_moments WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]);
      const type = url.searchParams.get('type');
      if (type) {
        moments = moments.filter((m: Record<string, unknown>) => m.moment_type === type);
      }
      data = moments;
      break;
    }
    case 'summary': {
      const type = url.searchParams.get('type');
      if (type) {
        const rows = await db.unsafe(`SELECT * FROM summaries WHERE transcript_id = $1 AND summary_type = $2`, [transcriptId, type]);
        data = rows[0] ?? null;
      } else {
        data = await db.unsafe(`SELECT * FROM summaries WHERE transcript_id = $1`, [transcriptId]);
      }
      break;
    }
    case 'qa-pairs': {
      let pairs = await db.unsafe(`SELECT * FROM qa_pairs WHERE transcript_id = $1 ORDER BY question_time NULLS LAST`, [transcriptId]);
      const answered = url.searchParams.get('answered');
      const unanswered = url.searchParams.get('unanswered');
      if (answered === 'true') pairs = pairs.filter((p: Record<string, unknown>) => p.is_answered);
      if (unanswered === 'true') pairs = pairs.filter((p: Record<string, unknown>) => !p.is_answered);
      data = pairs;
      break;
    }
    default:
      return errorResponse('Not found', 404, req);
  }

  return successResponse(data, req);
}
