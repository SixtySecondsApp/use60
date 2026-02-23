/**
 * Search handlers: semantic search, similar segments, context search, multi-transcript, RAG
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required for search');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8191).trim(),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding failed: ${res.status} ${err}`);
  }
  const json = await res.json();
  return json.data?.[0]?.embedding ?? [];
}

export async function handleSearch(req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const query = (body?.query as string)?.trim();
  if (!query) return errorResponse('query is required and must be a non-empty string', 400, req);

  const threshold = (body.threshold as number) ?? 0.7;
  const limit = Math.min((body.limit as number) ?? 10, 50);
  const transcriptId = body.transcriptId as string | undefined;
  const contextSegments = (body.contextSegments as number) ?? 0;

  const startTime = Date.now();
  const embedding = await generateEmbedding(query);
  const embeddingStr = '[' + embedding.join(',') + ']';

  const db = getRailwayDb();
  let searchSql = `
    SELECT ts.id, ts.transcript_id as "transcriptId", ts.segment_index as "segmentIndex",
           ts.text, ts.start_time as "startTime", ts.end_time as "endTime",
           ts.word_count as "wordCount", ts.avg_confidence as "avgConfidence",
           t.title as "transcriptTitle",
           1 - (ts.embedding <=> $1::vector) AS similarity
    FROM transcript_segments ts
    JOIN transcripts t ON t.id = ts.transcript_id AND t.org_id = $2
    WHERE ts.embedding IS NOT NULL AND 1 - (ts.embedding <=> $1::vector) >= $3
  `;
  const params: unknown[] = [embeddingStr, orgId, threshold];
  if (transcriptId) {
    searchSql += ' AND ts.transcript_id = $4';
    params.push(transcriptId);
  }
  searchSql += ` ORDER BY ts.embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit);

  const rows = await db.unsafe(searchSql, params);
  const results = rows.map((r: Record<string, unknown>) => ({
    segment: {
      id: r.id,
      transcriptId: r.transcriptId,
      segmentIndex: r.segmentIndex,
      text: r.text,
      startTime: r.startTime,
      endTime: r.endTime,
      wordCount: r.wordCount,
      avgConfidence: r.avgConfidence != null ? parseFloat(String(r.avgConfidence)) : null,
    },
    transcriptTitle: r.transcriptTitle,
    similarity: r.similarity != null ? parseFloat(String(r.similarity)) : 0,
  }));

  // Add context snippets if requested
  let contextualized = null;
  if (contextSegments > 0 && results.length > 0) {
    contextualized = await Promise.all(
      results.map(async (result: Record<string, unknown>) => {
        const seg = result.segment as Record<string, unknown>;
        const tid = seg.transcriptId as string;
        const idx = seg.segmentIndex as number;
        const allSegments = await db.unsafe(
          `SELECT segment_index, text FROM transcript_segments
           WHERE transcript_id = $1
             AND segment_index BETWEEN $2 AND $3
           ORDER BY segment_index`,
          [tid, idx - contextSegments, idx + contextSegments]
        );
        const before = allSegments
          .filter((s: Record<string, unknown>) => (s.segment_index as number) < idx)
          .map((s: Record<string, unknown>) => s.text)
          .join(' ');
        const after = allSegments
          .filter((s: Record<string, unknown>) => (s.segment_index as number) > idx)
          .map((s: Record<string, unknown>) => s.text)
          .join(' ');
        return { ...result, context: { before, after } };
      })
    );
  }

  return successResponse(
    {
      query,
      results: contextualized || results,
      totalResults: results.length,
      searchTimeMs: Date.now() - startTime,
    },
    req
  );
}

export async function handleSearchSimilar(req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const segmentId = body?.segmentId as string;
  if (!segmentId) return errorResponse('segmentId is required', 400, req);

  const threshold = (body.threshold as number) ?? 0.7;
  const limit = Math.min((body.limit as number) ?? 10, 50);
  const excludeSameTranscript = (body.excludeSameTranscript as boolean) ?? false;

  const db = getRailwayDb();
  const segRows = await db.unsafe(
    `SELECT ts.id, ts.transcript_id, ts.segment_index, ts.text, ts.start_time, ts.end_time, ts.word_count, ts.avg_confidence
     FROM transcript_segments ts
     JOIN transcripts t ON t.id = ts.transcript_id AND t.org_id = $2
     WHERE ts.id = $1`,
    [segmentId, orgId]
  );
  const seg = segRows[0] as Record<string, unknown> | undefined;
  if (!seg) return errorResponse(`Segment not found: ${segmentId}`, 404, req);

  const text = seg.text as string;
  const tid = seg.transcript_id as string;
  const embedding = await generateEmbedding(text);
  const embeddingStr = '[' + embedding.join(',') + ']';

  let searchSql = `
    SELECT ts.id, ts.transcript_id as "transcriptId", ts.segment_index as "segmentIndex",
           ts.text, ts.start_time as "startTime", ts.end_time as "endTime",
           ts.word_count as "wordCount", ts.avg_confidence as "avgConfidence",
           t.title as "transcriptTitle",
           1 - (ts.embedding <=> $1::vector) AS similarity
    FROM transcript_segments ts
    JOIN transcripts t ON t.id = ts.transcript_id AND t.org_id = $4
    WHERE ts.embedding IS NOT NULL AND ts.id != $2 AND 1 - (ts.embedding <=> $1::vector) >= $3
  `;
  const params: unknown[] = [embeddingStr, segmentId, threshold, orgId];
  if (excludeSameTranscript) {
    searchSql += ' AND ts.transcript_id != $5';
    params.push(tid);
  }
  searchSql += ` ORDER BY ts.embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const rows = await db.unsafe(searchSql, params);
  const results = rows
    .filter((r: Record<string, unknown>) => r.id !== segmentId)
    .slice(0, limit)
    .map((r: Record<string, unknown>) => ({
      segment: {
        id: r.id,
        transcriptId: r.transcriptId,
        segmentIndex: r.segmentIndex,
        text: r.text,
        startTime: r.startTime,
        endTime: r.endTime,
        wordCount: r.wordCount,
        avgConfidence: r.avgConfidence != null ? parseFloat(String(r.avgConfidence)) : null,
      },
      transcriptTitle: r.transcriptTitle,
      similarity: r.similarity != null ? parseFloat(String(r.similarity)) : 0,
    }));

  return successResponse({ segmentId, similarSegments: results, count: results.length }, req);
}

export async function handleSearchMulti(req: Request, orgId: string): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const query = (body?.query as string)?.trim();
  if (!query) return errorResponse('query is required', 400, req);

  const transcriptIds = body.transcriptIds as string[] | undefined;
  if (!transcriptIds || !Array.isArray(transcriptIds) || transcriptIds.length === 0) {
    return errorResponse('transcriptIds is required and must be a non-empty array', 400, req);
  }

  const threshold = (body.threshold as number) ?? 0.7;
  const limitPerTranscript = Math.min((body.limitPerTranscript as number) ?? 5, 20);

  const startTime = Date.now();
  const embedding = await generateEmbedding(query);
  const embeddingStr = '[' + embedding.join(',') + ']';

  const db = getRailwayDb();
  const resultsByTranscript: Record<string, unknown[]> = {};

  await Promise.all(
    transcriptIds.map(async (tid) => {
      const rows = await db.unsafe(
        `SELECT ts.id, ts.transcript_id as "transcriptId", ts.segment_index as "segmentIndex",
                ts.text, ts.start_time as "startTime", ts.end_time as "endTime",
                ts.word_count as "wordCount", ts.avg_confidence as "avgConfidence",
                t.title as "transcriptTitle",
                1 - (ts.embedding <=> $1::vector) AS similarity
         FROM transcript_segments ts
         JOIN transcripts t ON t.id = ts.transcript_id AND t.org_id = $3
         WHERE ts.embedding IS NOT NULL
           AND ts.transcript_id = $2
           AND 1 - (ts.embedding <=> $1::vector) >= $4
         ORDER BY ts.embedding <=> $1::vector
         LIMIT $5`,
        [embeddingStr, tid, orgId, threshold, limitPerTranscript]
      );
      resultsByTranscript[tid] = rows.map((r: Record<string, unknown>) => ({
        segment: {
          id: r.id,
          transcriptId: r.transcriptId,
          segmentIndex: r.segmentIndex,
          text: r.text,
          startTime: r.startTime,
          endTime: r.endTime,
          wordCount: r.wordCount,
          avgConfidence: r.avgConfidence != null ? parseFloat(String(r.avgConfidence)) : null,
        },
        transcriptTitle: r.transcriptTitle,
        similarity: r.similarity != null ? parseFloat(String(r.similarity)) : 0,
      }));
    })
  );

  const totalResults = Object.values(resultsByTranscript).reduce((s, r) => s + r.length, 0);

  return successResponse(
    { query, resultsByTranscript, totalResults, searchTimeMs: Date.now() - startTime },
    req
  );
}
