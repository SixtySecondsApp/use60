/**
 * Signal Classifier — Shared utility for Smart Listening
 *
 * Classifies and scores account signals based on type, context, and deal status.
 * Used by account-monitor to determine severity, relevance, and recommended actions.
 */

export interface SignalInput {
  signalType: string;
  details: Record<string, unknown>;
  hasOpenDeal: boolean;
  accountType: 'company' | 'contact';
}

export interface SignalClassification {
  severity: 'low' | 'medium' | 'high' | 'critical';
  relevanceScore: number;
  recommendedAction: string;
}

// Decision-maker title keywords (used for title_change scoring)
const DECISION_MAKER_TITLES = [
  'ceo', 'cto', 'cfo', 'coo', 'cio', 'cmo', 'cro', 'cso',
  'vp', 'vice president', 'svp', 'evp',
  'director', 'head of', 'chief',
  'president', 'partner', 'founder',
  'general manager', 'managing director',
];

function isDecisionMakerTitle(title: unknown): boolean {
  if (typeof title !== 'string') return false;
  const lower = title.toLowerCase();
  return DECISION_MAKER_TITLES.some(kw => lower.includes(kw));
}

export function classifySignal(input: SignalInput): SignalClassification {
  const { signalType, details, hasOpenDeal } = input;

  switch (signalType) {
    // -----------------------------------------------------------------------
    // Company change — contact left the company (critical if on open deal)
    // -----------------------------------------------------------------------
    case 'company_change': {
      const score = 30 + (hasOpenDeal ? 50 : 0);
      return {
        severity: hasOpenDeal ? 'critical' : 'high',
        relevanceScore: Math.min(score, 100),
        recommendedAction: hasOpenDeal
          ? 'Your contact moved companies — update deal contacts and assess impact on the opportunity'
          : 'Contact changed companies — consider reaching out at their new organization',
      };
    }

    // -----------------------------------------------------------------------
    // Job/seniority change
    // -----------------------------------------------------------------------
    case 'job_change': {
      const newSeniority = details.new_seniority;
      const seniorityIncreased = typeof newSeniority === 'string' &&
        ['c_suite', 'vp', 'director'].includes(newSeniority);
      const score = 25 + (hasOpenDeal ? 30 : 0) + (seniorityIncreased ? 15 : 0);
      return {
        severity: hasOpenDeal ? 'high' : 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: seniorityIncreased
          ? 'Contact was promoted — congratulate them and explore expanded influence in the buying process'
          : 'Contact seniority changed — review if this affects your deal strategy',
      };
    }

    // -----------------------------------------------------------------------
    // Title change
    // -----------------------------------------------------------------------
    case 'title_change': {
      const newTitle = details.new_title;
      const isNowDecisionMaker = isDecisionMakerTitle(newTitle);
      const score = 20 + (hasOpenDeal ? 20 : 0) + (isNowDecisionMaker ? 25 : 0);
      return {
        severity: isNowDecisionMaker && hasOpenDeal ? 'high' : 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: isNowDecisionMaker
          ? 'Contact moved to a decision-maker role — this could accelerate your deal'
          : 'Contact title changed — confirm this aligns with your stakeholder map',
      };
    }

    // -----------------------------------------------------------------------
    // Funding event
    // -----------------------------------------------------------------------
    case 'funding_event': {
      const score = 35 + (hasOpenDeal ? 15 : 0);
      return {
        severity: 'high',
        relevanceScore: Math.min(score, 100),
        recommendedAction: 'New funding means new budget — reach out about how you can help them scale',
      };
    }

    // -----------------------------------------------------------------------
    // Company news
    // -----------------------------------------------------------------------
    case 'company_news': {
      const score = 15 + (hasOpenDeal ? 10 : 0);
      return {
        severity: 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: 'Reference this news in your next outreach to show you stay informed on their business',
      };
    }

    // -----------------------------------------------------------------------
    // Hiring surge
    // -----------------------------------------------------------------------
    case 'hiring_surge': {
      const pctChange = typeof details.pct_change === 'number' ? details.pct_change : 0;
      const isGrowth = pctChange > 0;
      const score = 20 + (isGrowth && hasOpenDeal ? 15 : 0);
      return {
        severity: Math.abs(pctChange) > 25 ? 'high' : 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: isGrowth
          ? 'Company is growing — they may need to scale tools and processes, good time to engage'
          : 'Company may be downsizing — tread carefully and focus on cost-savings messaging',
      };
    }

    // -----------------------------------------------------------------------
    // Tech stack change
    // -----------------------------------------------------------------------
    case 'tech_stack_change': {
      const score = 10 + (hasOpenDeal ? 20 : 0);
      return {
        severity: 'low',
        relevanceScore: Math.min(score, 100),
        recommendedAction: 'Review tech stack changes for competitive insights or integration opportunities',
      };
    }

    // -----------------------------------------------------------------------
    // Competitor mention
    // -----------------------------------------------------------------------
    case 'competitor_mention': {
      const score = 30 + (hasOpenDeal ? 30 : 0);
      return {
        severity: hasOpenDeal ? 'high' : 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: hasOpenDeal
          ? 'Competitor detected at this account — prepare competitive positioning and reach out proactively'
          : 'Competitor activity detected — consider proactive outreach with differentiation points',
      };
    }

    // -----------------------------------------------------------------------
    // Custom research result
    // -----------------------------------------------------------------------
    case 'custom_research_result': {
      const score = 25 + (hasOpenDeal ? 15 : 0);
      return {
        severity: 'medium',
        relevanceScore: Math.min(score, 100),
        recommendedAction: 'Your custom research prompt found results — review and take action',
      };
    }

    // -----------------------------------------------------------------------
    // Default
    // -----------------------------------------------------------------------
    default: {
      return {
        severity: 'low',
        relevanceScore: 10,
        recommendedAction: 'Review this signal and determine if action is needed',
      };
    }
  }
}
