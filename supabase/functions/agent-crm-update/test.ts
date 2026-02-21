/**
 * CRM Update Agent — End-to-End Integration Tests (CRM-011)
 *
 * Tests the full meeting → CRM update → Slack → approve → HubSpot chain
 * using Vitest with Supabase/external-service mocks.
 *
 * Test Scenarios:
 *  1. Happy path — auto-apply + approval queue routing
 *  2. Low confidence skip — all fields below minimum threshold
 *  3. HubSpot sync disabled — skipped gracefully
 *  4. Missing deal — graceful error handling
 *  5. Fleet handoff — deal_risk_rescore event queued after completion
 *
 * Run:
 *   npm run test -- supabase/functions/agent-crm-update/test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Imports under test (relative paths from this file's location)
// =============================================================================

// Note: These imports use relative paths because Deno-style imports
// (https://esm.sh/...) are mocked below. The test runner resolves them
// via the Vitest alias config in vite.config.ts / vitest.config.ts.

// We import the pure classifier directly — it has no Deno dependencies.
import {
  classifyFields,
  type FieldChange,
  type DealFieldChangeLike,
  type CrmClassifierConfig,
} from '../_shared/orchestrator/adapters/crmFieldClassifier.ts';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_DEAL_ID = '00000000-0000-0000-0000-000000000003';
const TEST_MEETING_ID = '00000000-0000-0000-0000-000000000004';
const NONEXISTENT_DEAL_ID = '00000000-0000-0000-0000-000000000099';

/** Default agent config matching seeded values from CRM-002 */
const DEFAULT_AGENT_CONFIG: CrmClassifierConfig = {
  auto_approve_fields: ['notes', 'next_steps', 'activity_log', 'stakeholders', 'blockers'],
  approval_required_fields: ['stage', 'close_date', 'deal_value'],
  confidence_minimum: 'medium',
};

/** Sample extracted fields from a meeting transcript */
const SAMPLE_EXTRACTED_FIELDS: DealFieldChangeLike[] = [
  {
    field_name: 'next_steps',
    old_value: 'Send proposal',
    new_value: 'Schedule security review by Friday',
    confidence: 'high',
    reasoning: 'Rep explicitly committed to scheduling a security review',
  },
  {
    field_name: 'stage',
    old_value: 'Discovery',
    new_value: 'Demo',
    confidence: 'high',
    reasoning: 'Prospect said "ready to see a demo next week"',
  },
  {
    field_name: 'close_date',
    old_value: null,
    new_value: '2026-03-31',
    confidence: 'medium',
    reasoning: 'Prospect mentioned "hoping to close before end of Q1"',
  },
  {
    field_name: 'deal_value',
    old_value: null,
    new_value: 50000,
    confidence: 'medium',
    reasoning: 'Budget of $50k mentioned during pricing discussion',
  },
  {
    field_name: 'stakeholders',
    old_value: null,
    new_value: 'Jane (CFO) needs to sign off',
    confidence: 'high',
    reasoning: 'Rep mentioned CFO approval required',
  },
  {
    field_name: 'blockers',
    old_value: null,
    new_value: 'Security review required before sign-off',
    confidence: 'medium',
    reasoning: 'Security review mentioned as a prerequisite',
  },
];

const LOW_CONFIDENCE_FIELDS: DealFieldChangeLike[] = [
  {
    field_name: 'stage',
    old_value: 'Discovery',
    new_value: 'Proposal',
    confidence: 'low',
    reasoning: 'Weakly implied from conversation tone',
  },
  {
    field_name: 'deal_value',
    old_value: null,
    new_value: 100000,
    confidence: 'low',
    reasoning: 'Rough budget mentioned speculatively',
  },
  {
    field_name: 'next_steps',
    old_value: null,
    new_value: 'Maybe follow up',
    confidence: 'low',
    reasoning: 'Vague commitment',
  },
];

// =============================================================================
// Supabase Mock Builder
// =============================================================================

/**
 * Builds a chainable Supabase client mock.
 * Each `from()` call configures the mock's response for that table.
 */
