/**
 * sopExecutor.test.ts
 * SOP-008: Unit tests for SOP trigger evaluation and step conversion
 *
 * Uses Vitest. Run with: npm run test
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateTrigger,
  type SOPRecord,
  type EventPayload,
} from '../sopExecutor.ts';

// =============================================================================
// Helpers
// =============================================================================

function makeSOP(overrides: Partial<SOPRecord> = {}): SOPRecord {
  return {
    id: 'sop-1',
    org_id: 'org-1',
    name: 'Test SOP',
    description: null,
    trigger_type: 'transcript_phrase',
    trigger_config: { phrases: ['competitor'], match_mode: 'any', case_sensitive: false, use_regex: false },
    is_active: true,
    is_platform_default: false,
    credit_cost_estimate: 2.0,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventPayload> = {}): EventPayload {
  return {
    event_type: 'meeting_ended',
    org_id: 'org-1',
    ...overrides,
  };
}

// =============================================================================
// transcript_phrase trigger
// =============================================================================

describe('evaluateTrigger — transcript_phrase', () => {
  it('matches a single phrase in the transcript (case insensitive)', () => {
    const sop = makeSOP({
      trigger_config: { phrases: ['competitor'], match_mode: 'any', case_sensitive: false, use_regex: false },
    });
    const event = makeEvent({ transcript_text: 'The customer mentioned a competitor on this call.' });
    expect(evaluateTrigger(sop, event)).toBe(true);
  });

  it('does not match when phrase absent', () => {
    const sop = makeSOP({
      trigger_config: { phrases: ['competitor'], match_mode: 'any', case_sensitive: false, use_regex: false },
    });
    const event = makeEvent({ transcript_text: 'Great call, everything looks good.' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('handles match_mode=all — fires only when ALL phrases present', () => {
    const sop = makeSOP({
      trigger_config: { phrases: ['proposal', 'pricing'], match_mode: 'all', case_sensitive: false, use_regex: false },
    });
    const onlyOne = makeEvent({ transcript_text: 'Can you send a proposal?' });
    const both = makeEvent({ transcript_text: 'Can you send a proposal with pricing info?' });
    expect(evaluateTrigger(sop, onlyOne)).toBe(false);
    expect(evaluateTrigger(sop, both)).toBe(true);
  });

  it('handles empty phrases array (should NOT fire)', () => {
    const sop = makeSOP({
      trigger_config: { phrases: [], match_mode: 'any', case_sensitive: false, use_regex: false },
    });
    const event = makeEvent({ transcript_text: 'Something happened.' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('returns false when transcript is absent', () => {
    const sop = makeSOP();
    const event = makeEvent({ transcript_text: undefined });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('does not trigger on non-meeting events', () => {
    const sop = makeSOP();
    const event = makeEvent({ event_type: 'crm_field_changed', transcript_text: 'competitor' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('case sensitive mode — does not match wrong case', () => {
    const sop = makeSOP({
      trigger_config: { phrases: ['Competitor'], match_mode: 'any', case_sensitive: true, use_regex: false },
    });
    const event = makeEvent({ transcript_text: 'the competitor was mentioned' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });
});

// =============================================================================
// crm_field_change trigger
// =============================================================================

describe('evaluateTrigger — crm_field_change', () => {
  it('fires on any_change when object and field match', () => {
    const sop = makeSOP({
      trigger_type: 'crm_field_change',
      trigger_config: { crm_object: 'deal', field_name: 'stage', condition: 'any_change' },
    });
    const event = makeEvent({
      event_type: 'crm_field_changed',
      object_type: 'deal',
      field_name: 'stage',
      old_value: 'Prospecting',
      new_value: 'Qualified',
    });
    expect(evaluateTrigger(sop, event)).toBe(true);
  });

  it('fires on changed_to with matching value', () => {
    const sop = makeSOP({
      trigger_type: 'crm_field_change',
      trigger_config: { crm_object: 'deal', field_name: 'stage', condition: 'changed_to', condition_value: 'Closed Won' },
    });
    const event = makeEvent({
      event_type: 'crm_field_changed',
      object_type: 'deal',
      field_name: 'stage',
      new_value: 'Closed Won',
    });
    expect(evaluateTrigger(sop, event)).toBe(true);
  });

  it('does not fire on changed_to with non-matching value', () => {
    const sop = makeSOP({
      trigger_type: 'crm_field_change',
      trigger_config: { crm_object: 'deal', field_name: 'stage', condition: 'changed_to', condition_value: 'Closed Won' },
    });
    const event = makeEvent({
      event_type: 'crm_field_changed',
      object_type: 'deal',
      field_name: 'stage',
      new_value: 'Qualified',
    });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('does not fire on wrong event_type', () => {
    const sop = makeSOP({
      trigger_type: 'crm_field_change',
      trigger_config: { crm_object: 'deal', field_name: 'stage', condition: 'any_change' },
    });
    const event = makeEvent({ event_type: 'meeting_ended' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('does not fire when object does not match', () => {
    const sop = makeSOP({
      trigger_type: 'crm_field_change',
      trigger_config: { crm_object: 'deal', field_name: 'stage', condition: 'any_change' },
    });
    const event = makeEvent({
      event_type: 'crm_field_changed',
      object_type: 'contact',
      field_name: 'stage',
    });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });
});

// =============================================================================
// email_pattern trigger
// =============================================================================

describe('evaluateTrigger — email_pattern', () => {
  it('fires when keyword found in email body', () => {
    const sop = makeSOP({
      trigger_type: 'email_pattern',
      trigger_config: { match_field: 'body', keywords: 'unsubscribe, cancel' },
    });
    const event = makeEvent({
      event_type: 'email_received',
      email_body: 'I would like to cancel my subscription.',
    });
    expect(evaluateTrigger(sop, event)).toBe(true);
  });

  it('does not fire when no keyword matches', () => {
    const sop = makeSOP({
      trigger_type: 'email_pattern',
      trigger_config: { match_field: 'body', keywords: 'unsubscribe, cancel' },
    });
    const event = makeEvent({
      event_type: 'email_received',
      email_body: 'Looking forward to our next call!',
    });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });

  it('does not fire on wrong event type', () => {
    const sop = makeSOP({
      trigger_type: 'email_pattern',
      trigger_config: { match_field: 'body', keywords: 'proposal' },
    });
    const event = makeEvent({ event_type: 'meeting_ended', email_body: 'proposal needed' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });
});

// =============================================================================
// time_based trigger
// =============================================================================

describe('evaluateTrigger — time_based', () => {
  it('fires on time_trigger event', () => {
    const sop = makeSOP({
      trigger_type: 'time_based',
      trigger_config: { delay_minutes: 5, relative_to: 'meeting_start', condition: 'no_join_detected' },
    });
    const event = makeEvent({ event_type: 'time_trigger' });
    expect(evaluateTrigger(sop, event)).toBe(true);
  });

  it('does not fire on non-time events', () => {
    const sop = makeSOP({
      trigger_type: 'time_based',
      trigger_config: { delay_days: 14, relative_to: 'last_champion_activity', condition: 'no_activity' },
    });
    const event = makeEvent({ event_type: 'meeting_ended' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });
});

// =============================================================================
// manual trigger
// =============================================================================

describe('evaluateTrigger — manual', () => {
  it('never auto-triggers for manual SOPs', () => {
    const sop = makeSOP({ trigger_type: 'manual', trigger_config: {} });
    const events: EventPayload[] = [
      makeEvent({ event_type: 'meeting_ended' }),
      makeEvent({ event_type: 'crm_field_changed' }),
      makeEvent({ event_type: 'email_received' }),
      makeEvent({ event_type: 'time_trigger' }),
    ];
    for (const event of events) {
      expect(evaluateTrigger(sop, event)).toBe(false);
    }
  });
});

// =============================================================================
// Disabled SOP
// =============================================================================

describe('evaluateTrigger — disabled SOP', () => {
  it('never fires when is_active=false', () => {
    const sop = makeSOP({
      is_active: false,
      trigger_config: { phrases: ['competitor'], match_mode: 'any', case_sensitive: false, use_regex: false },
    });
    const event = makeEvent({ transcript_text: 'the competitor is great' });
    expect(evaluateTrigger(sop, event)).toBe(false);
  });
});

// =============================================================================
// Credit estimation
// =============================================================================

describe('credit cost constants', () => {
  it('step credit costs add up correctly', () => {
    // Simulating No-Show Handling: crm_action(0.5) + draft_email(1.0) + create_task(0.3) + alert_rep(0.2) = 2.0
    const STEP_CREDIT_COSTS: Record<string, number> = {
      crm_action: 0.5,
      draft_email: 1.0,
      alert_rep: 0.2,
      alert_manager: 0.2,
      enrich_contact: 2.0,
      create_task: 0.3,
      custom: 1.0,
    };
    const noShowSteps = ['crm_action', 'draft_email', 'create_task', 'alert_rep'];
    const total = noShowSteps.reduce((sum, t) => sum + STEP_CREDIT_COSTS[t], 0);
    expect(total).toBe(2.0);
  });
});
