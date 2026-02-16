/**
 * Analytics handlers: talk-time ratios, conversion correlation, sentiment trends
 * Ported from meeting-translation/src/services/DashboardService.ts advanced methods
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';

export async function handleTalkTime(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const demoCondition = demoOnly
    ? 'WHERE t.is_demo = TRUE'
    : includeDemo ? '' : 'WHERE (t.is_demo = FALSE OR t.is_demo IS NULL)';

  const db = getRailwayDb();
  const transcripts = await db.unsafe(
    `SELECT t.id, t.title, t.full_text, t.created_at
     FROM transcripts t ${demoCondition}
     ORDER BY t.created_at DESC LIMIT $1`,
    [limit]
  );

  const speakerPattern = /^([A-Za-z\s\-'\.]+):\s*(.*)$/;
  const data = transcripts.map((t: Record<string, unknown>) => {
    const fullText = (t.full_text as string) || '';
    const lines = fullText.split('\n').filter((l: string) => l.trim());
    const speakerStats: Record<string, number> = {};

    for (const line of lines) {
      const m = line.match(speakerPattern);
      if (m) {
        const speaker = m[1].trim();
        const words = m[2].trim().split(/\s+/).filter((w: string) => w.length > 0).length;
        speakerStats[speaker] = (speakerStats[speaker] || 0) + words;
      }
    }

    const speakers = Object.entries(speakerStats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, wordCount]) => ({ name, wordCount }));
    const totalWords = speakers.reduce((s, sp) => s + sp.wordCount, 0);
    const topPct = totalWords > 0 ? Math.round((speakers[0]?.wordCount || 0) / totalWords * 100) : 0;

    return {
      id: t.id,
      title: (t.title as string) || 'Untitled Meeting',
      createdAt: t.created_at instanceof Date ? (t.created_at as Date).toISOString() : t.created_at,
      speakers: speakers.map(sp => ({
        ...sp,
        percentage: totalWords > 0 ? Math.round(sp.wordCount / totalWords * 100) : 0,
      })),
      totalWords,
      topSpeakerPercentage: topPct,
      isBalanced: topPct >= 30 && topPct <= 60,
    };
  });

  return successResponse(data, req);
}

export async function handleConversion(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const demoCondition = demoOnly
    ? 'AND t.is_demo = true'
    : includeDemo ? '' : 'AND (t.is_demo = false OR t.is_demo IS NULL)';

  const db = getRailwayDb();
  const transcripts = await db.unsafe(
    `SELECT t.id, t.title, t.created_at
     FROM transcripts t WHERE 1=1 ${demoCondition}
     ORDER BY t.created_at DESC LIMIT $1`,
    [limit]
  );

  const data = await Promise.all(
    transcripts.map(async (t: Record<string, unknown>) => {
      const tid = t.id as string;
      const [sentimentRows, actionRows, keyRows] = await Promise.all([
        db.unsafe(`SELECT sentiment, positive_score FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [tid]),
        db.unsafe(`SELECT id FROM action_items WHERE transcript_id = $1`, [tid]),
        db.unsafe(`SELECT moment_type FROM key_moments WHERE transcript_id = $1`, [tid]),
      ]);

      const sentiment = sentimentRows[0] as Record<string, unknown> | undefined;
      const agreements = keyRows.filter((k: Record<string, unknown>) => k.moment_type === 'agreement').length;
      const decisions = keyRows.filter((k: Record<string, unknown>) => k.moment_type === 'decision').length;
      const milestones = keyRows.filter((k: Record<string, unknown>) => k.moment_type === 'milestone').length;
      const blockers = keyRows.filter((k: Record<string, unknown>) => k.moment_type === 'blocker').length;

      let conversionScore = 50;
      if (sentiment?.positive_score != null) conversionScore += (parseFloat(String(sentiment.positive_score)) - 0.5) * 30;
      conversionScore += Math.min(agreements * 5, 15);
      conversionScore += Math.min(decisions * 5, 10);
      conversionScore += Math.min(milestones * 3, 10);
      conversionScore += Math.min(actionRows.length * 2, 10);
      conversionScore -= blockers * 5;
      conversionScore = Math.max(0, Math.min(100, Math.round(conversionScore)));

      return {
        id: tid,
        title: (t.title as string) || 'Untitled Meeting',
        createdAt: t.created_at instanceof Date ? (t.created_at as Date).toISOString() : t.created_at,
        conversionScore,
        status: conversionScore >= 70 ? 'hot' : conversionScore >= 50 ? 'warm' : 'cold',
        signals: { agreements, decisions, milestones, blockers, actionItems: actionRows.length },
        sentiment: sentiment?.sentiment ?? 'unknown',
      };
    })
  );

  return successResponse(data, req);
}

export async function handleSentimentTrends(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';
  const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);

  const demoCondition = demoOnly
    ? 'AND t.is_demo = true'
    : includeDemo ? '' : 'AND (t.is_demo = false OR t.is_demo IS NULL)';

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = getRailwayDb();
  const rows = await db.unsafe(
    `SELECT sa.sentiment, sa.positive_score, sa.negative_score, sa.neutral_score,
            t.id as transcript_id, t.title, t.created_at
     FROM sentiment_analysis sa
     JOIN transcripts t ON t.id = sa.transcript_id
     WHERE sa.segment_id IS NULL AND t.created_at >= $1 ${demoCondition}
     ORDER BY t.created_at ASC`,
    [since]
  );

  const timeline = rows.map((r: Record<string, unknown>) => ({
    transcriptId: r.transcript_id,
    title: r.title,
    date: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : r.created_at,
    sentiment: r.sentiment,
    positiveScore: r.positive_score != null ? parseFloat(String(r.positive_score)) : null,
    negativeScore: r.negative_score != null ? parseFloat(String(r.negative_score)) : null,
    neutralScore: r.neutral_score != null ? parseFloat(String(r.neutral_score)) : null,
  }));

  const totals = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  for (const r of timeline) {
    const s = r.sentiment as string;
    if (s in totals) totals[s as keyof typeof totals]++;
  }

  return successResponse({ timeline, totals, days, count: timeline.length }, req);
}