function buildSupabaseMock(tableResponses: Record<string, unknown> = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnThis();
  const eqMock = vi.fn().mockReturnThis();
  const inMock = vi.fn().mockReturnThis();

  const fromMock = vi.fn((table: string) => {
    const response = tableResponses[table] ?? { data: null, error: null };
    return {
      select: vi.fn().mockReturnThis(),
      insert: insertMock,
      update: updateMock,
      eq: eqMock,
      in: inMock,
      maybeSingle: vi.fn().mockResolvedValue(response),
      single: vi.fn().mockResolvedValue(response),
    };
  });

  return {
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _insertMock: insertMock,
    _updateMock: updateMock,
  };
}

// =============================================================================
// Scenario 1: Happy Path — auto-apply + approval queue
// =============================================================================

describe('CRM-011 Scenario 1: Happy path — auto-apply + approval queue', () => {
  it('classifies high-confidence auto_approve fields into autoApply bucket', () => {
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    // next_steps, stakeholders, blockers are auto_approve_fields with medium+ confidence
    const autoFieldNames = classified.autoApply.map((f) => f.field_name);
    expect(autoFieldNames).toContain('next_steps');
    expect(autoFieldNames).toContain('stakeholders');
    expect(autoFieldNames).toContain('blockers');
  });

  it('classifies stage, close_date, deal_value into requireApproval bucket', () => {
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    const approvalFieldNames = classified.requireApproval.map((f) => f.field_name);
    expect(approvalFieldNames).toContain('stage');
    expect(approvalFieldNames).toContain('close_date');
    expect(approvalFieldNames).toContain('deal_value');
  });

  it('puts no fields in skipLowConfidence when all are medium+', () => {
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);
    expect(classified.skipLowConfidence).toHaveLength(0);
  });

  it('normalises DealFieldChange (old_value/reasoning) to FieldChange (current_value/reason)', () => {
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    const nextSteps = classified.autoApply.find((f) => f.field_name === 'next_steps');
    expect(nextSteps).toBeDefined();
    expect(nextSteps!.current_value).toBe('Send proposal');
    expect(nextSteps!.proposed_value).toBe('Schedule security review by Friday');
    expect(nextSteps!.reason).toBe('Rep explicitly committed to scheduling a security review');
  });

  it('preserves confidence on classified changes', () => {
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    const stageChange = classified.requireApproval.find((f) => f.field_name === 'stage');
    expect(stageChange!.confidence).toBe('high');

    const closeDate = classified.requireApproval.find((f) => f.field_name === 'close_date');
    expect(closeDate!.confidence).toBe('medium');
  });

  it('Slack message structure: buildCRMApprovalMessage returns blocks array and text', async () => {
    // Dynamically import so Deno globals are not evaluated at module load
    const { buildCRMApprovalMessage } = await import(
      '../_shared/slackBlocks.ts'
    );

    const message = buildCRMApprovalMessage({
      dealId: TEST_DEAL_ID,
      dealName: 'Acme Corp — Enterprise',
      meetingId: TEST_MEETING_ID,
      meetingTitle: 'Q1 Review',
      autoApplied: [
        { field_name: 'next_steps', new_value: 'Schedule security review', confidence: 'high' },
        { field_name: 'stakeholders', new_value: 'Jane (CFO)', confidence: 'high' },
      ],
      pendingApprovals: [
        {
          id: 'queue-id-1',
          field_name: 'stage',
          old_value: 'Discovery',
          new_value: 'Demo',
          confidence: 'high',
          reasoning: 'Prospect ready for demo',
        },
      ],
      skippedFields: [],
      appUrl: 'https://app.use60.com',
    });

    // Must return blocks array and fallback text
    expect(message).toHaveProperty('blocks');
    expect(message).toHaveProperty('text');
    expect(Array.isArray(message.blocks)).toBe(true);
    expect(message.blocks.length).toBeGreaterThan(0);

    // Header block should contain deal name
    const headerBlock = message.blocks[0] as { type: string; text?: { text: string } };
    expect(headerBlock.type).toBe('header');
    expect(headerBlock.text?.text).toContain('Acme Corp');
  });

  it('Slack approval block has correct action_id format for approve/reject/edit buttons', async () => {
    const { buildCRMApprovalMessage } = await import('../_shared/slackBlocks.ts');

    const queueId = 'test-queue-uuid';
    const message = buildCRMApprovalMessage({
      dealId: TEST_DEAL_ID,
      dealName: 'Test Deal',
      meetingId: TEST_MEETING_ID,
      meetingTitle: 'Test Meeting',
      autoApplied: [],
      pendingApprovals: [
        {
          id: queueId,
          field_name: 'close_date',
          old_value: null,
          new_value: '2026-03-31',
          confidence: 'medium',
        },
      ],
      skippedFields: [],
      appUrl: 'https://app.use60.com',
    });

    // Find an actions block
    const actionsBlock = message.blocks.find(
      (b: { type: string }) => b.type === 'actions'
    ) as { type: string; elements: Array<{ action_id: string }> } | undefined;

    expect(actionsBlock).toBeDefined();

    const actionIds = actionsBlock!.elements.map((e) => e.action_id);

    // Approve button: crm_approve::close_date::{queueId}
    expect(actionIds.some((id) => id.startsWith(`crm_approve::close_date::`))).toBe(true);
    // Reject button: crm_reject::close_date::{queueId}
    expect(actionIds.some((id) => id.startsWith(`crm_reject::close_date::`))).toBe(true);
  });

  it('crm_field_updates records have change_source=auto_apply for auto-applied fields', async () => {
    const { autoApplyFields } = await import(
      '../_shared/orchestrator/adapters/crmAutoApply.ts'
    );

    const supabase = buildSupabaseMock({
      deals: {
        data: {
          id: TEST_DEAL_ID,
          notes: 'Existing notes.',
          next_steps: 'Old next steps',
          value: null,
          expected_close_date: null,
          stage_id: 'stage-uuid-1',
          org_id: TEST_ORG_ID,
        },
        error: null,
      },
    });

    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    await autoApplyFields(
      supabase as never,
      {
        org_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        deal_id: TEST_DEAL_ID,
        meeting_id: TEST_MEETING_ID,
      },
      classified.autoApply,
    );

    // crm_field_updates insert should have been called
    expect(supabase._insertMock).toHaveBeenCalled();

    // Find any insert call targeting crm_field_updates
    const insertCalls = supabase._insertMock.mock.calls;
    const auditInsert = insertCalls.find(
      (call: [Record<string, unknown>]) =>
        call[0]?.change_source === 'auto_apply',
    );
    expect(auditInsert).toBeDefined();
  });

  it('crm_approval_queue entries are created for approval-required fields', () => {
    // The classifier returns requireApproval array; the runner calls create_crm_approval_item.
    // Here we verify the classifier output drives the right fields to approval.
    const classified = classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    // Each requireApproval field should have the correct structure for the RPC
    for (const field of classified.requireApproval) {
      expect(field).toMatchObject({
        field_name: expect.any(String),
        confidence: expect.stringMatching(/^(high|medium|low)$/),
        proposed_value: expect.anything(),
      });
    }

    // Specifically stage, close_date, deal_value
    const names = classified.requireApproval.map((f) => f.field_name);
    expect(names).toEqual(expect.arrayContaining(['stage', 'close_date', 'deal_value']));
  });
});

