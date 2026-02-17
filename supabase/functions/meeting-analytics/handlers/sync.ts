/**
 * Sync handler: receives Supabase meeting data via pg_net trigger,
 * parses transcript, and upserts to Railway PostgreSQL with embeddings.
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedLine {
  speaker: string;
  text: string;
  startMs: number;
}

function parseTranscriptText(transcriptText: string): {
  fullText: string;
  lines: ParsedLine[];
  wordCount: number;
} {
  const rawLines = transcriptText.split('\n').filter(line => line.trim());
  const parsed: ParsedLine[] = [];
  const timestampRegex = /^\[(\d{2}):(\d{2}):(\d{2})\]\s*([^:]+):\s*(.+)$/;

  for (const line of rawLines) {
    const match = line.match(timestampRegex);
    if (match) {
      const [, hours, minutes, seconds, speaker, text] = match;
      const startMs =
        (parseInt(hours, 10) * 3600 +
          parseInt(minutes, 10) * 60 +
          parseInt(seconds, 10)) * 1000;
      parsed.push({ speaker: speaker.trim(), text: text.trim(), startMs });
    }
  }

  const fullText = parsed.map(l => `${l.speaker}: ${l.text}`).join('\n');
  const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

  return { fullText, lines: parsed, wordCount };
}

/**
 * Chunk transcript into ~400-word segments with overlap.
 */
function chunkTranscript(
  lines: ParsedLine[],
  targetWords = 400
): Array<{ text: string; startMs: number; endMs: number; wordCount: number }> {
  const chunks: Array<{ text: string; startMs: number; endMs: number; wordCount: number }> = [];
  let currentLines: ParsedLine[] = [];
  let currentWordCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWords = line.text.split(/\s+/).filter(w => w.length > 0).length;
    currentLines.push(line);
    currentWordCount += lineWords;

    if (currentWordCount >= targetWords || i === lines.length - 1) {
      const text = currentLines.map(l => `${l.speaker}: ${l.text}`).join('\n');
      const startMs = currentLines[0].startMs;
      const endMs = lines[i + 1]?.startMs ?? currentLines[currentLines.length - 1].startMs + 5000;

      chunks.push({ text, startMs, endMs, wordCount: currentWordCount });

      // Keep last 2 lines as overlap for context continuity
      const overlapLines = currentLines.slice(-2);
      const overlapWords = overlapLines.reduce(
        (sum, l) => sum + l.text.split(/\s+/).filter(w => w.length > 0).length,
        0
      );
      currentLines = overlapLines;
      currentWordCount = overlapWords;
    }
  }

  return chunks;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required for embeddings');
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

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required for embeddings');

  // OpenAI supports batch embedding — send up to 20 at a time
  const batchSize = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8191).trim());
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: batch }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI batch embedding failed: ${res.status} ${err}`);
    }
    const json = await res.json();
    const embeddings = (json.data || [])
      .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
      .map((d: { embedding: number[] }) => d.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingRecord {
  id: string;
  title?: string;
  transcript_text?: string;
  meeting_start?: string;
  duration_minutes?: number;
}

interface SyncPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: MeetingRecord;
  schema?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleSyncMeeting(req: Request): Promise<Response> {
  let payload: SyncPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const { type, record } = payload;
  if (!record?.id) return errorResponse('record.id is required', 400, req);

  const meetingId = record.id;
  const transcriptText = record.transcript_text;

  if (!transcriptText) {
    return successResponse({ message: 'No transcript_text, skipping', meetingId }, req);
  }

  const db = getRailwayDb();

  try {
    // Check if already synced
    const existing = await db.unsafe<{ id: string }>(
      'SELECT id FROM transcripts WHERE external_id = $1',
      [meetingId]
    );

    if (existing.length > 0) {
      // Already synced — skip to avoid duplicate processing
      return successResponse({
        message: 'Already synced',
        meetingId,
        transcriptId: existing[0].id,
      }, req);
    }

    // Parse transcript
    const { fullText, lines, wordCount } = parseTranscriptText(transcriptText);
    if (!fullText || fullText.trim().length === 0) {
      return successResponse({ message: 'Empty transcript after parsing', meetingId }, req);
    }

    // Insert transcript
    const title = record.title || `Meeting ${meetingId}`;
    const audioDuration = record.duration_minutes
      ? Math.round(record.duration_minutes * 60)
      : null;

    const insertResult = await db.unsafe<{ id: string }>(
      `INSERT INTO transcripts (external_id, source_url, title, full_text, word_count, audio_duration, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       RETURNING id`,
      [
        meetingId,
        `supabase://meetings/${meetingId}`,
        title,
        fullText,
        wordCount,
        audioDuration,
        record.meeting_start || null,
      ]
    );

    const transcriptId = insertResult[0]?.id;
    if (!transcriptId) throw new Error('Failed to insert transcript');

    // Chunk and create segments with embeddings
    const chunks = chunkTranscript(lines);
    let embeddingsGenerated = 0;

    if (chunks.length > 0) {
      // Generate embeddings in batch
      const chunkTexts = chunks.map(c => c.text);
      const embeddings = await generateEmbeddingsBatch(chunkTexts);

      // Insert segments with embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const embeddingStr = embedding ? '[' + embedding.join(',') + ']' : null;

        await db.unsafe(
          `INSERT INTO transcript_segments
           (transcript_id, segment_index, text, start_time, end_time, word_count, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
          [
            transcriptId,
            i,
            chunk.text,
            chunk.startMs,
            chunk.endMs,
            chunk.wordCount,
            embeddingStr,
          ]
        );

        if (embedding) embeddingsGenerated++;
      }
    }

    // Mark as processed
    await db.unsafe(
      'UPDATE transcripts SET processed_at = NOW() WHERE id = $1',
      [transcriptId]
    );

    console.log(
      `Synced meeting ${meetingId} -> transcript ${transcriptId}, ` +
      `${chunks.length} segments, ${embeddingsGenerated} embeddings`
    );

    return successResponse({
      message: 'Meeting synced successfully',
      meetingId,
      transcriptId,
      segmentsCreated: chunks.length,
      embeddingsGenerated,
    }, req);
  } catch (error) {
    console.error('Sync error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to sync meeting',
      500,
      req
    );
  }
}
