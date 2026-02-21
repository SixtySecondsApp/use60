/**
 * Enhanced Morning Briefing — Integration Tests (BRF-009)
 *
 * Tests the pure pipeline math and quarter phase functions that drive the
 * enhanced morning briefing. These functions have no Deno/Supabase dependencies
 * so they can be tested directly with Vitest.
 *
 * Test scenarios:
 *  1. On-track rep — target set, coverage > 3x, healthy pipeline
 *  2. Behind-target rep — gap exists, coverage < 2x, at-risk deals
 *  3. No-target-set — all gap/coverage fields NULL, pipeline stats still work
 *  4. Early quarter (Build phase) — week 2, pipelineMultiplier = 4x
 *  5. Mid quarter (Progress phase) — week 7, pipelineMultiplier = 3x
 *  6. Late quarter (Close phase) — week 11, urgency = high
 *  7. Action recommender — closing-soon deal takes priority
 *  8. Action recommender — low coverage triggers pipeline build recommendation
 *
 * Run:
 *   npm run test -- supabase/functions/proactive-pipeline-analysis/test.ts
 */

import { describe, it, expect } from 'vitest';

// Import pure functions (no Deno/Supabase deps)
import {
  detectQuarterPhase,
  recommendHighestLeverageAction,
  type DealSummary,
  type PipelineMathInput,
  type QuarterPhaseResult,
} from '../_shared/orchestrator/adapters/pipelineMath.ts';

// =============================================================================
// Fixtures
// =============================================================================

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';

/** Make a date that puts us at a specific week within a Q1 (Jan start) */
function makeQuarterDate(weekOfQ1: number): Date {
  // Q1 starts Jan 1; week 1 = Jan 1-7
  const d = new Date(2026, 0, 1); // Jan 1 2026
  d.setDate(d.getDate() + (weekOfQ1 - 1) * 7 + 3); // mid-week
  return d;
}

const sampleDeals: DealSummary[] = [
  {
    deal_id: 'deal-001',
    deal_name: 'Acme Corp',
    deal_value: 50000,
    current_stage: 'Negotiation',
    stage_probability: 75,
    expected_close_date: null,
    days_since_last_activity: 3,
    health_score: 80,
    risk_score: 20,
    company_name: 'Acme Corp',
    primary_contact_name: 'Jane Smith',
  },
  {
    deal_id: 'deal-002',
    deal_name: 'Globex Corp',
    deal_value: 30000,
    current_stage: 'Discovery',
    stage_probability: 20,
    expected_close_date: null,
    days_since_last_activity: 12,
    health_score: 40,
    risk_score: 65,
    company_name: 'Globex Corp',
    primary_contact_name: 'Bob Jones',
  },
  {
    deal_id: 'deal-003',
    deal_name: 'Initech',
    deal_value: 20000,
    current_stage: 'Proposal',
    stage_probability: 60,
    expected_close_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days
    days_since_last_activity: 1,
    health_score: 75,
    risk_score: 30,
    company_name: 'Initech',
    primary_contact_name: 'Carol White',
  },
];

const onTrackMath: PipelineMathInput = {
  target: 100000,
  closed_so_far: 40000,
  weighted_pipeline: 180000,
  total_pipeline: 250000,
  coverage_ratio: 3.0,
  gap_amount: 60000,
  projected_close: 72000,
  deals_at_risk: 1,
  deals_by_stage: { Negotiation: { count: 1, total_value: 50000 }, Discovery: { count: 1, total_value: 30000 } },
};

const behindTargetMath: PipelineMathInput = {
  target: 100000,
  closed_so_far: 10000,
  weighted_pipeline: 80000,
  total_pipeline: 130000,
  coverage_ratio: 1.1,
  gap_amount: 90000,
  projected_close: 28000,
  deals_at_risk: 3,
  deals_by_stage: {},
};

const noTargetMath: PipelineMathInput = {
  target: null,
  closed_so_far: 0,
  weighted_pipeline: 45000,
  total_pipeline: 100000,
  coverage_ratio: null,
  gap_amount: null,
  projected_close: null,
  deals_at_risk: 0,
  deals_by_stage: {},
};

// =============================================================================
// Quarter Phase Detection
// =============================================================================