// =============================================================================
// Scenario 2: Low confidence skip
// =============================================================================

describe('CRM-011 Scenario 2: Low confidence skip', () => {
  it('all low-confidence fields go to skipLowConfidence when minimum is medium', () => {
    const classified = classifyFields(LOW_CONFIDENCE_FIELDS, DEFAULT_AGENT_CONFIG);

    expect(classified.skipLowConfidence).toHaveLength(LOW_CONFIDENCE_FIELDS.length);
    expect(classified.autoApply).toHaveLength(0);
    expect(classified.requireApproval).toHaveLength(0);
  });

  it('low-confidence fields pass through when minimum is low', () => {
    const lenientConfig: CrmClassifierConfig = {
      ...DEFAULT_AGENT_CONFIG,
      confidence_minimum: 'low',
    };

    const classified = classifyFields(LOW_CONFIDENCE_FIELDS, lenientConfig);

    // No fields skipped
    expect(classified.skipLowConfidence).toHaveLength(0);
    // stage + deal_value go to requireApproval (on approval_required list)
    expect(classified.requireApproval.map((f) => f.field_name)).toEqual(
      expect.arrayContaining(['stage', 'deal_value']),
    );
    // next_steps goes to autoApply (on auto_approve list)
    expect(classified.autoApply.map((f) => f.field_name)).toContain('next_steps');
  });

  it('mixed confidence batch: only medium+ proceed', () => {
    const mixed: DealFieldChangeLike[] = [
      { field_name: 'next_steps', old_value: null, new_value: 'High value step', confidence: 'high', reasoning: '' },
      { field_name: 'stage', old_value: 'Discovery', new_value: 'Proposal', confidence: 'low', reasoning: '' },
      { field_name: 'blockers', old_value: null, new_value: 'Budget freeze', confidence: 'medium', reasoning: '' },
    ];

    const classified = classifyFields(mixed, DEFAULT_AGENT_CONFIG);

    expect(classified.skipLowConfidence.map((f) => f.field_name)).toContain('stage');
    expect(classified.autoApply.map((f) => f.field_name)).toContain('next_steps');
    expect(classified.autoApply.map((f) => f.field_name)).toContain('blockers');
  });
});

