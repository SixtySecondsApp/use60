/**
 * Meeting Analytics Edge Function
 *
 * Proxies the meeting-translation Railway API. Connects to Railway PostgreSQL
 * for transcripts, insights, dashboard metrics, and semantic search.
 *
 * Required secrets: RAILWAY_DATABASE_URL, OPENAI_API_KEY (for search)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getRailwayDb, checkRailwayConnection } from './db.ts';

// =============================================================================
// Helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200, req: Request): Response {
  const headers = { 'Content-Type': 'application/json', ...getCorsHeaders(req) };
  return new Response(JSON.stringify(data), { status, headers });
}

function successResponse<T>(data: T, req: Request): Response {
  return jsonResponse({ success: true, data }, 200, req);
}

function errorResponse(message: string, status: number, req: Request): Response {
  return jsonResponse({ success: false, error: message }, status, req);
}

function getApiPath(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/meeting-analytics\/?(.*)$/);
    const suffix = match ? match[1] || '' : pathname.replace(/^\/+/, '');
    return suffix.startsWith('api') ? suffix : pathname.replace(/^\/+/, '');
  } catch {
    return url;
  }
}

// =============================================================================
// Transcripts
// =============================================================================

async function handleGetTranscripts(req: Request): Promise<Response> {
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

  const countResult = await db.unsafe<[{ count: string }]>(
    `SELECT COUNT(*)::text as count FROM transcripts t ${whereClause}`,
    []
  );
  const total = parseInt(countResult[0]?.count || '0', 10);

  const rows = Array.isArray(transcripts) ? transcripts : [];
  const data = rows.map((r: Record<string, unknown>) => ({
    ...r,
    overallConfidence: r.overallConfidence != null ? parseFloat(String(r.overallConfidence)) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    processedAt: r.processedAt instanceof Date ? r.processedAt.toISOString() : r.processedAt,
  }));

  return jsonResponse(
    { success: true, data, pagination: { total, limit, offset, hasMore: offset + data.length < total } },
    200,
    req
  );
}

async function handleGetTranscript(id: string, req: Request): Promise<Response> {
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

  const row = Array.isArray(rows) ? rows[0] : null;
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
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    processedAt: row.processed_at instanceof Date ? row.processed_at?.toISOString() : row.processed_at,
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

// =============================================================================
// Dashboard
// =============================================================================

async function handleGetDashboardMetrics(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  const demoCondition = demoOnly
    ? 'AND t.is_demo = true'
    : includeDemo
      ? ''
      : 'AND (t.is_demo = false OR t.is_demo IS NULL)';

  const db = getRailwayDb();

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const transcriptDemoCond = demoCondition;
  const countDemoCond = demoCondition.replace(/t\./g, '');

  const [transcripts, actionResult, weeklyResult] = await Promise.all([
    db.unsafe(
      `SELECT t.id, t.title, t.full_text, t.created_at FROM transcripts t WHERE 1=1 ${transcriptDemoCond} ORDER BY t.created_at DESC LIMIT 100`,
      []
    ),
    db.unsafe<[{ total: string; completed: string; pending: string }]>(
      `SELECT
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE ai.status = 'completed')::text as completed,
        COUNT(*) FILTER (WHERE ai.status = 'pending')::text as pending
       FROM action_items ai JOIN transcripts t ON ai.transcript_id = t.id WHERE 1=1 ${transcriptDemoCond}`,
      []
    ),
    db.unsafe<[{ completed_this_week: string; created_this_week: string }]>(
      `SELECT
        COUNT(*) FILTER (WHERE ai.status = 'completed' AND ai.created_at >= $1)::text as completed_this_week,
        COUNT(*) FILTER (WHERE ai.created_at >= $1)::text as created_this_week
       FROM action_items ai JOIN transcripts t ON ai.transcript_id = t.id WHERE 1=1 ${transcriptDemoCond}`,
      [oneWeekAgo]
    ),
    db.unsafe<[{ this_week: string; last_week: string }]>(
      `SELECT
        COUNT(*) FILTER (WHERE created_at >= $1)::text as this_week,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1)::text as last_week
       FROM transcripts WHERE 1=1 ${countDemoCond}`,
      [oneWeekAgo, twoWeeksAgo]
    ),
  ]);

  const transcriptList = Array.isArray(transcripts) ? transcripts : [];
  const actionRow0 = Array.isArray(actionResult) ? actionResult[0] : null;
  const weeklyRow0 = Array.isArray(weeklyResult) ? weeklyResult[0] : null;
  const actionRow = {
    total: actionRow0?.total ?? '0',
    completed: actionRow0?.completed ?? '0',
    pending: actionRow0?.pending ?? '0',
    completed_this_week: (Array.isArray(weeklyResult) ? weeklyResult[0] : null)?.completed_this_week ?? '0',
    created_this_week: (Array.isArray(weeklyResult) ? weeklyResult[0] : null)?.created_this_week ?? '0',
  };
  const weeklyRow = {
    this_week: weeklyRow0?.this_week ?? '0',
    last_week: weeklyRow0?.last_week ?? '0',
  };

  const totalMeetings = transcriptList.length;
  const totalActionItems = parseInt(actionRow?.total || '0', 10);
  const completedActionItems = parseInt(actionRow?.completed || '0', 10);
  const pendingActionItems = parseInt(actionRow?.pending || '0', 10);
  const thisWeekCount = parseInt(weeklyRow?.this_week || '0', 10);
  const lastWeekCount = parseInt(weeklyRow?.last_week || '0', 10);
  const meetingsTrend = lastWeekCount > 0 ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : thisWeekCount > 0 ? 100 : 0;

  const performanceData: Array<{ id: string; title: string; score: number; grade: string; createdAt: Date; sentiment: string; unassignedActionItems: number }> = [];
  const conversionData: Array<{ id: string; title: string; conversionScore: number; blockerCount: number; createdAt: Date }> = [];
  const talkTimeData: Array<{ id: string; title: string; topSpeakerPercentage: number; isBalanced: boolean }> = [];

  for (const t of transcriptList) {
    const tid = (t as Record<string, unknown>).id as string;
    const [sentimentRows, actionRows, keyRows] = await Promise.all([
      db.unsafe(`SELECT sentiment, positive_score FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [tid]),
      db.unsafe(`SELECT assignee FROM action_items WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT moment_type FROM key_moments WHERE transcript_id = $1`, [tid]),
    ]);

    const sentiment = Array.isArray(sentimentRows) ? sentimentRows[0] : null;
    const actionItems = Array.isArray(actionRows) ? actionRows : [];
    const keyMoments = Array.isArray(keyRows) ? keyRows : [];

    const questionsAsked = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'question').length;
    const agreements = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'agreement').length;
    const assignedActions = actionItems.filter((a: { assignee: string | null }) => a.assignee).length;
    const blockers = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'blocker');
    const decisions = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'decision').length;
    const milestones = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'milestone').length;

    let score = 30;
    score += Math.min(questionsAsked * 5, 15);
    score += Math.min(agreements * 5, 15);
    score += Math.min(assignedActions * 3, 10);
    score += Math.min(actionItems.length * 2, 10);
    if (sentiment?.sentiment === 'positive') score += 10;
    if (sentiment?.sentiment === 'negative') score -= 15;
    score -= Math.min((actionItems.length - assignedActions) * 2, 10);
    if (questionsAsked >= 2 && agreements >= 2) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C+' : score >= 50 ? 'C' : score >= 40 ? 'D+' : score >= 30 ? 'D' : 'F';

    let conversionScore = 50;
    if (sentiment?.positive_score != null) conversionScore += (parseFloat(String(sentiment.positive_score)) - 0.5) * 30;
    conversionScore += Math.min(agreements * 5, 15);
    conversionScore += Math.min(decisions * 5, 10);
    conversionScore += Math.min(milestones * 3, 10);
    conversionScore += Math.min(actionItems.length * 2, 10);
    conversionScore -= blockers.length * 5;
    conversionScore = Math.max(0, Math.min(100, Math.round(conversionScore)));

    const fullText = (t as Record<string, unknown>).full_text as string || '';
    const lines = fullText.split('\n').filter((l: string) => l.trim());
    const speakerPattern = /^([A-Za-z\s\-'\.]+):\s*(.*)$/;
    const speakerStats: Record<string, number> = {};
    for (const line of lines) {
      const m = line.match(speakerPattern);
      if (m) {
        const speaker = m[1].trim();
        const words = m[2].trim().split(/\s+/).filter((w: string) => w.length > 0).length;
        speakerStats[speaker] = (speakerStats[speaker] || 0) + words;
      }
    }
    const speakers = Object.entries(speakerStats).sort((a, b) => b[1] - a[1]);
    const totalWords = speakers.reduce((s, [, c]) => s + c, 0);
    const topPct = totalWords > 0 ? Math.round((speakers[0]?.[1] || 0) / totalWords * 100) : 0;
    const isBalanced = topPct >= 30 && topPct <= 60;

    performanceData.push({
      id: tid,
      title: ((t as Record<string, unknown>).title as string) || 'Untitled Meeting',
      score,
      grade,
      createdAt: (t as Record<string, unknown>).created_at as Date,
      sentiment: sentiment?.sentiment || 'unknown',
      unassignedActionItems: actionItems.length - assignedActions,
    });
    conversionData.push({
      id: tid,
      title: ((t as Record<string, unknown>).title as string) || 'Untitled Meeting',
      conversionScore,
      blockerCount: blockers.length,
      createdAt: (t as Record<string, unknown>).created_at as Date,
    });
    talkTimeData.push({
      id: tid,
      title: ((t as Record<string, unknown>).title as string) || 'Untitled Meeting',
      topSpeakerPercentage: topPct,
      isBalanced,
    });
  }

  const avgPerformanceScore = performanceData.length > 0
    ? Math.round(performanceData.reduce((s, p) => s + p.score, 0) / performanceData.length)
    : 0;
  const avgConversionScore = conversionData.length > 0
    ? Math.round(conversionData.reduce((s, c) => s + c.conversionScore, 0) / conversionData.length)
    : 0;
  const avgTalkTimeBalance = talkTimeData.length > 0
    ? Math.round(talkTimeData.filter((t) => t.isBalanced).length / talkTimeData.length * 100)
    : 0;

  const topPerformers = performanceData
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title,
      score: p.score,
      grade: p.grade,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    }));

  const pipelineHealth = conversionData
    .sort((a, b) => b.conversionScore - a.conversionScore)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      title: c.title,
      conversionScore: c.conversionScore,
      status: (c.conversionScore >= 70 ? 'hot' : c.conversionScore >= 50 ? 'warm' : 'cold') as 'hot' | 'warm' | 'cold',
      blockerCount: c.blockerCount,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    }));

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const thisWeekPerf = performanceData.filter((p) => p.createdAt >= oneWeekAgo);
  const lastWeekPerf = performanceData.filter((p) => p.createdAt >= twoWeeksAgo && p.createdAt < oneWeekAgo);
  const scoreThisWeek = thisWeekPerf.length > 0 ? Math.round(thisWeekPerf.reduce((s, p) => s + p.score, 0) / thisWeekPerf.length) : avgPerformanceScore;
  const scoreLastWeek = lastWeekPerf.length > 0 ? Math.round(lastWeekPerf.reduce((s, p) => s + p.score, 0) / lastWeekPerf.length) : avgPerformanceScore;
  const scoreTrend = scoreLastWeek > 0 ? Math.round(((scoreThisWeek - scoreLastWeek) / scoreLastWeek) * 100) : 0;

  const alerts: Array<{ type: string; message: string; severity: string; transcriptId?: string; transcriptTitle?: string }> = [];
  const unassignedMeetings = performanceData.filter((p) => p.unassignedActionItems > 0);
  if (unassignedMeetings.length > 0) {
    const totalUnassigned = unassignedMeetings.reduce((s, m) => s + m.unassignedActionItems, 0);
    alerts.push({
      type: 'action_items',
      message: `${totalUnassigned} action items across ${unassignedMeetings.length} meetings have no owner assigned`,
      severity: totalUnassigned > 5 ? 'warning' : 'info',
    });
  }
  for (const deal of conversionData.filter((c) => c.blockerCount > 0).slice(0, 3)) {
    alerts.push({
      type: 'blockers',
      message: `${deal.title} has ${deal.blockerCount} blocker${deal.blockerCount > 1 ? 's' : ''} - needs attention`,
      severity: deal.blockerCount >= 2 ? 'critical' : 'warning',
      transcriptId: deal.id,
      transcriptTitle: deal.title,
    });
  }
  const imbalanced = talkTimeData.filter((t) => t.topSpeakerPercentage > 70);
  if (imbalanced.length > 0) {
    alerts.push({
      type: 'talk_time',
      message: `${imbalanced.length} call${imbalanced.length > 1 ? 's have' : ' has'} imbalanced talk time (rep > 70%)`,
      severity: imbalanced.length > 3 ? 'warning' : 'info',
    });
  }
  for (const m of performanceData.filter((p) => p.sentiment === 'negative').slice(0, 2)) {
    alerts.push({
      type: 'sentiment',
      message: `${m.title} had negative sentiment - review needed`,
      severity: 'warning',
      transcriptId: m.id,
      transcriptTitle: m.title,
    });
  }
  const lowPerf = performanceData.filter((p) => p.score < 40);
  if (lowPerf.length > 0) {
    alerts.push({
      type: 'performance',
      message: `${lowPerf.length} meeting${lowPerf.length > 1 ? 's' : ''} scored below 40 - coaching opportunity`,
      severity: lowPerf.length > 2 ? 'warning' : 'info',
    });
  }
  alerts.sort((a, b) => (a.severity === 'critical' ? 0 : a.severity === 'warning' ? 1 : 2) - (b.severity === 'critical' ? 0 : b.severity === 'warning' ? 1 : 2));
  const finalAlerts = alerts.slice(0, 10);

  const metrics = {
    summary: {
      totalMeetings,
      avgPerformanceScore,
      avgConversionScore,
      avgTalkTimeBalance,
      totalActionItems,
      completedActionItems,
      pendingActionItems,
    },
    topPerformers,
    pipelineHealth,
    trends: {
      meetingsThisWeek: thisWeekCount,
      meetingsLastWeek: lastWeekCount,
      meetingsTrend,
      scoreThisWeek,
      scoreLastWeek,
      scoreTrend,
      actionItemsCompleted: parseInt(actionRow?.completed_this_week || '0', 10),
      actionItemsCreated: parseInt(actionRow?.created_this_week || '0', 10),
    },
    alerts: finalAlerts,
    lastUpdated: new Date().toISOString(),
  };

  return successResponse(metrics, req);
}

// =============================================================================
// Insights
// =============================================================================

async function handleGetInsights(transcriptId: string, req: Request): Promise<Response> {
  const db = getRailwayDb();
  const transcriptRows = await db.unsafe(`SELECT id FROM transcripts WHERE id = $1`, [transcriptId]);
  if (!Array.isArray(transcriptRows) || transcriptRows.length === 0) {
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

  const mapTopic = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    topicName: r.topic_name,
    relevanceScore: r.relevance_score != null ? parseFloat(String(r.relevance_score)) : null,
    mentionCount: r.mention_count,
    keywords: r.keywords,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  const mapSentiment = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    segmentId: r.segment_id,
    sentiment: r.sentiment,
    confidence: r.confidence != null ? parseFloat(String(r.confidence)) : null,
    positiveScore: r.positive_score != null ? parseFloat(String(r.positive_score)) : null,
    negativeScore: r.negative_score != null ? parseFloat(String(r.negative_score)) : null,
    neutralScore: r.neutral_score != null ? parseFloat(String(r.neutral_score)) : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  const mapActionItem = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    actionText: r.action_text,
    assignee: r.assignee,
    dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : r.due_date,
    priority: r.priority,
    status: r.status,
    startTime: r.start_time,
    endTime: r.end_time,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  const mapKeyMoment = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    momentType: r.moment_type,
    title: r.title,
    description: r.description,
    importanceScore: r.importance_score != null ? parseFloat(String(r.importance_score)) : null,
    startTime: r.start_time,
    endTime: r.end_time,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  const mapSummary = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    summaryType: r.summary_type,
    summaryText: r.summary_text,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  const mapQAPair = (r: Record<string, unknown>) => ({
    id: r.id,
    transcriptId: r.transcript_id,
    questionText: r.question_text,
    answerText: r.answer_text,
    questioner: r.questioner,
    answerer: r.answerer,
    questionTime: r.question_time,
    answerTime: r.answer_time,
    isAnswered: r.is_answered,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });

  const insights = {
    transcriptId,
    topics: (Array.isArray(topics) ? topics : []).map(mapTopic),
    sentiment: Array.isArray(sentimentRows) && sentimentRows[0] ? mapSentiment(sentimentRows[0] as Record<string, unknown>) : null,
    segmentSentiments: (Array.isArray(segmentSentiments) ? segmentSentiments : []).map(mapSentiment),
    actionItems: (Array.isArray(actionItems) ? actionItems : []).map(mapActionItem),
    keyMoments: (Array.isArray(keyMoments) ? keyMoments : []).map(mapKeyMoment),
    summaries: (Array.isArray(summaries) ? summaries : []).map(mapSummary),
    qaPairs: (Array.isArray(qaPairs) ? qaPairs : []).map(mapQAPair),
  };

  return successResponse(insights, req);
}

async function handleGetInsightSubResource(
  transcriptId: string,
  resource: 'topics' | 'sentiment' | 'action-items' | 'key-moments' | 'summary' | 'qa-pairs',
  req: Request
): Promise<Response> {
  const db = getRailwayDb();
  const transcriptRows = await db.unsafe(`SELECT id FROM transcripts WHERE id = $1`, [transcriptId]);
  if (!Array.isArray(transcriptRows) || transcriptRows.length === 0) {
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
        data = { overall: Array.isArray(overall) ? overall[0] : null, segments };
      } else {
        data = { overall: Array.isArray(overall) ? overall[0] : null };
      }
      break;
    }
    case 'action-items': {
      let items = await db.unsafe(`SELECT * FROM action_items WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]);
      const status = url.searchParams.get('status');
      if (status && Array.isArray(items)) {
        items = items.filter((i: { status: string }) => i.status === status);
      }
      data = items;
      break;
    }
    case 'key-moments': {
      let moments = await db.unsafe(`SELECT * FROM key_moments WHERE transcript_id = $1 ORDER BY start_time NULLS LAST`, [transcriptId]);
      const type = url.searchParams.get('type');
      if (type && Array.isArray(moments)) {
        moments = moments.filter((m: { moment_type: string }) => m.moment_type === type);
      }
      data = moments;
      break;
    }
    case 'summary': {
      const type = url.searchParams.get('type');
      if (type) {
        data = await db.unsafe(`SELECT * FROM summaries WHERE transcript_id = $1 AND summary_type = $2`, [transcriptId, type]);
        data = Array.isArray(data) ? data[0] : null;
      } else {
        data = await db.unsafe(`SELECT * FROM summaries WHERE transcript_id = $1`, [transcriptId]);
      }
      break;
    }
    case 'qa-pairs': {
      let pairs = await db.unsafe(`SELECT * FROM qa_pairs WHERE transcript_id = $1 ORDER BY question_time NULLS LAST`, [transcriptId]);
      const answered = url.searchParams.get('answered');
      const unanswered = url.searchParams.get('unanswered');
      if (answered === 'true' && Array.isArray(pairs)) pairs = pairs.filter((p: { is_answered: boolean }) => p.is_answered);
      if (unanswered === 'true' && Array.isArray(pairs)) pairs = pairs.filter((p: { is_answered: boolean }) => !p.is_answered);
      data = pairs;
      break;
    }
    default:
      return errorResponse('Not found', 404, req);
  }

  return successResponse(data, req);
}

async function handleGetSalesPerformance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  const demoCondition = demoOnly ? 'WHERE t.is_demo = TRUE' : includeDemo ? '' : 'WHERE (t.is_demo = FALSE OR t.is_demo IS NULL)';
  const db = getRailwayDb();
  const transcripts = await db.unsafe(
    `SELECT t.id, t.title, t.created_at FROM transcripts t ${demoCondition} ORDER BY t.created_at DESC LIMIT 100`,
    []
  );

  const list = Array.isArray(transcripts) ? transcripts : [];
  const performanceData: Array<Record<string, unknown>> = [];

  for (const t of list) {
    const tid = (t as Record<string, unknown>).id as string;
    const [sentimentRows, actionRows, keyRows, summaryRows] = await Promise.all([
      db.unsafe(`SELECT sentiment FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [tid]),
      db.unsafe(`SELECT assignee FROM action_items WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT moment_type, title FROM key_moments WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT summary_type, summary_text FROM summaries WHERE transcript_id = $1`, [tid]),
    ]);

    const sentiment = Array.isArray(sentimentRows) ? sentimentRows[0] : null;
    const actionItems = Array.isArray(actionRows) ? actionRows : [];
    const keyMoments = Array.isArray(keyRows) ? keyRows : [];
    const summaries = Array.isArray(summaryRows) ? summaryRows : [];

    const questionsAsked = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'question');
    const agreements = keyMoments.filter((k: { moment_type: string }) => k.moment_type === 'agreement');
    const assignedActions = actionItems.filter((a: { assignee: string | null }) => a.assignee);
    const briefSummary = summaries.find((s: { summary_type: string }) => s.summary_type === 'brief');

    let score = 30;
    score += Math.min(questionsAsked.length * 5, 15);
    score += Math.min(agreements.length * 5, 15);
    score += Math.min(assignedActions.length * 3, 10);
    score += Math.min(actionItems.length * 2, 10);
    if (sentiment?.sentiment === 'positive') score += 10;
    if (sentiment?.sentiment === 'negative') score -= 15;
    score -= Math.min((actionItems.length - assignedActions.length) * 2, 10);
    if (questionsAsked.length >= 2 && agreements.length >= 2) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C+' : score >= 50 ? 'C' : score >= 40 ? 'D+' : score >= 30 ? 'D' : 'F';

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (questionsAsked.length >= 2) strengths.push('Strong discovery - asked probing questions');
    if (agreements.length >= 1) strengths.push('Secured explicit agreement');
    if (assignedActions.length >= 3) strengths.push('Clear accountability with assigned actions');
    if (sentiment?.sentiment === 'positive') strengths.push('Maintained positive engagement');
    if (questionsAsked.length === 0) improvements.push('No discovery questions asked');
    if (agreements.length === 0) improvements.push('No explicit agreements reached');
    if (actionItems.length - assignedActions.length > 0) improvements.push(`${actionItems.length - assignedActions.length} action items without owners`);
    if (actionItems.length === 0) improvements.push('No next steps established');
    if (sentiment?.sentiment === 'negative') improvements.push('Conversation had negative sentiment');

    performanceData.push({
      id: tid,
      title: ((t as Record<string, unknown>).title as string) || 'Untitled Meeting',
      createdAt: (t as Record<string, unknown>).created_at,
      score,
      grade,
      metrics: {
        questionsAsked: questionsAsked.length,
        questions: questionsAsked.map((q: { title: string | null }) => q.title),
        agreements: agreements.length,
        agreementDetails: agreements.map((a: { title: string | null }) => a.title),
        totalActionItems: actionItems.length,
        assignedActionItems: assignedActions.length,
        unassignedActionItems: actionItems.length - assignedActions.length,
      },
      sentiment: sentiment?.sentiment || 'unknown',
      summary: briefSummary?.summary_text || '',
      strengths,
      improvements,
    });
  }

  performanceData.sort((a, b) => (b.score as number) - (a.score as number));

  const data = performanceData.map((p) => ({
    ...p,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  }));

  return successResponse(data, req);
}

// =============================================================================
// Search (requires OPENAI_API_KEY)
// =============================================================================

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

async function handleSearch(req: Request): Promise<Response> {
  let body: { query?: string; transcriptId?: string; threshold?: number; limit?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const query = body?.query?.trim();
  if (!query) return errorResponse('query is required and must be a non-empty string', 400, req);

  const threshold = body.threshold ?? 0.7;
  const limit = Math.min(body.limit ?? 10, 50);
  const transcriptId = body.transcriptId;

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
    JOIN transcripts t ON t.id = ts.transcript_id
    WHERE ts.embedding IS NOT NULL AND 1 - (ts.embedding <=> $1::vector) >= $2
  `;
  const params: unknown[] = [embeddingStr, threshold];
  if (transcriptId) {
    searchSql += ' AND ts.transcript_id = $3';
    params.push(transcriptId);
  }
  searchSql += ` ORDER BY ts.embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit);

  const rows = await db.unsafe(searchSql, params);
  const results = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
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

  return successResponse(
    { query, results, totalResults: results.length, searchTimeMs: Date.now() - startTime },
    req
  );
}

async function handleSearchSimilar(req: Request): Promise<Response> {
  let body: { segmentId?: string; threshold?: number; limit?: number; excludeSameTranscript?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, req);
  }
  const segmentId = body?.segmentId;
  if (!segmentId) return errorResponse('segmentId is required', 400, req);

  const threshold = body.threshold ?? 0.7;
  const limit = Math.min(body.limit ?? 10, 50);
  const excludeSameTranscript = body.excludeSameTranscript ?? false;

  const db = getRailwayDb();
  const segRows = await db.unsafe(
    `SELECT id, transcript_id, segment_index, text, start_time, end_time, word_count, avg_confidence
     FROM transcript_segments WHERE id = $1`,
    [segmentId]
  );
  const seg = Array.isArray(segRows) ? segRows[0] : null;
  if (!seg) return errorResponse(`Segment not found: ${segmentId}`, 404, req);

  const text = (seg as Record<string, unknown>).text as string;
  const tid = (seg as Record<string, unknown>).transcript_id as string;
  const embedding = await generateEmbedding(text);
  const embeddingStr = '[' + embedding.join(',') + ']';

  let searchSql = `
    SELECT ts.id, ts.transcript_id as "transcriptId", ts.segment_index as "segmentIndex",
           ts.text, ts.start_time as "startTime", ts.end_time as "endTime",
           ts.word_count as "wordCount", ts.avg_confidence as "avgConfidence",
           t.title as "transcriptTitle",
           1 - (ts.embedding <=> $1::vector) AS similarity
    FROM transcript_segments ts
    JOIN transcripts t ON t.id = ts.transcript_id
    WHERE ts.embedding IS NOT NULL AND ts.id != $2 AND 1 - (ts.embedding <=> $1::vector) >= $3
  `;
  const params: unknown[] = [embeddingStr, segmentId, threshold];
  if (excludeSameTranscript) {
    searchSql += ' AND ts.transcript_id != $4';
    params.push(tid);
  }
  searchSql += ` ORDER BY ts.embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit + 1);

  const rows = await db.unsafe(searchSql, params);
  let results = (Array.isArray(rows) ? rows : [])
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

// =============================================================================
// Router
// =============================================================================

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const path = getApiPath(req.url);
  const pathParts = path.replace(/^\/+/, '').split('/').filter(Boolean);

  if (pathParts[0] === 'health' || path === '/health') {
    const dbOk = await checkRailwayConnection();
    return jsonResponse(
      { status: dbOk ? 'healthy' : 'degraded', database: dbOk ? 'connected' : 'disconnected', timestamp: new Date().toISOString() },
      200,
      req
    );
  }

  if (pathParts[0] !== 'api') {
    return errorResponse(`Cannot ${req.method} ${path}`, 404, req);
  }

  const apiPath = pathParts.slice(1).join('/');

  try {
    if (apiPath === 'transcripts' && req.method === 'GET') {
      return await handleGetTranscripts(req);
    }
    if (apiPath.startsWith('transcripts/') && req.method === 'GET') {
      const id = apiPath.slice('transcripts/'.length).split('/')[0];
      return await handleGetTranscript(id, req);
    }
    if (apiPath === 'dashboard/metrics' && req.method === 'GET') {
      return await handleGetDashboardMetrics(req);
    }
    if (apiPath === 'dashboard/trends' && req.method === 'GET') {
      const metricsRes = await handleGetDashboardMetrics(req);
      const metricsJson = await metricsRes.json();
      const trends = metricsJson?.data?.trends ?? {};
      return successResponse(trends, req);
    }
    if (apiPath === 'dashboard/alerts' && req.method === 'GET') {
      const metricsRes = await handleGetDashboardMetrics(req);
      const metricsJson = await metricsRes.json();
      return successResponse(metricsJson?.data?.alerts ?? [], req);
    }
    if (apiPath === 'dashboard/top-performers' && req.method === 'GET') {
      const metricsRes = await handleGetDashboardMetrics(req);
      const metricsJson = await metricsRes.json();
      const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
      return successResponse((metricsJson?.data?.topPerformers ?? []).slice(0, limit), req);
    }
    if (apiPath === 'dashboard/pipeline-health' && req.method === 'GET') {
      const metricsRes = await handleGetDashboardMetrics(req);
      const metricsJson = await metricsRes.json();
      const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20);
      return successResponse((metricsJson?.data?.pipelineHealth ?? []).slice(0, limit), req);
    }
    if (apiPath === 'insights/sales-performance' && req.method === 'GET') {
      return await handleGetSalesPerformance(req);
    }
    if (apiPath.startsWith('insights/') && req.method === 'GET') {
      const rest = apiPath.slice('insights/'.length);
      const [transcriptId, sub] = rest.split('/');
      if (sub === 'topics') return await handleGetInsightSubResource(transcriptId, 'topics', req);
      if (sub === 'sentiment') return await handleGetInsightSubResource(transcriptId, 'sentiment', req);
      if (sub === 'action-items') return await handleGetInsightSubResource(transcriptId, 'action-items', req);
      if (sub === 'key-moments') return await handleGetInsightSubResource(transcriptId, 'key-moments', req);
      if (sub === 'summary') return await handleGetInsightSubResource(transcriptId, 'summary', req);
      if (sub === 'qa-pairs') return await handleGetInsightSubResource(transcriptId, 'qa-pairs', req);
      if (!sub) return await handleGetInsights(transcriptId, req);
    }
    if (apiPath === 'search' && req.method === 'POST') {
      return await handleSearch(req);
    }
    if (apiPath === 'search/similar' && req.method === 'POST') {
      return await handleSearchSimilar(req);
    }

    return errorResponse(`Cannot ${req.method} ${path}`, 404, req);
  } catch (err) {
    console.error('Meeting analytics error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal server error', 500, req);
  }
}

serve(handleRequest);