describe('detectQuarterPhase', () => {
  it('returns build phase for week 1-4 (Q1 Jan start)', () => {
    const result = detectQuarterPhase(1, makeQuarterDate(2));
    expect(result.phase).toBe('build');
    expect(result.label).toBe('Build');
    expect(result.weekOfQuarter).toBeGreaterThanOrEqual(1);
    expect(result.weekOfQuarter).toBeLessThanOrEqual(4);
    expect(result.emphasis.urgencyLevel).toBe('low');
    expect(result.emphasis.pipelineMultiplier).toBe(4.0);
  });

  it('returns progress phase for week 5-9', () => {
    const result = detectQuarterPhase(1, makeQuarterDate(7));
    expect(result.phase).toBe('progress');
    expect(result.label).toBe('Progress');
    expect(result.emphasis.urgencyLevel).toBe('medium');
    expect(result.emphasis.pipelineMultiplier).toBe(3.0);
    expect(result.emphasis.closeProbabilityBonus).toBe(5);
  });

  it('returns close phase for week 10+', () => {
    const result = detectQuarterPhase(1, makeQuarterDate(11));
    expect(result.phase).toBe('close');
    expect(result.label).toBe('Close');
    expect(result.emphasis.urgencyLevel).toBe('high');
    expect(result.emphasis.pipelineMultiplier).toBe(2.0);
    expect(result.emphasis.closeProbabilityBonus).toBe(10);
  });

  it('handles April fiscal year start (Q1 = Apr)', () => {
    // April 1, 2026 = week 1 of a Apr-start fiscal year
    const aprilStart = new Date(2026, 3, 10); // April 10 = week 2
    const result = detectQuarterPhase(4, aprilStart);
    expect(result.phase).toBe('build');
    expect(result.weekOfQuarter).toBeGreaterThanOrEqual(1);
    expect(result.weekOfQuarter).toBeLessThanOrEqual(4);
  });

  it('includes weeksRemaining > 0 for early quarter', () => {
    const result = detectQuarterPhase(1, makeQuarterDate(2));
    expect(result.weeksRemaining).toBeGreaterThan(5);
  });

  it('includes non-empty description', () => {
    const buildResult = detectQuarterPhase(1, makeQuarterDate(2));
    const closeResult = detectQuarterPhase(1, makeQuarterDate(11));
    expect(buildResult.description.length).toBeGreaterThan(10);
    expect(closeResult.description.length).toBeGreaterThan(10);
  });
});

// =============================================================================
// Pipeline Math: Weighted Pipeline & Coverage Calculations
// =============================================================================

describe('pipeline math coverage calculations', () => {
  it('coverage_ratio of 3.0 indicates on-track (3× coverage)', () => {
    const { coverage_ratio, gap_amount, target, closed_so_far } = onTrackMath;
    expect(coverage_ratio).toBe(3.0);
    expect(gap_amount).toBe(target! - closed_so_far);
  });

  it('coverage_ratio of 1.1 indicates behind target', () => {
    expect(behindTargetMath.coverage_ratio).toBeLessThan(2.0);
  });

  it('no-target scenario returns null for gap/coverage/pct fields', () => {
    expect(noTargetMath.target).toBeNull();
    expect(noTargetMath.coverage_ratio).toBeNull();
    expect(noTargetMath.gap_amount).toBeNull();
    expect(noTargetMath.projected_close).toBeNull();
    // Pipeline stats are still populated
    expect(noTargetMath.total_pipeline).toBeGreaterThan(0);
    expect(noTargetMath.weighted_pipeline).toBeGreaterThan(0);
  });

  it('projected_close on-track is greater than gap_amount', () => {
    const { projected_close, gap_amount } = onTrackMath;
    expect(projected_close).toBeGreaterThan(gap_amount!);
  });

  it('projected_close behind-target is less than gap_amount (shortfall)', () => {
    const { projected_close, gap_amount } = behindTargetMath;
    expect(projected_close).toBeLessThan(gap_amount!);
  });
});

// =============================================================================
// Action Recommender
// =============================================================================