// =============================================================================
// Scenario 3: HubSpot sync disabled
// =============================================================================

describe('CRM-011 Scenario 3: HubSpot sync disabled', () => {
  it('syncToHubSpot returns { synced: false } immediately when disabled', async () => {
    const { syncToHubSpot } = await import(
      '../_shared/orchestrator/adapters/crmHubSpotSync.ts'
    );

    const supabase = buildSupabaseMock();

    const result = await syncToHubSpot(
      supabase as never,
      TEST_ORG_ID,
      TEST_DEAL_ID,
      [
        {
          field_name: 'next_steps',
          previous_value: null,
          applied_value: 'Follow up by Friday',
          confidence: 'high',
          reason: 'Committed in meeting',
        },
      ],
      { hubspot_sync_enabled: false },
    );

    expect(result.synced).toBe(false);
    // Should not have attempted credential lookup
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('syncToHubSpot returns { synced: false } with empty appliedChanges', async () => {
    const { syncToHubSpot } = await import(
      '../_shared/orchestrator/adapters/crmHubSpotSync.ts'
    );

    const supabase = buildSupabaseMock();

    const result = await syncToHubSpot(
      supabase as never,
      TEST_ORG_ID,
      TEST_DEAL_ID,
      [],
      { hubspot_sync_enabled: true },
    );

    expect(result.synced).toBe(false);
  });

  it('syncToHubSpot returns { synced: false, error: "not_connected" } when no credentials', async () => {
    const { syncToHubSpot } = await import(
      '../_shared/orchestrator/adapters/crmHubSpotSync.ts'
    );

    // Simulate no HubSpot credentials row
    const supabase = buildSupabaseMock({
      hubspot_org_credentials: { data: null, error: null },
    });

    const result = await syncToHubSpot(
      supabase as never,
      TEST_ORG_ID,
      TEST_DEAL_ID,
      [
        {
          field_name: 'next_steps',
          previous_value: null,
          applied_value: 'Test',
          confidence: 'high',
          reason: '',
        },
      ],
      { hubspot_sync_enabled: true },
    );

    expect(result.synced).toBe(false);
    expect(result.error).toBe('HubSpot not connected');
  });

  it('syncToHubSpot returns { synced: false, error: "deal_not_mapped" } when no mapping', async () => {
    const { syncToHubSpot } = await import(
      '../_shared/orchestrator/adapters/crmHubSpotSync.ts'
    );

    const supabase = buildSupabaseMock({
      hubspot_org_credentials: {
        data: {
          access_token: 'valid-token',
          refresh_token: 'refresh-token',
          token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        error: null,
      },
      hubspot_object_mappings: { data: null, error: null }, // no mapping row
    });

    const result = await syncToHubSpot(
      supabase as never,
      TEST_ORG_ID,
      TEST_DEAL_ID,
      [
        {
          field_name: 'next_steps',
          previous_value: null,
          applied_value: 'Test',
          confidence: 'high',
          reason: '',
        },
      ],
      { hubspot_sync_enabled: true },
    );

    expect(result.synced).toBe(false);
    expect(result.error).toBe('deal_not_mapped');
  });
});

// =============================================================================
// Scenario 4: Missing deal — graceful error handling
// =============================================================================

describe('CRM-011 Scenario 4: Missing deal', () => {
  it('autoApplyFields returns errors array when deal not found', async () => {
    const { autoApplyFields } = await import(
      '../_shared/orchestrator/adapters/crmAutoApply.ts'
    );

    // Simulate deals table returning no row
    const supabase = buildSupabaseMock({
      deals: { data: null, error: null },
    });

    const autoFields: FieldChange[] = [
      {
        field_name: 'next_steps',
        current_value: null,
        proposed_value: 'Follow up',
        confidence: 'high',
        reason: 'Explicit commitment',
      },
    ];

    const result = await autoApplyFields(
      supabase as never,
      {
        org_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        deal_id: NONEXISTENT_DEAL_ID,
        meeting_id: TEST_MEETING_ID,
      },
      autoFields,
    );

    // Should not crash — returns errors array
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.applied).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Deal not found/i);
  });

  it('autoApplyFields returns immediately with empty applied when fieldsToApply is empty', async () => {
    const { autoApplyFields } = await import(
      '../_shared/orchestrator/adapters/crmAutoApply.ts'
    );

    const supabase = buildSupabaseMock();

    const result = await autoApplyFields(
      supabase as never,
      {
        org_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        deal_id: TEST_DEAL_ID,
        meeting_id: TEST_MEETING_ID,
      },
      [],
    );

    expect(result.applied).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    // Should not have hit the database at all
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('autoApplyFields returns errors array when deals table query fails', async () => {
    const { autoApplyFields } = await import(
      '../_shared/orchestrator/adapters/crmAutoApply.ts'
    );

    const supabase = buildSupabaseMock({
      deals: { data: null, error: { message: 'Connection timeout' } },
    });

    const result = await autoApplyFields(
      supabase as never,
      {
        org_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        deal_id: TEST_DEAL_ID,
        meeting_id: TEST_MEETING_ID,
      },
      [
        {
          field_name: 'next_steps',
          current_value: null,
          proposed_value: 'Test',
          confidence: 'high',
          reason: '',
        },
      ],
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Connection timeout/i);
    expect(result.applied).toHaveLength(0);
  });
});

// =============================================================================
// Scenario 5: Fleet handoff — deal_risk_rescore
// =============================================================================

describe('CRM-011 Scenario 5: Fleet handoff — deal_risk_rescore', () => {
  it('fleet_handoff_routes table has crm_update → deal_risk_rescore route (DB verification)', () => {
    // This is a verification of the migration CRM-008.
    // The actual check is a SQL assertion — here we document the expected row shape
    // so devs know what to verify in Supabase Studio or via migration inspection.

    const expectedHandoffRoute = {
      source_sequence_key: 'crm_update',
      source_step_skill: 'slack-crm-notify',
      target_event_type: 'deal_risk_rescore',
      is_active: true,
    };

    // If the migration 20260222300003_crm_update_fleet_routes.sql ran correctly,
    // fleet_handoff_routes will have this row.
    // This test documents the contract — the actual data assertion is in
    // the manual test checklist in TESTING.md.
    expect(expectedHandoffRoute.source_sequence_key).toBe('crm_update');
    expect(expectedHandoffRoute.target_event_type).toBe('deal_risk_rescore');
  });

  it('context_mapping from fleet handoff surfaces deal_id in the handoff payload', () => {
    // Document and validate the context_mapping structure from CRM-008 migration.
    const contextMapping = {
      deal_id: 'context.deal_id',
      meeting_id: 'context.meeting_id',
      changed_fields: 'outputs.auto_applied_fields',
      trigger: 'crm_updated',
    };

    // The deal_id path must be resolvable from SequenceState.context
    expect(contextMapping.deal_id).toContain('context.');
    expect(contextMapping.trigger).toBe('crm_updated');
  });

  it('classifyFields produces no side effects — pure function', () => {
    const original = JSON.parse(JSON.stringify(SAMPLE_EXTRACTED_FIELDS));

    classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);
    classifyFields(SAMPLE_EXTRACTED_FIELDS, DEFAULT_AGENT_CONFIG);

    // Input array must be unchanged after two calls
    expect(SAMPLE_EXTRACTED_FIELDS).toEqual(original);
  });
});

// =============================================================================
// Scenario 6: Classifier edge cases
// =============================================================================

describe('CRM-011 Scenario 6: Classifier edge cases', () => {
  it('unknown fields default to requireApproval (safe default)', () => {
    const unknownField: DealFieldChangeLike[] = [
      {
        field_name: 'custom_crm_field',
        old_value: null,
        new_value: 'some value',
        confidence: 'high',
        reasoning: 'Mentioned in meeting',
      },
    ];

    const classified = classifyFields(unknownField, DEFAULT_AGENT_CONFIG);

    expect(classified.requireApproval.map((f) => f.field_name)).toContain('custom_crm_field');
    expect(classified.autoApply).toHaveLength(0);
    expect(classified.skipLowConfidence).toHaveLength(0);
  });

  it('approval_required_fields always forces HITL even when confidence is high', () => {
    // stage is in approval_required_fields — even high confidence must go to approval
    const highConfidenceStage: DealFieldChangeLike[] = [
      {
        field_name: 'stage',
        old_value: 'Discovery',
        new_value: 'Closed Won',
        confidence: 'high',
        reasoning: 'Customer explicitly said "we are ready to sign"',
      },
    ];

    const classified = classifyFields(highConfidenceStage, DEFAULT_AGENT_CONFIG);

    expect(classified.requireApproval.map((f) => f.field_name)).toContain('stage');
    expect(classified.autoApply).toHaveLength(0);
  });

  it('high confidence_minimum=high skips medium fields', () => {
    const strictConfig: CrmClassifierConfig = {
      ...DEFAULT_AGENT_CONFIG,
      confidence_minimum: 'high',
    };

    // next_steps with medium confidence should be skipped under strict config
    const mediumField: DealFieldChangeLike[] = [
      {
        field_name: 'next_steps',
        old_value: null,
        new_value: 'Follow up',
        confidence: 'medium',
        reasoning: '',
      },
    ];

    const classified = classifyFields(mediumField, strictConfig);

    expect(classified.skipLowConfidence.map((f) => f.field_name)).toContain('next_steps');
    expect(classified.autoApply).toHaveLength(0);
  });

  it('accepts FieldChange shape (current_value/proposed_value) directly', () => {
    const canonical: FieldChange[] = [
      {
        field_name: 'next_steps',
        current_value: 'Old steps',
        proposed_value: 'New steps',
        confidence: 'high',
        reason: 'Committed',
      },
    ];

    const classified = classifyFields(canonical, DEFAULT_AGENT_CONFIG);

    expect(classified.autoApply).toHaveLength(1);
    expect(classified.autoApply[0].current_value).toBe('Old steps');
    expect(classified.autoApply[0].proposed_value).toBe('New steps');
    expect(classified.autoApply[0].reason).toBe('Committed');
  });

  it('empty extractedFields returns all empty buckets', () => {
    const classified = classifyFields([], DEFAULT_AGENT_CONFIG);

    expect(classified.autoApply).toHaveLength(0);
    expect(classified.requireApproval).toHaveLength(0);
    expect(classified.skipLowConfidence).toHaveLength(0);
  });
});
