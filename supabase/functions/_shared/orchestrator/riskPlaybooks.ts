/**
 * Risk Intervention Playbooks
 *
 * Maps each risk signal type to a specific intervention playbook with
 * context-aware action suggestions, evidence references, and confidence.
 *
 * Story: RSK-006
 */

// =============================================================================
// Types
// =============================================================================

export interface InterventionPlaybook {
  signal_type: string;
  action: string;
  reason: string;
  evidence_summary: string;
  confidence: 'high' | 'medium' | 'low';
  expected_outcome: string;
  priority: 'high' | 'medium' | 'low';
}

interface DealContext {
  deal_name: string;
  deal_value: number | null;
  deal_stage: string;
  days_in_stage: number;
  champion_name: string | null;
  champion_days_silent: number | null;
  competitor_names: string[];
  owner_name: string | null;
}

interface SignalContext {
  signal_type: string;
  severity: string;
  title: string;
  description: string;
  evidence: {
    meeting_ids?: string[];
    quotes?: string[];
    dates?: string[];
    context?: string;
  } | null;
}

// =============================================================================
// Playbook Templates (one per signal type)
// =============================================================================

type PlaybookGenerator = (signal: SignalContext, deal: DealContext) => InterventionPlaybook;

const PLAYBOOK_TEMPLATES: Record<string, PlaybookGenerator> = {
  timeline_slip: (signal, deal) => ({
    signal_type: 'timeline_slip',
    action: `Clarify the revised timeline with ${deal.champion_name || 'the prospect'}. If pushed beyond this quarter, propose a phased approach or interim milestone.`,
    reason: `Timeline delay detected${signal.evidence?.quotes?.[0] ? `: "${truncate(signal.evidence.quotes[0], 120)}"` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: signal.severity === 'critical' || signal.severity === 'high' ? 'high' : 'medium',
    expected_outcome: 'Confirmed revised timeline with clear next milestone date',
    priority: signal.severity === 'critical' ? 'high' : 'medium',
  }),

  budget_concern: (signal, deal) => ({
    signal_type: 'budget_concern',
    action: `Draft ROI justification tailored to ${deal.deal_name}. Consider offering a phased pricing approach or pilot program.`,
    reason: `Budget/pricing concern raised${signal.evidence?.quotes?.[0] ? `: "${truncate(signal.evidence.quotes[0], 120)}"` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'high',
    expected_outcome: 'Prospect has clear ROI data to justify budget internally',
    priority: 'high',
  }),

  competitor_mention: (signal, deal) => {
    const competitorList = deal.competitor_names.length > 0
      ? deal.competitor_names.join(', ')
      : 'competitor';
    return {
      signal_type: 'competitor_mention',
      action: `Surface the competitive battlecard for ${competitorList}. Prepare differentiation talking points for the next conversation with ${deal.champion_name || 'the prospect'}.`,
      reason: `${competitorList} mentioned${deal.deal_stage === 'negotiation' || deal.deal_stage === 'proposal' ? ' in late stage (higher risk)' : ''}`,
      evidence_summary: buildEvidenceSummary(signal),
      confidence: deal.deal_stage === 'negotiation' || deal.deal_stage === 'proposal' ? 'high' : 'medium',
      expected_outcome: 'Clear competitive positioning communicated to prospect',
      priority: deal.deal_stage === 'negotiation' || deal.deal_stage === 'proposal' ? 'high' : 'medium',
    };
  },

  champion_silent: (signal, deal) => ({
    signal_type: 'champion_silent',
    action: deal.champion_days_silent && deal.champion_days_silent > 14
      ? `Multi-thread to other contacts at ${deal.deal_name}. Request executive sponsor intro if available.`
      : `Draft a low-pressure check-in to ${deal.champion_name || 'the champion'}. Share value-add content, not a "checking in" email.`,
    reason: `${deal.champion_name || 'Champion'} hasn't engaged in ${deal.champion_days_silent ?? '14+'} days`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'high',
    expected_outcome: 'Re-engagement or alternative contact path identified',
    priority: 'high',
  }),

  sentiment_decline: (signal, deal) => ({
    signal_type: 'sentiment_decline',
    action: `Review recent meeting transcripts for specific objections or concerns. Schedule a candid "temperature check" call with ${deal.champion_name || 'the prospect'}.`,
    reason: `Meeting sentiment trending negative${signal.evidence?.context ? `: ${truncate(signal.evidence.context, 100)}` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'medium',
    expected_outcome: 'Identified specific concerns and addressed them directly',
    priority: 'medium',
  }),

  stalled_deal: (signal, deal) => ({
    signal_type: 'stalled_deal',
    action: `Create re-engagement plan for ${deal.deal_name}. Options: offer a technical deep-dive, share relevant case study, or propose a brief check-in meeting.`,
    reason: `No forward movement in ${deal.days_in_stage} days (avg for ${deal.deal_stage}: ${getStageBaseline(deal.deal_stage)} days)`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'high',
    expected_outcome: 'Deal re-engaged with clear next step scheduled',
    priority: 'high',
  }),

  objection_unresolved: (signal, deal) => ({
    signal_type: 'objection_unresolved',
    action: `Address the unresolved objection directly in the next interaction. Prepare a specific response with supporting evidence.${signal.evidence?.quotes?.[0] ? ` Objection: "${truncate(signal.evidence.quotes[0], 100)}"` : ''}`,
    reason: `Open objection not yet addressed from recent meeting`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: signal.severity === 'high' ? 'high' : 'medium',
    expected_outcome: 'Objection addressed with prospect acknowledgement',
    priority: signal.severity === 'high' || signal.severity === 'critical' ? 'high' : 'medium',
  }),

  stakeholder_concern: (signal, deal) => ({
    signal_type: 'stakeholder_concern',
    action: `Identify the new stakeholder and prepare a targeted value proposition. Consider requesting a separate meeting to address their specific concerns.`,
    reason: `New stakeholder raised concerns${signal.evidence?.quotes?.[0] ? `: "${truncate(signal.evidence.quotes[0], 120)}"` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'medium',
    expected_outcome: 'Stakeholder concerns mapped and addressed in next conversation',
    priority: 'medium',
  }),

  scope_creep: (signal, deal) => ({
    signal_type: 'scope_creep',
    action: `Document the expanding requirements and clarify which are in-scope vs. future phases. Propose a clear boundary to prevent deal stall.`,
    reason: `Requirements expanding without corresponding commitment${signal.evidence?.quotes?.[0] ? `: "${truncate(signal.evidence.quotes[0], 120)}"` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: 'medium',
    expected_outcome: 'Clear scope definition agreed with prospect',
    priority: 'low',
  }),

  decision_delay: (signal, deal) => ({
    signal_type: 'decision_delay',
    action: `Clarify the revised decision process with ${deal.champion_name || 'the prospect'}. Understand what's driving the delay and whether you can help unblock.`,
    reason: `Decision process pushed back${signal.evidence?.quotes?.[0] ? `: "${truncate(signal.evidence.quotes[0], 120)}"` : ''}`,
    evidence_summary: buildEvidenceSummary(signal),
    confidence: signal.severity === 'critical' || signal.severity === 'high' ? 'high' : 'medium',
    expected_outcome: 'Confirmed revised decision timeline with clear path forward',
    priority: 'high',
  }),
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Get an intervention playbook for a given signal and deal context.
 */
export function getInterventionPlaybook(
  signal: SignalContext,
  dealContext: DealContext,
): InterventionPlaybook {
  const generator = PLAYBOOK_TEMPLATES[signal.signal_type];
  if (!generator) {
    // Generic fallback for unknown signal types
    return {
      signal_type: signal.signal_type,
      action: `Review the risk signal and take appropriate action for ${dealContext.deal_name}.`,
      reason: signal.title || signal.description || signal.signal_type,
      evidence_summary: buildEvidenceSummary(signal),
      confidence: 'low',
      expected_outcome: 'Risk addressed',
      priority: signal.severity === 'critical' || signal.severity === 'high' ? 'high' : 'medium',
    };
  }

  return generator(signal, dealContext);
}

/**
 * Get playbooks for all active signals on a deal.
 * Returns top N playbooks sorted by priority.
 */
export function getPlaybooksForDeal(
  signals: SignalContext[],
  dealContext: DealContext,
  maxPlaybooks: number = 3,
): InterventionPlaybook[] {
  const playbooks = signals.map(s => getInterventionPlaybook(s, dealContext));

  // Sort: high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  playbooks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return playbooks.slice(0, maxPlaybooks);
}

// =============================================================================
// Helpers
// =============================================================================

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function buildEvidenceSummary(signal: SignalContext): string {
  const parts: string[] = [];

  if (signal.evidence?.quotes?.length) {
    parts.push(`Quotes: ${signal.evidence.quotes.slice(0, 2).map(q => `"${truncate(q, 80)}"`).join('; ')}`);
  }
  if (signal.evidence?.dates?.length) {
    parts.push(`Dates: ${signal.evidence.dates.slice(0, 3).join(', ')}`);
  }
  if (signal.evidence?.meeting_ids?.length) {
    parts.push(`From ${signal.evidence.meeting_ids.length} meeting(s)`);
  }
  if (signal.evidence?.context) {
    parts.push(truncate(signal.evidence.context, 100));
  }

  return parts.join(' | ') || signal.description || 'No additional evidence';
}

function getStageBaseline(stage: string): number {
  const baselines: Record<string, number> = {
    discovery: 14,
    qualification: 10,
    proposal: 18,
    negotiation: 12,
  };
  return baselines[stage?.toLowerCase()] ?? 14;
}
