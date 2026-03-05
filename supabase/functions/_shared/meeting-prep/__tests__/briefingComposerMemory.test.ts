/**
 * MW-003: briefingComposer deal memory integration tests
 *
 * Verifies:
 * - buildReturnMeetingPrompt includes deal memory when provided
 * - Open commitments, recent objections, stakeholder narrative, and risk factors appear in prompt
 * - Graceful fallback when dealMemory is undefined/null
 */

import { describe, it, expect } from 'vitest';
import { buildReturnMeetingPrompt } from '../briefingComposer.ts';

// ---- Test helpers -----------------------------------------------------------

function makeReturnMeetingInput(overrides: Record<string, unknown> = {}) {
  return {
    meetingTitle: 'Q1 Pipeline Review',
    meetingTime: '2026-03-04 10:00 AM',
    meetingNumber: 3,
    companyName: 'Acme Corp',
    dealStage: 'Proposal',
    daysInStage: 7,
    dealAmount: 50000,
    attendeeProfiles: '- Jane Doe (VP Sales) — champion\n- Bob Smith (CTO) — technical evaluator',
    attendeeComparison: 'Jane: returning | Bob: new attendee',
    historicalContext: {
      sections: {
        conversation_summary: { answer: 'Previous meetings focused on ROI and implementation.', sources: [], query_metadata: { semantic_query: null, filters_applied: {}, meetings_searched: 3, response_time_ms: 100 } },
        commitments: { answer: 'Rep promised demo by end of week.', sources: [], query_metadata: { semantic_query: null, filters_applied: {}, meetings_searched: 3, response_time_ms: 100 } },
      },
    },
    hubspotContext: 'Stage: Proposal | Pipeline: Enterprise',
    companyNews: 'Acme just raised Series B',
    ...overrides,
  };
}

// ---- Tests ------------------------------------------------------------------

describe('buildReturnMeetingPrompt — deal memory injection (MW-003)', () => {
  it('includes open commitments in the prompt when dealMemory is provided', () => {
    const input = makeReturnMeetingInput({
      dealMemory: {
        openCommitments: [
          { event_id: 'evt-1', owner: 'rep', action: 'Send pricing deck', deadline: '2026-03-10', status: 'pending', created_at: '2026-03-03' },
          { event_id: 'evt-2', owner: 'prospect', action: 'Get internal budget approval', deadline: null, status: 'pending', created_at: '2026-03-02' },
        ],
        recentObjections: [
          'Concerned about implementation timeline — wants go-live before Q2',
        ],
        stakeholderNarrative: 'Jane is the champion driving this internally. Bob was brought in to evaluate technical fit.',
        riskFactors: [
          { type: 'timeline_pressure', severity: 'medium' as const, detail: 'Close date approaching with unresolved technical questions' },
        ],
      },
    });

    const prompt = buildReturnMeetingPrompt(input as any);

    // Verify deal memory section exists
    expect(prompt).toContain('## DEAL MEMORY (Institutional Knowledge)');

    // Verify commitments
    expect(prompt).toContain('Open commitments:');
    expect(prompt).toContain('[rep] Send pricing deck');
    expect(prompt).toContain('(due: 2026-03-10)');
    expect(prompt).toContain('[prospect] Get internal budget approval');

    // Verify objections
    expect(prompt).toContain('Recent objections:');
    expect(prompt).toContain('implementation timeline');

    // Verify stakeholder narrative
    expect(prompt).toContain('Jane is the champion');
    expect(prompt).toContain('Bob was brought in');

    // Verify risk factors
    expect(prompt).toContain('Risk factors:');
    expect(prompt).toContain('[medium]');
    expect(prompt).toContain('unresolved technical questions');
  });

  it('does not include deal memory section when dealMemory is null', () => {
    const input = makeReturnMeetingInput({
      dealMemory: null,
    });

    const prompt = buildReturnMeetingPrompt(input as any);

    expect(prompt).not.toContain('## DEAL MEMORY');
    expect(prompt).not.toContain('Open commitments:');
    expect(prompt).not.toContain('Recent objections:');
  });

  it('does not include deal memory section when dealMemory is undefined', () => {
    const input = makeReturnMeetingInput();
    // dealMemory is not set (undefined)

    const prompt = buildReturnMeetingPrompt(input as any);

    expect(prompt).not.toContain('## DEAL MEMORY');
  });

  it('handles dealMemory with empty arrays gracefully', () => {
    const input = makeReturnMeetingInput({
      dealMemory: {
        openCommitments: [],
        recentObjections: [],
        stakeholderNarrative: null,
        riskFactors: [],
      },
    });

    const prompt = buildReturnMeetingPrompt(input as any);

    // Section header should still appear
    expect(prompt).toContain('## DEAL MEMORY (Institutional Knowledge)');

    // But no sub-sections for empty arrays
    expect(prompt).not.toContain('Open commitments:');
    expect(prompt).not.toContain('Recent objections:');
    expect(prompt).not.toContain('Risk factors:');
    expect(prompt).not.toContain('Narrative:');
  });

  it('includes only narrative when other arrays are empty', () => {
    const input = makeReturnMeetingInput({
      dealMemory: {
        openCommitments: [],
        recentObjections: [],
        stakeholderNarrative: 'This deal has been in motion since January. The champion is actively pushing for approval.',
        riskFactors: [],
      },
    });

    const prompt = buildReturnMeetingPrompt(input as any);

    expect(prompt).toContain('## DEAL MEMORY (Institutional Knowledge)');
    expect(prompt).toContain('This deal has been in motion since January');
    expect(prompt).not.toContain('Open commitments:');
  });

  it('preserves existing prompt sections alongside deal memory', () => {
    const input = makeReturnMeetingInput({
      dealMemory: {
        openCommitments: [
          { event_id: 'e1', owner: 'rep', action: 'Follow up', deadline: null, status: 'pending', created_at: '2026-03-03' },
        ],
        recentObjections: [],
        stakeholderNarrative: null,
        riskFactors: [],
      },
    });

    const prompt = buildReturnMeetingPrompt(input as any);

    // Existing sections still present
    expect(prompt).toContain('# PRE-MEETING BRIEF — RETURN MEETING');
    expect(prompt).toContain('## ATTENDEES');
    expect(prompt).toContain('## HISTORICAL CONTEXT FROM TRANSCRIPT ANALYSIS');
    expect(prompt).toContain('## HUBSPOT CONTEXT');
    expect(prompt).toContain('## COMPANY NEWS');

    // Deal memory appears between historical context and hubspot
    const dealMemoryIdx = prompt.indexOf('## DEAL MEMORY');
    const hubspotIdx = prompt.indexOf('## HUBSPOT CONTEXT');
    expect(dealMemoryIdx).toBeGreaterThan(0);
    expect(hubspotIdx).toBeGreaterThan(dealMemoryIdx);
  });
});