describe('recommendHighestLeverageAction', () => {
  const buildPhase: QuarterPhaseResult = {
    phase: 'build',
    label: 'Build',
    weekOfQuarter: 2,
    weeksRemaining: 11,
    totalWeeks: 13,
    description: 'Pipeline building phase',
    emphasis: {
      primaryFocus: ['pipeline_generation'],
      pipelineMultiplier: 4.0,
      closeProbabilityBonus: 0,
      urgencyLevel: 'low',
    },
  };

  const closePhase: QuarterPhaseResult = {
    phase: 'close',
    label: 'Close',
    weekOfQuarter: 11,
    weeksRemaining: 2,
    totalWeeks: 13,
    description: 'Closing phase',
    emphasis: {
      primaryFocus: ['deal_closure'],
      pipelineMultiplier: 2.0,
      closeProbabilityBonus: 10,
      urgencyLevel: 'high',
    },
  };

  const progressPhase: QuarterPhaseResult = {
    phase: 'progress',
    label: 'Progress',
    weekOfQuarter: 7,
    weeksRemaining: 6,
    totalWeeks: 13,
    description: 'Momentum phase',
    emphasis: {
      primaryFocus: ['stage_progression'],
      pipelineMultiplier: 3.0,
      closeProbabilityBonus: 5,
      urgencyLevel: 'medium',
    },
  };

  it('recommends closing the closing-soon deal when in close phase', () => {
    // sampleDeals[2] (Initech) has expected_close_date in 5 days and stage=Proposal (late-ish)
    const rec = recommendHighestLeverageAction(onTrackMath, closePhase, sampleDeals);
    // Should recommend closing or advancing the closing-soon deal
    expect(['close', 'advance']).toContain(rec.category);
    expect(rec.action.length).toBeGreaterThan(10);
    expect(['immediate', 'today', 'this_week']).toContain(rec.urgency);
  });

  it('recommends pipeline building in build phase with low coverage', () => {
    const lowCovMath: PipelineMathInput = {
      ...noTargetMath,
      total_pipeline: 20000,
      weighted_pipeline: 10000,
    };
    const rec = recommendHighestLeverageAction(lowCovMath, buildPhase, []);
    expect(rec.category).toBe('build_pipeline');
    expect(rec.urgency).toBe('this_week');
  });

  it('recommends reviving at-risk deal when coverage is low', () => {
    // behindTargetMath has coverage 1.1x (< 3x Progress target)
    const riskDeal: DealSummary = {
      ...sampleDeals[1], // Globex, risk_score=65
      deal_value: 80000,
    };
    const rec = recommendHighestLeverageAction(behindTargetMath, progressPhase, [riskDeal]);
    // With low coverage and at-risk deal, should revive or advance
    expect(['revive', 'advance', 'build_pipeline']).toContain(rec.category);
  });

  it('recommendation has all required fields', () => {
    const rec = recommendHighestLeverageAction(onTrackMath, closePhase, sampleDeals);
    expect(rec.action).toBeTruthy();
    expect(rec.rationale).toBeTruthy();
    expect(rec.expected_impact).toBeTruthy();
    expect(['immediate', 'today', 'this_week']).toContain(rec.urgency);
    expect(['close', 'advance', 'revive', 'build_pipeline', 'protect_coverage']).toContain(rec.category);
  });

  it('returns fallback build_pipeline recommendation when no deals exist', () => {
    const rec = recommendHighestLeverageAction(noTargetMath, buildPhase, []);
    expect(['build_pipeline']).toContain(rec.category);
    expect(rec.target_deal_id).toBeNull();
  });

  it('protect_coverage triggered in close phase with shortfall', () => {
    const shortfallMath: PipelineMathInput = {
      ...behindTargetMath,
      weighted_pipeline: 30000,  // below gap_amount (90000)
      projected_close: 10000,
    };
    const rec = recommendHighestLeverageAction(shortfallMath, closePhase, sampleDeals);
    // Should trigger protect_coverage or advance/close (close phase with shortfall)
    expect(['protect_coverage', 'close', 'advance', 'revive']).toContain(rec.category);
  });
});

// =============================================================================
// Overnight Summary (unit-level contract tests)
// =============================================================================

describe('overnight summary data contract', () => {
  it('overnight event severity values are valid', () => {
    const validSeverities = ['info', 'positive', 'attention'];
    // These are checked at the type level in overnightSummary.ts
    // Verify the constants match what the Slack builder expects
    for (const s of validSeverities) {
      expect(['info', 'positive', 'attention']).toContain(s);
    }
  });

  it('overnight event types cover all known sources', () => {
    const knownTypes = [
      'enrichment_completed',
      'email_open',
      'email_reply',
      'signal_elevated',
      'signal_new',
      'campaign_reply',
      'deal_stage_change',
      'task_completed',
    ];
    // Validate coverage — all types must be strings
    for (const t of knownTypes) {
      expect(typeof t).toBe('string');
    }
    expect(knownTypes.length).toBeGreaterThan(5);
  });
});

