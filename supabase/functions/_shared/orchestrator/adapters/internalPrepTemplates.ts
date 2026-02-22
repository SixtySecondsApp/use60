/**
 * Internal Meeting Prep Templates
 *
 * IMP-005: Generates type-specific meeting prep content for internal meetings.
 *
 * Supported meeting types:
 *   one_on_one      — pipeline changes since last 1:1, coaching points from
 *                     deal_risk_scores, wins and blockers to raise
 *   pipeline_review — full pipeline by stage, movement, forecast vs target
 *                     (uses calculate_pipeline_math RPC), risk summary
 *   qbr             — quarter performance, win/loss analysis, competitive
 *                     mentions, next-quarter projection
 *   standup         — personal update bullets, deals needing help, recent wins
 *
 * Each template returns a PrepContent object that downstream steps (IMP-006)
 * can render as a Slack message or in-app document.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { MeetingType, MeetingTypeClassification } from './meetingTypeClassifier.ts';

// =============================================================================
// Types
// =============================================================================

export interface PrepSection {
  title: string;
  body: string;        // Markdown-flavoured text
  data?: unknown;      // Optional structured data (tables, arrays) for rich rendering
}

export interface PrepContent {
  event_id: string;
  meeting_type: MeetingType;
  prep_title: string;
  generated_at: string;
  sections: PrepSection[];
  /** True when the prep is intentionally brief (standup/minimal detail level) */
  is_lightweight: boolean;
}

// =============================================================================
// Helpers: data fetchers
// =============================================================================

/**
 * Fetch deals owned by the user along with their stage and risk scores.
 * Returns active (open) deals ordered by value DESC.
 */
async function fetchUserDeals(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
  limit = 20,
) {
  const { data: deals } = await supabase
    .from('deals')
    .select(
      'id, name, value, stage_id, status, probability, expected_close_date, ' +
      'last_activity_at, created_at'
    )
    .eq('owner_id', userId)
    .eq('org_id', orgId)
    .not('status', 'in', '("won","lost")')
    .order('value', { ascending: false })
    .limit(limit);

  if (!deals || deals.length === 0) return { deals: [], riskByDeal: new Map<string, number>() };

  const dealIds = deals.map((d) => d.id);

  const { data: risks } = await supabase
    .from('deal_risk_scores')
    .select('deal_id, score, signals')
    .in('deal_id', dealIds);

  const riskByDeal = new Map<string, number>();
  for (const r of risks || []) {
    riskByDeal.set(r.deal_id, r.score as number);
  }

  return { deals, riskByDeal };
}

/**
 * Fetch the user's recently closed-won deals (last 30 days) as wins.
 */
