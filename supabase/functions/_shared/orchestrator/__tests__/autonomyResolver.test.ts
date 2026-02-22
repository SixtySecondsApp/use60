/**
 * autonomyResolver — Vitest test suite (AUT-008)
 *
 * Tests:
 * - User-level policy overrides org-level
 * - Org-level policy overrides preset default
 * - Preset default used when no DB overrides exist
 * - System default (approve) used as final fallback
 * - Conservative preset: all actions require approval
 * - Balanced preset: low-risk auto, high-risk approve
 * - Autonomous preset: most auto, email/proposal approve
 * - Graduated promotion: skill -> action_type mapping
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { resolveAutonomyPolicy, getActionTypeForSkill, invalidatePolicyCache } from '../autonomyResolver.ts';

// ─── Mock ─────────────────────────────────────────────────────────────────────

function makeMockSupabase(overrides?: {
  userPolicy?: string | null;
  orgPolicy?: { policy: string; preset_name?: string | null } | null;
  presetConfig?: string | null;
  defaultPreset?: string | null;
}) {
  const {
    userPolicy = null,
    orgPolicy = null,
    presetConfig = null,
    defaultPreset = 'balanced',
  } = overrides ?? {};

  const maybeSingleMock = vi.fn();

  // Chain: from -> select -> eq -> eq -> eq -> is -> maybeSingle
  // or: from -> select -> eq -> eq -> eq -> maybeSingle
  // We use a simple sequential approach
  let callCount = 0;
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1 && userPolicy !== null) {
        return Promise.resolve({ data: { policy: userPolicy }, error: null });
      }
      if (callCount === 1) {
        return Promise.resolve({ data: null, error: null });
      }
      if (callCount === 2 && orgPolicy !== null) {
        return Promise.resolve({ data: orgPolicy, error: null });
      }
      if (callCount === 2) {
        return Promise.resolve({ data: null, error: null });
      }
      if (callCount === 3 && presetConfig !== null) {
        return Promise.resolve({ data: { config_value: presetConfig }, error: null });
      }
      if (callCount === 3) {
        return Promise.resolve({ data: null, error: null });
      }
      if (callCount === 4 && defaultPreset !== null) {
        return Promise.resolve({ data: { config_value: defaultPreset }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };

  return {
    from: vi.fn().mockReturnValue(mockChain),
  };
}

describe('resolveAutonomyPolicy', () => {
  beforeEach(() => {
    invalidatePolicyCache();
  });

  test('returns user-level policy when available', async () => {
    const supabase = makeMockSupabase({ userPolicy: 'auto' });
    const result = await resolveAutonomyPolicy(supabase as never, 'org1', 'user1', 'create_task');
    expect(result.policy).toBe('auto');
    expect(result.source).toBe('user');
  });

  test('falls back to org-level policy when no user override', async () => {
    const supabase = makeMockSupabase({ orgPolicy: { policy: 'suggest', preset_name: null } });
    const result = await resolveAutonomyPolicy(supabase as never, 'org1', 'user1', 'create_task');
    expect(result.policy).toBe('suggest');
    expect(result.source).toBe('org');
  });

  test('falls back to preset when no DB overrides', async () => {
    const supabase = makeMockSupabase({ defaultPreset: 'conservative' });
    const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, 'create_task');
    expect(result.policy).toBe('approve');
    expect(result.source).toBe('preset');
    expect(result.preset).toBe('conservative');
  });

  test('conservative preset: all actions approve', async () => {
    const actions = [
      'crm_stage_change', 'crm_field_update', 'crm_contact_create',
      'send_email', 'send_slack', 'create_task',
    ];
    for (const action of actions) {
      invalidatePolicyCache();
      const supabase = makeMockSupabase({ defaultPreset: 'conservative' });
      const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, action);
      expect(result.policy).toBe('approve');
    }
  });

  test('balanced preset: create_task and send_slack are auto', async () => {
    for (const action of ['create_task', 'send_slack', 'enrich_contact']) {
      invalidatePolicyCache();
      const supabase = makeMockSupabase({ defaultPreset: 'balanced' });
      const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, action);
      expect(result.policy).toBe('auto');
    }
  });

  test('balanced preset: crm_stage_change and send_email are approve', async () => {
    for (const action of ['crm_stage_change', 'send_email']) {
      invalidatePolicyCache();
      const supabase = makeMockSupabase({ defaultPreset: 'balanced' });
      const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, action);
      expect(result.policy).toBe('approve');
    }
  });

  test('autonomous preset: crm_stage_change and create_task are auto', async () => {
    for (const action of ['crm_stage_change', 'crm_field_update', 'create_task', 'enrich_contact']) {
      invalidatePolicyCache();
      const supabase = makeMockSupabase({ defaultPreset: 'autonomous' });
      const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, action);
      expect(result.policy).toBe('auto');
    }
  });

  test('autonomous preset: send_email and draft_proposal still require approval', async () => {
    for (const action of ['send_email', 'draft_proposal']) {
      invalidatePolicyCache();
      const supabase = makeMockSupabase({ defaultPreset: 'autonomous' });
      const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, action);
      expect(result.policy).toBe('approve');
    }
  });

  test('system default (approve) when all resolution fails', async () => {
    const supabase = makeMockSupabase({ defaultPreset: null });
    const result = await resolveAutonomyPolicy(supabase as never, 'org1', null, 'unknown_action');
    expect(result.policy).toBe('approve');
    expect(result.source).toBe('default');
  });

  test('user-level overrides org-level (higher priority)', async () => {
    // User says 'disabled', org says 'auto'
    const supabase = makeMockSupabase({
      userPolicy: 'disabled',
      orgPolicy: { policy: 'auto' },
    });
    const result = await resolveAutonomyPolicy(supabase as never, 'org1', 'user1', 'send_slack');
    expect(result.policy).toBe('disabled');
    expect(result.source).toBe('user');
  });
});

describe('getActionTypeForSkill', () => {
  test('maps known skills to action types', () => {
    expect(getActionTypeForSkill('update-crm-from-meeting')).toBe('crm_field_update');
    expect(getActionTypeForSkill('create-tasks-from-actions')).toBe('create_task');
    expect(getActionTypeForSkill('draft-followup-email')).toBe('send_email');
    expect(getActionTypeForSkill('deliver-slack-briefing')).toBe('send_slack');
    expect(getActionTypeForSkill('enrich-attendees')).toBe('enrich_contact');
    expect(getActionTypeForSkill('populate-proposal')).toBe('draft_proposal');
  });

  test('returns null for skills without action_type mapping', () => {
    expect(getActionTypeForSkill('generate-briefing')).toBeNull();
    expect(getActionTypeForSkill('scan-active-deals')).toBeNull();
    expect(getActionTypeForSkill('unknown-skill')).toBeNull();
  });
});