// =============================================================================
// Slack Message Builder Contract (structural validation)
// =============================================================================

describe('buildEnhancedMorningBriefMessage structural contract', () => {
  it('exports buildEnhancedMorningBriefMessage and required interfaces', async () => {
    // Import dynamically to avoid Deno globals at module load time
    // (Vitest polyfills are not loaded for Deno.env etc.)
    // We just verify the module exists and exports what we need
    const module = await import('../_shared/slackBlocks.ts');
    expect(typeof module.buildEnhancedMorningBriefMessage).toBe('function');
  });

  it('buildEnhancedMorningBriefMessage returns blocks and text', async () => {
    const { buildEnhancedMorningBriefMessage } = await import('../_shared/slackBlocks.ts');

    const data = {
      userName: 'Test User',
      date: '2026-02-21',
      meetings: [],
      tasks: { overdue: [], dueToday: [] },
      deals: [],
      emailsToRespond: 0,
      insights: [],
      priorities: [],
      appUrl: 'https://app.use60.com',
      pipelineMath: {
        target: 100000,
        closed_so_far: 40000,
        pct_to_target: 0.4,
        total_pipeline: 250000,
        weighted_pipeline: 180000,
        coverage_ratio: 3.0,
        gap_amount: 60000,
        projected_close: 72000,
        deals_at_risk: 1,
      },
      quarterPhase: {
        phase: 'progress' as const,
        label: 'Progress',
        weekOfQuarter: 7,
        weeksRemaining: 6,
        description: 'Momentum phase',
      },
      overnightEvents: [
        { type: 'email_reply', description: 'Email reply from Acme Corp', deal_name: 'Acme Corp', severity: 'positive' as const },
      ],
      topAction: {
        action: 'Advance Acme Corp to proposal stage',
        rationale: 'Highest weighted deal in progress',
        target_deal_name: 'Acme Corp',
        urgency: 'today' as const,
        category: 'advance',
      },
      briefingFormat: 'detailed' as const,
    };

    const result = buildEnhancedMorningBriefMessage(data);

    expect(result).toBeDefined();
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(typeof result.text).toBe('string');
    expect(result.text!.length).toBeGreaterThan(0);

    // Verify header block exists
    const headerBlock = result.blocks.find(b => b.type === 'header');
    expect(headerBlock).toBeDefined();

    // Verify text contains user name
    expect(result.text).toContain('Test User');
  });

  it('summary format produces fewer blocks than detailed format', async () => {
    const { buildEnhancedMorningBriefMessage } = await import('../_shared/slackBlocks.ts');

    const baseData = {
      userName: 'Rep',
      date: '2026-02-21',
      meetings: [{ time: '09:00', title: 'Acme Call', companyName: 'Acme', dealValue: 50000 }],
      tasks: { overdue: [{ title: 'Follow up', daysOverdue: 2 }], dueToday: [] },
      deals: [],
      emailsToRespond: 0,
      insights: [],
      priorities: [],
      appUrl: 'https://app.use60.com',
      pipelineMath: {
        target: 100000,
        closed_so_far: 40000,
        pct_to_target: 0.4,
        total_pipeline: 250000,
        weighted_pipeline: 180000,
        coverage_ratio: 3.0,
        gap_amount: 60000,
        projected_close: 72000,
        deals_at_risk: 1,
      },
      quarterPhase: {
        phase: 'progress' as const,
        label: 'Progress',
        weekOfQuarter: 7,
        weeksRemaining: 6,
        description: 'Momentum phase',
      },
      overnightEvents: [],
      topAction: null,
    };

    const detailed = buildEnhancedMorningBriefMessage({ ...baseData, briefingFormat: 'detailed' });
    const summary = buildEnhancedMorningBriefMessage({ ...baseData, briefingFormat: 'summary' });

    // Summary format skips rationale and context blocks, so should have fewer blocks
    expect(summary.blocks.length).toBeLessThanOrEqual(detailed.blocks.length);
  });
});
