/**
 * Dashboard handlers: metrics, trends, alerts, top performers, pipeline health, sales performance
 */

import { getRailwayDb } from '../db.ts';
import { jsonResponse, successResponse, errorResponse } from '../helpers.ts';

export async function handleGetDashboardMetrics(req: Request): Promise<Response> {
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

  const [transcripts, actionResult, weeklyResult, weeklyTranscripts] = await Promise.all([
    db.unsafe(
      `SELECT t.id, t.title, t.full_text, t.created_at FROM transcripts t WHERE 1=1 ${transcriptDemoCond} ORDER BY t.created_at DESC LIMIT 100`,
      []
    ),
    db.unsafe(
      `SELECT
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE ai.status = 'completed')::text as completed,
        COUNT(*) FILTER (WHERE ai.status = 'pending')::text as pending
       FROM action_items ai JOIN transcripts t ON ai.transcript_id = t.id WHERE 1=1 ${transcriptDemoCond}`,
      []
    ),
    db.unsafe(
      `SELECT
        COUNT(*) FILTER (WHERE ai.status = 'completed' AND ai.created_at >= $1)::text as completed_this_week,
        COUNT(*) FILTER (WHERE ai.created_at >= $1)::text as created_this_week
       FROM action_items ai JOIN transcripts t ON ai.transcript_id = t.id WHERE 1=1 ${transcriptDemoCond}`,
      [oneWeekAgo]
    ),
    db.unsafe(
      `SELECT
        COUNT(*) FILTER (WHERE created_at >= $1)::text as this_week,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1)::text as last_week
       FROM transcripts WHERE 1=1 ${countDemoCond}`,
      [oneWeekAgo, twoWeeksAgo]
    ),
  ]);

  const transcriptList = Array.isArray(transcripts) ? transcripts : [];
  const actionRow0 = Array.isArray(actionResult) ? actionResult[0] as Record<string, string> | undefined : undefined;
  const weeklyRow0 = Array.isArray(weeklyResult) ? weeklyResult[0] as Record<string, string> | undefined : undefined;
  const weeklyTxRow0 = Array.isArray(weeklyTranscripts) ? weeklyTranscripts[0] as Record<string, string> | undefined : undefined;

  const actionRow = {
    total: actionRow0?.total ?? '0',
    completed: actionRow0?.completed ?? '0',
    pending: actionRow0?.pending ?? '0',
    completed_this_week: weeklyRow0?.completed_this_week ?? '0',
    created_this_week: weeklyRow0?.created_this_week ?? '0',
  };
  const weeklyRow = {
    this_week: weeklyTxRow0?.this_week ?? '0',
    last_week: weeklyTxRow0?.last_week ?? '0',
  };

  const totalMeetings = transcriptList.length;
  const totalActionItems = parseInt(actionRow.total || '0', 10);
  const completedActionItems = parseInt(actionRow.completed || '0', 10);
  const pendingActionItems = parseInt(actionRow.pending || '0', 10);
  const thisWeekCount = parseInt(weeklyRow.this_week || '0', 10);
  const lastWeekCount = parseInt(weeklyRow.last_week || '0', 10);
  const meetingsTrend = lastWeekCount > 0 ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : thisWeekCount > 0 ? 100 : 0;

  const performanceData: Array<Record<string, unknown>> = [];
  const conversionData: Array<Record<string, unknown>> = [];
  const talkTimeData: Array<Record<string, unknown>> = [];

  for (const t of transcriptList) {
    const rec = t as Record<string, unknown>;
    const tid = rec.id as string;
    const [sentimentRows, actionRows, keyRows] = await Promise.all([
      db.unsafe(`SELECT sentiment, positive_score FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [tid]),
      db.unsafe(`SELECT assignee FROM action_items WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT moment_type FROM key_moments WHERE transcript_id = $1`, [tid]),
    ]);

    const sentiment = Array.isArray(sentimentRows) ? sentimentRows[0] as Record<string, unknown> | undefined : undefined;
    const actionItems = Array.isArray(actionRows) ? actionRows : [];
    const keyMoments = Array.isArray(keyRows) ? keyRows : [];

    const questionsAsked = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'question').length;
    const agreements = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'agreement').length;
    const assignedActions = actionItems.filter((a: Record<string, unknown>) => a.assignee).length;
    const blockers = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'blocker');
    const decisions = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'decision').length;
    const milestones = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'milestone').length;

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

    const fullText = rec.full_text as string || '';
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
      title: (rec.title as string) || 'Untitled Meeting',
      score,
      grade,
      createdAt: rec.created_at,
      sentiment: sentiment?.sentiment || 'unknown',
      unassignedActionItems: actionItems.length - assignedActions,
    });
    conversionData.push({
      id: tid,
      title: (rec.title as string) || 'Untitled Meeting',
      conversionScore,
      blockerCount: blockers.length,
      createdAt: rec.created_at,
    });
    talkTimeData.push({
      id: tid,
      title: (rec.title as string) || 'Untitled Meeting',
      topSpeakerPercentage: topPct,
      isBalanced,
    });
  }

  const avgPerformanceScore = performanceData.length > 0
    ? Math.round(performanceData.reduce((s, p) => s + (p.score as number), 0) / performanceData.length)
    : 0;
  const avgConversionScore = conversionData.length > 0
    ? Math.round(conversionData.reduce((s, c) => s + (c.conversionScore as number), 0) / conversionData.length)
    : 0;
  const avgTalkTimeBalance = talkTimeData.length > 0
    ? Math.round(talkTimeData.filter((t) => t.isBalanced).length / talkTimeData.length * 100)
    : 0;

  const topPerformers = [...performanceData]
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title,
      score: p.score,
      grade: p.grade,
      createdAt: p.createdAt instanceof Date ? (p.createdAt as Date).toISOString() : p.createdAt,
    }));

  const pipelineHealth = [...conversionData]
    .sort((a, b) => (b.conversionScore as number) - (a.conversionScore as number))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      title: c.title,
      conversionScore: c.conversionScore,
      status: ((c.conversionScore as number) >= 70 ? 'hot' : (c.conversionScore as number) >= 50 ? 'warm' : 'cold'),
      blockerCount: c.blockerCount,
      createdAt: c.createdAt instanceof Date ? (c.createdAt as Date).toISOString() : c.createdAt,
    }));

  const thisWeekPerf = performanceData.filter((p) => (p.createdAt as Date) >= oneWeekAgo);
  const lastWeekPerf = performanceData.filter((p) => (p.createdAt as Date) >= twoWeeksAgo && (p.createdAt as Date) < oneWeekAgo);
  const scoreThisWeek = thisWeekPerf.length > 0 ? Math.round(thisWeekPerf.reduce((s, p) => s + (p.score as number), 0) / thisWeekPerf.length) : avgPerformanceScore;
  const scoreLastWeek = lastWeekPerf.length > 0 ? Math.round(lastWeekPerf.reduce((s, p) => s + (p.score as number), 0) / lastWeekPerf.length) : avgPerformanceScore;
  const scoreTrend = scoreLastWeek > 0 ? Math.round(((scoreThisWeek - scoreLastWeek) / scoreLastWeek) * 100) : 0;

  const alerts: Array<Record<string, unknown>> = [];
  const unassignedMeetings = performanceData.filter((p) => (p.unassignedActionItems as number) > 0);
  if (unassignedMeetings.length > 0) {
    const totalUnassigned = unassignedMeetings.reduce((s, m) => s + (m.unassignedActionItems as number), 0);
    alerts.push({
      type: 'action_items',
      message: `${totalUnassigned} action items across ${unassignedMeetings.length} meetings have no owner assigned`,
      severity: totalUnassigned > 5 ? 'warning' : 'info',
    });
  }
  for (const deal of conversionData.filter((c) => (c.blockerCount as number) > 0).slice(0, 3)) {
    alerts.push({
      type: 'blockers',
      message: `${deal.title} has ${deal.blockerCount} blocker${(deal.blockerCount as number) > 1 ? 's' : ''} - needs attention`,
      severity: (deal.blockerCount as number) >= 2 ? 'critical' : 'warning',
      transcriptId: deal.id,
      transcriptTitle: deal.title,
    });
  }
  const imbalanced = talkTimeData.filter((t) => (t.topSpeakerPercentage as number) > 70);
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
  const lowPerf = performanceData.filter((p) => (p.score as number) < 40);
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
      actionItemsCompleted: parseInt(actionRow.completed_this_week || '0', 10),
      actionItemsCreated: parseInt(actionRow.created_this_week || '0', 10),
    },
    alerts: finalAlerts,
    lastUpdated: new Date().toISOString(),
  };

  return successResponse(metrics, req);
}

/**
 * Returns just the metrics object (used internally by reports handler).
 * Avoids re-parsing the JSON response.
 */
export async function getDashboardMetricsData(req: Request): Promise<Record<string, unknown>> {
  const res = await handleGetDashboardMetrics(req);
  const json = await res.json();
  return json?.data ?? {};
}

export async function handleGetSalesPerformance(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeDemo = url.searchParams.get('includeDemo') !== 'false';
  const demoOnly = url.searchParams.get('demoOnly') === 'true';

  const demoCondition = demoOnly ? 'WHERE t.is_demo = TRUE' : includeDemo ? '' : 'WHERE (t.is_demo = FALSE OR t.is_demo IS NULL)';
  const db = getRailwayDb();
  const transcripts = await db.unsafe(
    `SELECT t.id, t.title, t.created_at FROM transcripts t ${demoCondition} ORDER BY t.created_at DESC LIMIT 100`,
    []
  );

  const list = transcripts;
  const performanceData: Array<Record<string, unknown>> = [];

  for (const t of list) {
    const rec = t as Record<string, unknown>;
    const tid = rec.id as string;
    const [sentimentRows, actionRows, keyRows, summaryRows] = await Promise.all([
      db.unsafe(`SELECT sentiment FROM sentiment_analysis WHERE transcript_id = $1 AND segment_id IS NULL`, [tid]),
      db.unsafe(`SELECT assignee FROM action_items WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT moment_type, title FROM key_moments WHERE transcript_id = $1`, [tid]),
      db.unsafe(`SELECT summary_type, summary_text FROM summaries WHERE transcript_id = $1`, [tid]),
    ]);

    const sentiment = sentimentRows[0] as Record<string, unknown> | undefined;
    const actionItems = actionRows;
    const keyMoments = keyRows;
    const summaries = summaryRows;

    const questionsAsked = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'question');
    const agreementsList = keyMoments.filter((k: Record<string, unknown>) => k.moment_type === 'agreement');
    const assignedActions = actionItems.filter((a: Record<string, unknown>) => a.assignee);
    const briefSummary = summaries.find((s: Record<string, unknown>) => s.summary_type === 'brief');

    let score = 30;
    score += Math.min(questionsAsked.length * 5, 15);
    score += Math.min(agreementsList.length * 5, 15);
    score += Math.min(assignedActions.length * 3, 10);
    score += Math.min(actionItems.length * 2, 10);
    if (sentiment?.sentiment === 'positive') score += 10;
    if (sentiment?.sentiment === 'negative') score -= 15;
    score -= Math.min((actionItems.length - assignedActions.length) * 2, 10);
    if (questionsAsked.length >= 2 && agreementsList.length >= 2) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C+' : score >= 50 ? 'C' : score >= 40 ? 'D+' : score >= 30 ? 'D' : 'F';

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (questionsAsked.length >= 2) strengths.push('Strong discovery - asked probing questions');
    if (agreementsList.length >= 1) strengths.push('Secured explicit agreement');
    if (assignedActions.length >= 3) strengths.push('Clear accountability with assigned actions');
    if (sentiment?.sentiment === 'positive') strengths.push('Maintained positive engagement');
    if (questionsAsked.length === 0) improvements.push('No discovery questions asked');
    if (agreementsList.length === 0) improvements.push('No explicit agreements reached');
    if (actionItems.length - assignedActions.length > 0) improvements.push(`${actionItems.length - assignedActions.length} action items without owners`);
    if (actionItems.length === 0) improvements.push('No next steps established');
    if (sentiment?.sentiment === 'negative') improvements.push('Conversation had negative sentiment');

    performanceData.push({
      id: tid,
      title: (rec.title as string) || 'Untitled Meeting',
      createdAt: rec.created_at,
      score,
      grade,
      metrics: {
        questionsAsked: questionsAsked.length,
        questions: questionsAsked.map((q: Record<string, unknown>) => q.title),
        agreements: agreementsList.length,
        agreementDetails: agreementsList.map((a: Record<string, unknown>) => a.title),
        totalActionItems: actionItems.length,
        assignedActionItems: assignedActions.length,
        unassignedActionItems: actionItems.length - assignedActions.length,
      },
      sentiment: sentiment?.sentiment || 'unknown',
      summary: (briefSummary as Record<string, unknown>)?.summary_text || '',
      strengths,
      improvements,
    });
  }

  performanceData.sort((a, b) => (b.score as number) - (a.score as number));

  const data = performanceData.map((p) => ({
    ...p,
    createdAt: p.createdAt instanceof Date ? (p.createdAt as Date).toISOString() : p.createdAt,
  }));

  return successResponse(data, req);
}