async function fetchRecentWins(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
  daysSince = 30,
) {
  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('deals')
    .select('id, name, value, updated_at')
    .eq('owner_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'won')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(5);

  return data || [];
}

/**
 * Fetch activity counts for the user since a given date.
 * Used to summarise CRM activity for standups and 1:1s.
 */
async function fetchActivitySummary(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  since: string,
) {
  const { data } = await supabase
    .from('activities')
    .select('type')
    .eq('user_id', userId)
    .gte('created_at', since);

  const counts: Record<string, number> = {};
  for (const a of data || []) {
    const type = (a.type as string) || 'other';
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

// =============================================================================
// Template: 1:1
// =============================================================================

async function buildOneOnOnePrep(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
  eventTitle: string,
): Promise<PrepSection[]> {
  const sections: PrepSection[] = [];

  // 1. Pipeline changes since last 7 days
  const { deals, riskByDeal } = await fetchUserDeals(supabase, userId, orgId);
  const recentActivity = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentlyActive = deals.filter(
    (d) => d.last_activity_at && d.last_activity_at >= recentActivity
  );
  const stalled = deals.filter(
    (d) => !d.last_activity_at || d.last_activity_at < recentActivity
  );

  if (deals.length > 0) {
    const lines = deals.map((d) => {
      const risk = riskByDeal.get(d.id) ?? null;
      const riskTag = risk !== null ? ` [Risk: ${risk}/100]` : '';
      const value = d.value ? ` — $${Number(d.value).toLocaleString()}` : '';
      return `- **${d.name}**${value}${riskTag}`;
    });
    sections.push({
      title: 'Pipeline Overview',
      body: lines.join('\n'),
      data: deals.map((d) => ({
        name: d.name,
        value: d.value,
        risk_score: riskByDeal.get(d.id) ?? null,
        last_activity_at: d.last_activity_at,
        expected_close_date: d.expected_close_date,
      })),
    });
  }

  // 2. Coaching points — deals with elevated risk
  const riskDeals = deals
    .filter((d) => (riskByDeal.get(d.id) ?? 0) >= 60)
    .sort((a, b) => (riskByDeal.get(b.id) ?? 0) - (riskByDeal.get(a.id) ?? 0));

  if (riskDeals.length > 0) {
    const lines = riskDeals.map((d) => {
      const score = riskByDeal.get(d.id);
      return `- **${d.name}** (risk score ${score}/100) — review blockers and next step`;
    });
    sections.push({
      title: 'Coaching Points — Deals Needing Attention',
      body: lines.join('\n'),
    });
  }

  // 3. Wins since last 1:1 (last 7 days)
  const wins = await fetchRecentWins(supabase, userId, orgId, 7);
  if (wins.length > 0) {
    const lines = wins.map((w) => {
      const val = w.value ? ` ($${Number(w.value).toLocaleString()})` : '';
      return `- **${w.name}**${val} — closed ${new Date(w.updated_at).toLocaleDateString()}`;
    });
    sections.push({ title: 'Recent Wins', body: lines.join('\n') });
  } else {
    sections.push({ title: 'Recent Wins', body: '_No closed-won deals in the last 7 days._' });
  }

  // 4. Activity summary
  const activityCounts = await fetchActivitySummary(supabase, userId, recentActivity);
  const activityLines = Object.entries(activityCounts)
    .map(([type, count]) => `- ${count}× ${type}`)
    .sort();
  if (activityLines.length > 0) {
    sections.push({ title: 'Activity Last 7 Days', body: activityLines.join('\n') });
  }

  // 5. Blockers to raise
  const blockers: string[] = [];
  if (stalled.length > 0) {
    blockers.push(`${stalled.length} deal(s) with no activity in 7+ days`);
  }
  if (riskDeals.length > 0) {
    blockers.push(`${riskDeals.length} deal(s) with risk score ≥ 60 — may need coaching or resource`);
  }

  sections.push({
    title: 'Suggested Discussion Points',
    body: blockers.length > 0
      ? blockers.map((b) => `- ${b}`).join('\n')
      : '_No blockers identified — use this time for proactive coaching._',
  });

  return sections;
}

// =============================================================================
// Template: Pipeline Review
// =============================================================================

async function buildPipelineReviewPrep(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
): Promise<PrepSection[]> {
  const sections: PrepSection[] = [];

  // 1. Pipeline math (uses calculate_pipeline_math RPC from BRF-003)
  let pipelineMath: Record<string, unknown> | null = null;
  try {
    const { data, error } = await supabase.rpc('calculate_pipeline_math', {
      p_user_id: userId,
      p_org_id: orgId,
    });
    if (!error && data) {
      pipelineMath = data as Record<string, unknown>;
    }
  } catch {
    // Non-fatal — pipeline math is best-effort
  }

  if (pipelineMath) {
    const fmt = (v: unknown) =>
      v != null ? `$${Number(v).toLocaleString()}` : 'N/A';
    const pct = (v: unknown) =>
      v != null ? `${(Number(v) * 100).toFixed(1)}%` : 'N/A';

    const lines = [
      `**Target (period):** ${fmt(pipelineMath.target)}`,
      `**Closed so far:** ${fmt(pipelineMath.closed_so_far)} (${pct(pipelineMath.pct_to_target)} of target)`,
      `**Gap to target:** ${fmt(pipelineMath.gap_amount)}`,
      `**Weighted pipeline:** ${fmt(pipelineMath.weighted_pipeline)}`,
      `**Coverage ratio:** ${pipelineMath.coverage_ratio != null ? Number(pipelineMath.coverage_ratio).toFixed(2) + 'x' : 'N/A'}`,
      `**Deals at risk:** ${pipelineMath.deals_at_risk ?? 'N/A'}`,
    ];

    // CTI-010: Add calibrated forecast if available (PRD-21)
    let repCalibration: Record<string, unknown> | null = null;
    try {
      const { data: calibrationData } = await supabase.rpc('get_rep_calibration', {
        p_org_id: orgId,
        p_user_id: userId,
      });
      if (calibrationData && typeof calibrationData === 'object') {
        repCalibration = calibrationData as Record<string, unknown>;
      }
    } catch { /* non-fatal — calibration is best-effort */ }

    if (repCalibration && repCalibration.calibrated_pipeline != null) {
      lines.push('');
      lines.push(`**Calibrated forecast:** ${fmt(repCalibration.calibrated_pipeline)}`);
      if (repCalibration.overall_note) {
        lines.push(`_${repCalibration.overall_note}_`);
      }
      lines.push(`_Based on ${repCalibration.weeks_of_data || 4} weeks of history_`);
    }

    sections.push({
      title: 'Pipeline Math Summary',
      body: lines.join('\n'),
      data: { ...pipelineMath, rep_calibration: repCalibration },
    });

    // Deals by stage
    if (pipelineMath.deals_by_stage) {
      const byStage = pipelineMath.deals_by_stage as Record<string, { count: number; total_value: number }>;
      const stageLines = Object.entries(byStage).map(([stage, info]) =>
        `- **${stage}**: ${info.count} deal(s) — ${fmt(info.total_value)}`
      );
      if (stageLines.length > 0) {
        sections.push({
          title: 'Pipeline by Stage',
          body: stageLines.join('\n'),
          data: byStage,
        });
      }
    }
  } else {
    // Fallback: manual pipeline summary
    const { deals, riskByDeal } = await fetchUserDeals(supabase, userId, orgId, 25);
    if (deals.length > 0) {
      const lines = deals.map((d) => {
        const risk = riskByDeal.get(d.id) ?? null;
        const riskTag = risk !== null && risk >= 60 ? ` ⚠ Risk: ${risk}` : '';
        return `- **${d.name}** — $${Number(d.value || 0).toLocaleString()}${riskTag}`;
      });
      sections.push({ title: 'Open Deals', body: lines.join('\n'), data: deals });
    }
  }

  // 2. Risk summary
  const { deals, riskByDeal } = await fetchUserDeals(supabase, userId, orgId, 25);
  const atRisk = deals.filter((d) => (riskByDeal.get(d.id) ?? 0) >= 60);
  if (atRisk.length > 0) {
    const lines = atRisk.map((d) =>
      `- **${d.name}** (risk ${riskByDeal.get(d.id)}/100) — close date: ${d.expected_close_date ?? 'unset'}`
    );
    sections.push({ title: 'Deals at Risk — Review Required', body: lines.join('\n') });
  } else {
    sections.push({ title: 'Deals at Risk', body: '_No deals currently flagged as high risk._' });
  }

  // 3. Wins (last 30 days)
  const wins = await fetchRecentWins(supabase, userId, orgId, 30);
  const winsBody = wins.length > 0
    ? wins.map((w) => `- **${w.name}** ($${Number(w.value || 0).toLocaleString()}) — ${new Date(w.updated_at).toLocaleDateString()}`).join('\n')
    : '_No closed-won deals in the last 30 days._';
  sections.push({ title: 'Recent Wins (last 30 days)', body: winsBody });

  // 4. Discussion agenda
  sections.push({
    title: 'Suggested Agenda',
    body: [
      '1. Pipeline math review — coverage ratio and gap',
      '2. Stage movement — what progressed or slipped this week',
      '3. At-risk deals — action plans',
      '4. Wins — lessons learned and replicable patterns',
      '5. Forecast commitment for the period',
    ].join('\n'),
  });

  return sections;
}

// =============================================================================
// Template: QBR
// =============================================================================

async function buildQBRPrep(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
): Promise<PrepSection[]> {
  const sections: PrepSection[] = [];

  // Quarter dates (Jan 1 - Mar 31 for Q1, etc.)
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);

  // 1. Quarter performance — closed deals
  const { data: closedDeals } = await supabase
    .from('deals')
    .select('id, name, value, status, updated_at')
    .eq('owner_id', userId)
    .eq('org_id', orgId)
    .in('status', ['won', 'lost'])
    .gte('updated_at', quarterStart.toISOString())
    .order('updated_at', { ascending: false });

  const wonDeals = (closedDeals || []).filter((d) => d.status === 'won');
  const lostDeals = (closedDeals || []).filter((d) => d.status === 'lost');
  const wonRevenue = wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const lostRevenue = lostDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

  sections.push({
    title: `Quarter Performance — Q${quarter + 1} ${now.getFullYear()}`,
    body: [
      `**Closed Won:** ${wonDeals.length} deals — $${wonRevenue.toLocaleString()}`,
      `**Closed Lost:** ${lostDeals.length} deals — $${lostRevenue.toLocaleString()}`,
      `**Win Rate:** ${closedDeals?.length ? ((wonDeals.length / closedDeals.length) * 100).toFixed(1) + '%' : 'N/A'}`,
    ].join('\n'),
    data: { won: wonDeals, lost: lostDeals, won_revenue: wonRevenue, lost_revenue: lostRevenue },
  });

  // 2. Win/loss analysis
  if (closedDeals && closedDeals.length > 0) {
    const wonLines = wonDeals.slice(0, 5).map((d) =>
      `- **${d.name}** — $${Number(d.value || 0).toLocaleString()}`
    );
    const lostLines = lostDeals.slice(0, 5).map((d) =>
      `- **${d.name}** — $${Number(d.value || 0).toLocaleString()}`
    );
    sections.push({
      title: 'Win / Loss Breakdown',
      body: [
        '**Wins:**',
        wonLines.length > 0 ? wonLines.join('\n') : '_None this quarter_',
        '',
        '**Losses:**',
        lostLines.length > 0 ? lostLines.join('\n') : '_None this quarter_',
      ].join('\n'),
    });
  }

  // 3. Competitive mentions — from activities with type='competitive_mention'
  const { data: compActivities } = await supabase
    .from('activities')
    .select('description, created_at')
    .eq('user_id', userId)
    .eq('type', 'competitive_mention')
    .gte('created_at', quarterStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (compActivities && compActivities.length > 0) {
    const lines = compActivities.map((a) =>
      `- ${new Date(a.created_at).toLocaleDateString()}: ${a.description || 'competitive mention logged'}`
    );
    sections.push({ title: 'Competitive Mentions This Quarter', body: lines.join('\n') });
  } else {
    sections.push({
      title: 'Competitive Mentions',
      body: '_No competitive mentions logged this quarter._',
    });
  }

  // 4. Pipeline math for forward-looking projection
  let nextQProjection = '_Pipeline math RPC unavailable — calculate manually._';
  try {
    const { data, error } = await supabase.rpc('calculate_pipeline_math', {
      p_user_id: userId,
      p_org_id: orgId,
    });
    if (!error && data) {
      const pm = data as Record<string, unknown>;
      const projLines = [
        `**Current open pipeline:** $${Number(pm.total_pipeline || 0).toLocaleString()}`,
        `**Weighted pipeline:** $${Number(pm.weighted_pipeline || 0).toLocaleString()}`,
        `**Coverage ratio:** ${pm.coverage_ratio != null ? Number(pm.coverage_ratio).toFixed(2) + 'x' : 'N/A'}`,
        `**Projected close:** $${Number(pm.projected_close || 0).toLocaleString()}`,
      ];

      // CTI-010: Add calibrated forecast to QBR projection (PRD-21)
      try {
        const { data: calData } = await supabase.rpc('get_rep_calibration', {
          p_org_id: orgId,
          p_user_id: userId,
        });
        if (calData && typeof calData === 'object' && (calData as any).calibrated_pipeline != null) {
          projLines.push(`**Calibrated forecast:** $${Number((calData as any).calibrated_pipeline).toLocaleString()}`);
          if ((calData as any).overall_note) {
            projLines.push(`_${(calData as any).overall_note}_`);
          }
        }
      } catch { /* non-fatal */ }

      nextQProjection = projLines.join('\n');
    }
  } catch { /* non-fatal */ }

  sections.push({ title: 'Next Quarter Projection', body: nextQProjection });

  // 5. QBR agenda
  sections.push({
    title: 'Suggested QBR Agenda',
    body: [
      `1. Q${quarter + 1} performance recap — revenue vs target`,
      '2. Win/loss analysis — patterns and learnings',
      '3. Competitive landscape update',
      '4. Pipeline health for next quarter',
      '5. Goals and initiatives for next quarter',
      '6. Resource asks and blockers',
    ].join('\n'),
  });

  return sections;
}

// =============================================================================
// Template: Standup
// =============================================================================

async function buildStandupPrep(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
): Promise<PrepSection[]> {
  const sections: PrepSection[] = [];

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Personal update — activity last 24h
  const activityCounts = await fetchActivitySummary(supabase, userId, since24h);
  const activityBody = Object.keys(activityCounts).length > 0
    ? Object.entries(activityCounts).map(([type, count]) => `- ${count}× ${type}`).join('\n')
    : '_No CRM activity logged in the last 24 hours._';
  sections.push({ title: 'Yesterday / Since Last Standup', body: activityBody });

  // 2. Deals needing help — risk score ≥ 70
  const { deals, riskByDeal } = await fetchUserDeals(supabase, userId, orgId, 20);
  const needHelp = deals
    .filter((d) => (riskByDeal.get(d.id) ?? 0) >= 70)
    .slice(0, 3);

  const helpBody = needHelp.length > 0
    ? needHelp.map((d) => `- **${d.name}** — risk ${riskByDeal.get(d.id)}/100`).join('\n')
    : '_No deals currently flagged as critical risk._';
  sections.push({ title: 'Deals Needing Help', body: helpBody });

  // 3. Wins since last standup (last 24h)
  const wins = await fetchRecentWins(supabase, userId, orgId, 1);
  const winsBody = wins.length > 0
    ? wins.map((w) => `- **${w.name}** ($${Number(w.value || 0).toLocaleString()})`).join('\n')
    : '_No new wins to share._';
  sections.push({ title: 'Wins', body: winsBody });

  // 4. Today's focus — top 3 active deals
  const topDeals = deals.slice(0, 3);
  const focusBody = topDeals.length > 0
    ? topDeals.map((d) => `- **${d.name}** — next step: review and advance`).join('\n')
    : '_No open deals — focus on prospecting._';
  sections.push({ title: "Today's Focus", body: focusBody });

  return sections;
}

// =============================================================================
// Main function: generateInternalPrep
// =============================================================================

/**
 * Generate type-specific prep content for an internal calendar event.
 *
 * @param supabase    - Service-role Supabase client
 * @param userId      - The rep/user UUID
 * @param orgId       - The org UUID string
 * @param event       - Minimal event row (id, title)
 * @param meetingType - The classified meeting type
 *
 * @returns PrepContent with sections ready for rendering
 */
export async function generateInternalPrep(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  orgId: string,
  event: { id: string; title: string | null },
  meetingType: MeetingType,
): Promise<PrepContent> {
  const title = event.title || 'Untitled Meeting';
  let sections: PrepSection[] = [];
  let isLightweight = false;

  switch (meetingType) {
    case 'one_on_one':
      sections = await buildOneOnOnePrep(supabase, userId, orgId, title);
      break;

    case 'pipeline_review':
      sections = await buildPipelineReviewPrep(supabase, userId, orgId);
      break;

    case 'qbr':
      sections = await buildQBRPrep(supabase, userId, orgId);
      break;

    case 'standup':
      sections = await buildStandupPrep(supabase, userId, orgId);
      isLightweight = true;
      break;

    case 'external':
    case 'other':
    default:
      // No internal prep for external meetings or unknown types
      sections = [
        {
          title: 'Note',
          body: '_This meeting type does not have a specialised internal prep template. ' +
                'Use the standard external meeting briefing instead._',
        },
      ];
      isLightweight = true;
      break;
  }

  return {
    event_id: event.id,
    meeting_type: meetingType,
    prep_title: `Internal Prep — ${title}`,
    generated_at: new Date().toISOString(),
    sections,
    is_lightweight: isLightweight,
  };
}

// =============================================================================
// Adapter: generate-internal-prep
//
// Reads classified events from the previous step's output, generates
// type-specific prep for each, and surfaces results in step output.
//
// Expected previous step output: 'classify-meeting-types' with `classifications`
// =============================================================================

export const internalPrepTemplatesAdapter: SkillAdapter = {
  name: 'generate-internal-prep',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[internal-prep-templates] Starting prep generation...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const userId = state.event.user_id;

      if (!orgId || !userId) {
        throw new Error('org_id and user_id are required in event payload');
      }

      // Read classifications from previous step
      type ClassifierOutput = { classifications?: MeetingTypeClassification[]; events_classified?: number };
      const classifierOutput = state.outputs['classify-meeting-types'] as ClassifierOutput | undefined;
      const classifications: MeetingTypeClassification[] = classifierOutput?.classifications || [];

      if (classifications.length === 0) {
        console.log('[internal-prep-templates] No classified events to prep for');
        return {
          success: true,
          output: {
            events_prepped: 0,
            prep_documents: [],
          },
          duration_ms: Date.now() - start,
        };
      }

      // Filter to actionable internal meeting types
      const actionableTypes: MeetingType[] = ['one_on_one', 'pipeline_review', 'qbr', 'standup'];
      const actionable = classifications.filter((c) => actionableTypes.includes(c.meeting_type));

      if (actionable.length === 0) {
        console.log('[internal-prep-templates] No actionable internal meeting types after filtering');
        return {
          success: true,
          output: {
            events_prepped: 0,
            prep_documents: [],
          },
          duration_ms: Date.now() - start,
        };
      }

      // Fetch event titles for prep header
      const eventIds = actionable.map((c) => c.event_id);
      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, title')
        .in('id', eventIds);

      const eventById = new Map<string, { id: string; title: string | null }>();
      for (const e of events || []) {
        eventById.set(e.id, e as { id: string; title: string | null });
      }

      // Generate prep for each classified event
      const prepDocuments: PrepContent[] = [];

      for (const classification of actionable) {
        const event = eventById.get(classification.event_id) || {
          id: classification.event_id,
          title: null,
        };

        console.log(
          `[internal-prep-templates] Generating ${classification.meeting_type} prep for event ${event.id}...`
        );

        const prep = await generateInternalPrep(
          supabase,
          userId,
          orgId,
          event,
          classification.meeting_type,
        );
        prepDocuments.push(prep);

        console.log(
          `[internal-prep-templates] Generated ${classification.meeting_type} prep: ` +
          `${prep.sections.length} section(s) — lightweight=${prep.is_lightweight}`
        );
      }

      console.log(
        `[internal-prep-templates] Complete: ${prepDocuments.length} prep documents generated`
      );

      return {
        success: true,
        output: {
          events_prepped: prepDocuments.length,
          prep_documents: prepDocuments,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[internal-prep-templates] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
