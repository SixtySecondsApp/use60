/**
 * Ask handler: RAG pipeline — query first, AI second.
 * Ports the RAG logic from meeting-translation search route to the Deno edge function.
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY required for ask');
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

function calculateTalkTime(fullText: string): {
  speakers: Array<{ name: string; wordCount: number; percentage: number }>;
  totalWords: number;
  talkRatio: string;
  isBalanced: boolean;
} {
  const lines = (fullText || '').split('\n').filter(line => line.trim());
  const speakerPattern = /^([A-Za-z\s\-'\.]+):\s*(.*)$/;
  const speakerStats: Record<string, number> = {};

  for (const line of lines) {
    const match = line.match(speakerPattern);
    if (match) {
      const speaker = match[1].trim();
      const text = match[2].trim();
      const words = text.split(/\s+/).filter(w => w.length > 0).length;
      speakerStats[speaker] = (speakerStats[speaker] || 0) + words;
    }
  }

  const speakers = Object.entries(speakerStats)
    .map(([name, wordCount]) => ({ name, wordCount, percentage: 0 }))
    .sort((a, b) => b.wordCount - a.wordCount);

  const totalWords = speakers.reduce((sum, s) => sum + s.wordCount, 0);

  speakers.forEach(s => {
    s.percentage = totalWords > 0 ? Math.round((s.wordCount / totalWords) * 100) : 0;
  });

  const topSpeakerPct = speakers[0]?.percentage || 0;
  const otherWords = speakers.slice(1).reduce((sum, s) => sum + s.wordCount, 0);
  const talkRatio = otherWords > 0 ? (speakers[0]?.wordCount / otherWords).toFixed(2) : 'N/A';

  return {
    speakers: speakers.slice(0, 4),
    totalWords,
    talkRatio,
    isBalanced: topSpeakerPct >= 30 && topSpeakerPct <= 60,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transcript {
  id: string;
  title: string | null;
  full_text: string | null;
  created_at: string | null;
  is_demo: boolean;
}

interface SearchResult {
  transcriptId: string;
  text: string;
  similarity: number;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleAsk(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }

  const question = (body?.question as string)?.trim();
  if (!question) return errorResponse('question is required', 400, req);

  const transcriptId = body.transcriptId as string | undefined;
  const maxMeetings = Math.min((body.maxMeetings as number) ?? 20, 50);
  const includeDemo = (body.includeDemo as boolean) ?? false;
  const demoOnly = (body.demoOnly as boolean) ?? false;

  const db = getRailwayDb();

  try {
    // ============================================
    // STEP 0: Detect aggregate vs specific-meeting question
    // ============================================
    const aggregateKeywords = [
      'all calls', 'all meetings', 'every call', 'every meeting',
      'average', 'total', 'overall', 'across all', 'summary of all',
      'how many calls', 'how many meetings', 'last week', 'last month',
      'this week', 'this month', 'in total', 'combined',
    ];
    const questionLower = question.toLowerCase();
    const isAggregateQuestion = aggregateKeywords.some(kw => questionLower.includes(kw));

    // ============================================
    // STEP 1: Get allowed transcripts from DB
    // ============================================
    let transcriptSql = `
      SELECT id, title, full_text, created_at, is_demo
      FROM transcripts
      WHERE 1=1
    `;
    const transcriptParams: unknown[] = [];

    if (demoOnly) {
      transcriptSql += ' AND is_demo = true';
    } else if (!includeDemo) {
      transcriptSql += ' AND (is_demo = false OR is_demo IS NULL)';
    }

    transcriptSql += ' ORDER BY created_at DESC LIMIT 500';

    const allTranscripts = await db.unsafe<Transcript>(transcriptSql, transcriptParams);
    const transcriptMap = new Map(allTranscripts.map(t => [t.id, t]));
    const allowedTranscriptIds = new Set(allTranscripts.map(t => t.id));

    // ============================================
    // STEP 2: Vector search to find relevant content
    // ============================================
    const questionEmbedding = await generateEmbedding(question);
    const embeddingStr = '[' + questionEmbedding.join(',') + ']';

    let searchSql = `
      SELECT ts.transcript_id AS "transcriptId",
             ts.text,
             1 - (ts.embedding <=> $1::vector) AS similarity
      FROM transcript_segments ts
      WHERE ts.embedding IS NOT NULL
        AND 1 - (ts.embedding <=> $1::vector) >= $2
    `;
    const searchParams: unknown[] = [embeddingStr, 0.2];

    if (transcriptId) {
      searchSql += ' AND ts.transcript_id = $3';
      searchParams.push(transcriptId);
    }

    searchSql += ` ORDER BY ts.embedding <=> $1::vector LIMIT 30`;

    const searchRows = await db.unsafe<SearchResult>(searchSql, searchParams);

    // Filter to only segments from allowed transcripts
    const filteredSearchResults = searchRows.filter(r => allowedTranscriptIds.has(r.transcriptId));

    // ============================================
    // STEP 3: Rank meetings by relevance
    // ============================================
    const meetingRelevance = new Map<string, { count: number; totalSimilarity: number; topSimilarity: number }>();

    for (const result of filteredSearchResults) {
      const tid = result.transcriptId;
      const sim = typeof result.similarity === 'number' ? result.similarity : parseFloat(String(result.similarity));
      const existing = meetingRelevance.get(tid) || { count: 0, totalSimilarity: 0, topSimilarity: 0 };
      existing.count++;
      existing.totalSimilarity += sim;
      existing.topSimilarity = Math.max(existing.topSimilarity, sim);
      meetingRelevance.set(tid, existing);
    }

    const rankedMeetingIds = Array.from(meetingRelevance.entries())
      .map(([id, stats]) => ({
        id,
        score: stats.count * 0.3 + stats.totalSimilarity * 0.4 + stats.topSimilarity * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMeetings)
      .map(m => m.id);

    // ============================================
    // STEP 4: Check for specific meeting mentioned in question
    // ============================================
    const ignoreWords = new Set(['viewpoint', 'ventures', 'meeting', 'call', 'zoom', 'teams', 'the', 'and', 'with']);

    let specificMeeting: string | null = null;
    let targetMeetingIds = rankedMeetingIds;

    const scoredTranscripts = allTranscripts.map(t => {
      if (!t.title) return { transcript: t, score: 0 };
      const titleParts = t.title.toLowerCase().split(/[\s\-\/\|\(\)\<\>\,\:]+/).filter(p => p.length > 2);
      let score = 0;
      for (const part of titleParts) {
        if (questionLower.includes(part)) {
          score += ignoreWords.has(part) ? 1 : 10;
        }
      }
      return { transcript: t, score };
    });

    const bestMatch = scoredTranscripts.filter(s => s.score >= 10).sort((a, b) => b.score - a.score)[0];

    if (bestMatch && !isAggregateQuestion) {
      targetMeetingIds = [bestMatch.transcript.id];
      specificMeeting = bestMatch.transcript.title;
    } else if (isAggregateQuestion) {
      targetMeetingIds = allTranscripts.map(t => t.id);
    }

    // Fallback: no vector matches and no specific meeting -> use most recent meetings
    if (targetMeetingIds.length === 0) {
      targetMeetingIds = allTranscripts.slice(0, maxMeetings).map(t => t.id);
    }

    // ============================================
    // STEP 5: Fetch structured data for relevant meetings
    // ============================================
    const structuredData = await Promise.all(
      targetMeetingIds.map(async (tid) => {
        const t = transcriptMap.get(tid);
        if (!t) return null;

        // Fetch insights in parallel
        const [sentimentRows, actionItemRows, keyMomentRows, summaryRows] = await Promise.all([
          db.unsafe<Record<string, unknown>>(
            `SELECT sentiment, positive_score AS "positiveScore"
             FROM sentiment_analysis
             WHERE transcript_id = $1 AND segment_id IS NULL
             LIMIT 1`,
            [tid]
          ),
          db.unsafe<Record<string, unknown>>(
            `SELECT action_text AS "actionText", assignee, priority
             FROM action_items
             WHERE transcript_id = $1
             ORDER BY priority ASC NULLS LAST
             LIMIT 8`,
            [tid]
          ),
          db.unsafe<Record<string, unknown>>(
            `SELECT title, description, moment_type AS "momentType"
             FROM key_moments
             WHERE transcript_id = $1`,
            [tid]
          ),
          db.unsafe<Record<string, unknown>>(
            `SELECT summary_text AS "summaryText", summary_type AS "summaryType"
             FROM summaries
             WHERE transcript_id = $1`,
            [tid]
          ),
        ]);

        const sentiment = sentimentRows[0];
        const briefSummary = summaryRows.find(s => s.summaryType === 'brief');
        const talkTime = calculateTalkTime(t.full_text || '');

        const objections = keyMomentRows
          .filter(km => km.momentType === 'blocker' || km.momentType === 'disagreement')
          .map(km => ({ title: km.title, description: km.description }));

        const questions = keyMomentRows
          .filter(km => km.momentType === 'question')
          .map(km => km.title);

        return {
          title: t.title || 'Untitled',
          id: t.id,
          date: t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : 'unknown',
          sentiment: sentiment?.sentiment,
          positiveScore: sentiment?.positiveScore,
          agreements: keyMomentRows.filter(km => km.momentType === 'agreement').map(km => km.title),
          decisions: keyMomentRows.filter(km => km.momentType === 'decision').map(km => km.title),
          milestones: keyMomentRows.filter(km => km.momentType === 'milestone').map(km => km.title),
          objections,
          questions,
          actionItems: actionItemRows.map(ai => ({
            text: ai.actionText,
            assignee: ai.assignee,
            priority: ai.priority,
          })),
          summary: (briefSummary?.summaryText as string)?.substring(0, 400) || '',
          talkTime: {
            speakers: talkTime.speakers.map(s => ({ name: s.name, percentage: s.percentage })),
            totalWords: talkTime.totalWords,
            talkRatio: talkTime.talkRatio,
            isBalanced: talkTime.isBalanced,
          },
        };
      })
    );

    const validStructuredData = structuredData.filter(Boolean);

    // ============================================
    // STEP 6: Get relevant transcript excerpts
    // ============================================
    const targetSet = new Set(targetMeetingIds);
    const relevantSegments = filteredSearchResults
      .filter(r => targetSet.has(r.transcriptId))
      .slice(0, 15);

    const segmentContext = relevantSegments.length > 0
      ? relevantSegments.map((r, i) => {
          const title = transcriptMap.get(r.transcriptId)?.title || 'Unknown';
          const sim = typeof r.similarity === 'number' ? r.similarity : parseFloat(String(r.similarity));
          return `[Excerpt ${i + 1} from "${title}" - ${(sim * 100).toFixed(0)}% match]\n${r.text}`;
        }).join('\n\n')
      : 'No specific excerpts found.';

    // ============================================
    // STEP 7: Call OpenAI GPT-4o-mini with focused context
    // ============================================
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) throw new Error('OPENAI_API_KEY required for ask');

    const todayDate = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are an AI assistant analyzing sales meeting transcripts for a venture capital firm.
Today's date is ${todayDate}.

You receive:
1. STRUCTURED DATA: Pre-analyzed insights for each meeting including:
   - date: When the meeting occurred (use this for time-based questions like "last week" or "last month")
   - sentiment/positiveScore: Overall meeting sentiment
   - agreements, decisions, milestones: Positive outcomes
   - objections: Blockers and concerns raised (use for "what objections" questions)
   - questions: Questions asked during the call
   - actionItems: Tasks with assignees and priorities (look for "send proposal", "follow up" etc.)
   - talkTime: Speaker percentages and whether balanced (30-60% for top speaker is balanced)
   - summary: Brief meeting summary
2. TRANSCRIPT EXCERPTS: Actual conversation text, ranked by relevance

Guidelines:
- For time-based questions ("last week", "last month"), filter by the date field
- For "how many calls" questions, count meetings where a specific person appears in talkTime.speakers
- For objection questions, look at the objections array and also search excerpts for hesitation/concerns
- For proposal/promise questions, search actionItems for "send", "proposal", "quote", "follow up" and cite the exact text
- Always cite specific meeting names, dates, speaker names, and quote relevant text
- If data is insufficient, clearly state what's missing`;

    const userPrompt = `**Question:** ${question}

**Today's Date:** ${todayDate}

**RELEVANT MEETINGS (${validStructuredData.length} of ${allTranscripts.length} total):**
${JSON.stringify(validStructuredData, null, 2)}

**RELEVANT TRANSCRIPT EXCERPTS:**
${segmentContext}

Provide a clear, specific answer. For questions about promises, proposals, or commitments, search the excerpts and action items carefully and quote the exact sentences. Include dates and sentiment scores where relevant.`;

    const completionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
      }),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      throw new Error(`OpenAI chat completion failed: ${completionRes.status} ${errText}`);
    }

    const completionJson = await completionRes.json();
    const answer = completionJson.choices?.[0]?.message?.content || 'Unable to generate answer';

    // ============================================
    // STEP 8: Return answer with source citations
    // ============================================
    return successResponse(
      {
        answer,
        sources: relevantSegments.map(r => ({
          transcriptId: r.transcriptId,
          transcriptTitle: transcriptMap.get(r.transcriptId)?.title || 'Unknown',
          text: r.text.substring(0, 200) + (r.text.length > 200 ? '...' : ''),
          similarity: typeof r.similarity === 'number' ? r.similarity : parseFloat(String(r.similarity)),
        })),
        segmentsSearched: filteredSearchResults.length,
        meetingsAnalyzed: validStructuredData.length,
        totalMeetings: allTranscripts.length,
        isAggregateQuestion,
        specificMeeting,
      },
      req
    );
  } catch (error) {
    console.error('Error in RAG ask handler:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to process question',
      500,
      req
    );
  }
}
