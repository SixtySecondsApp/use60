// supabase/functions/seed-demo-data/intelligenceTemplates.ts
// Pre-computed meeting intelligence data templates for demo seeding.
// Provides realistic data for meeting_classifications, meeting_scorecards,
// meeting_structured_summaries, and meeting_action_items.
//
// Placeholder tokens in assignee_name fields:
//   {{REP_NAME}}      — replaced at seed time with the rep's name
//   {{CONTACT_NAME}}  — replaced at seed time with the prospect's name

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ClassificationTemplate {
  meetingType: string;
  has_forward_movement: boolean;
  has_proposal_request: boolean;
  has_pricing_discussion: boolean;
  has_competitor_mention: boolean;
  has_objection: boolean;
  has_demo_request: boolean;
  has_timeline_discussion: boolean;
  has_budget_discussion: boolean;
  has_decision_maker: boolean;
  has_next_steps: boolean;
  outcome: 'positive' | 'neutral' | 'negative' | 'unknown';
  detected_stage: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up' | 'general';
  topics: Array<{ topic: string; confidence: number; mentions: number }>;
  objections: Array<{ objection: string; response: string; resolved: boolean; category: string }>;
  competitors: Array<{ name: string; context: string; sentiment: string }>;
  keywords: string[];
  objection_count: number;
  competitor_mention_count: number;
  positive_signal_count: number;
  negative_signal_count: number;
}

export interface ScorecardTemplate {
  meetingType: string;
  overall_score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metric_scores: Record<string, { score: number; weight: number; notes: string }>;
  talk_time_rep_pct: number;
  talk_time_customer_pct: number;
  discovery_questions_count: number;
  discovery_questions_examples: string[];
  next_steps_established: boolean;
  next_steps_details: string;
  strengths: string[];
  areas_for_improvement: string[];
  specific_feedback: string;
  coaching_tips: string[];
  key_moments: Array<{ timestamp_seconds: number; type: string; description: string; quote: string }>;
  detected_meeting_type: string;
}

export interface StructuredSummaryTemplate {
  meetingType: string;
  key_decisions: Array<{ decision: string; context: string; importance: string }>;
  rep_commitments: Array<{ commitment: string; due_date: string; priority: string; expectation: string }>;
  prospect_commitments: Array<{ commitment: string; due_date: string; priority: string; expectation: string }>;
  stakeholders_mentioned: Array<{ name: string; role: string; concerns: string[]; sentiment: string }>;
  pricing_discussed: { mentioned: boolean; amount?: string; structure?: string; objections?: string[]; notes?: string };
  technical_requirements: Array<{ requirement: string; priority: string; notes: string }>;
  outcome_signals: { overall: string; positive_signals: string[]; negative_signals: string[]; next_steps: string[]; forward_movement: boolean };
  stage_indicators: { detected_stage: string; confidence: number; signals: string[] };
  competitor_mentions: Array<{ name: string; context: string; sentiment: string }>;
  objections: Array<{ objection: string; response: string; resolved: boolean; category: string }>;
}

export interface ActionItemTemplate {
  title: string;
  assignee_name: string; // '{{REP_NAME}}' or '{{CONTACT_NAME}}'
  priority: string;
  category: string;
  deadlineOffsetDays: number;
  is_sales_rep_task: boolean;
  importance: 'high' | 'medium' | 'low';
  ai_generated: boolean;
}

// ---------------------------------------------------------------------------
// Classification Templates
// ---------------------------------------------------------------------------

export const CLASSIFICATION_TEMPLATES: ClassificationTemplate[] = [
  // -------------------------------------------------------------------------
  // 1. DISCOVERY
  // -------------------------------------------------------------------------
  {
    meetingType: 'discovery',
    has_forward_movement: false,
    has_proposal_request: false,
    has_pricing_discussion: true,
    has_competitor_mention: true,
    has_objection: false,
    has_demo_request: true,
    has_timeline_discussion: true,
    has_budget_discussion: true,
    has_decision_maker: false,
    has_next_steps: true,
    outcome: 'positive',
    detected_stage: 'discovery',
    topics: [
      { topic: 'Follow-up automation', confidence: 0.92, mentions: 6 },
      { topic: 'Meeting preparation', confidence: 0.87, mentions: 4 },
      { topic: 'Pipeline management', confidence: 0.78, mentions: 3 },
      { topic: 'HubSpot integration', confidence: 0.83, mentions: 4 },
      { topic: 'Budget and pricing', confidence: 0.74, mentions: 2 },
    ],
    objections: [],
    competitors: [
      {
        name: 'Gong',
        context: 'Prospect evaluated Gong but found it built for larger enterprise teams',
        sentiment: 'negative',
      },
      {
        name: 'Salesloft',
        context: 'Salesloft was briefly reviewed but had too many unused features',
        sentiment: 'negative',
      },
    ],
    keywords: [
      'follow-up', 'automation', 'HubSpot', 'sequences', 'meeting prep', 'pipeline',
      'Gong', 'Salesloft', 'budget', 'ARR', 'quota', 'reps',
    ],
    objection_count: 0,
    competitor_mention_count: 2,
    positive_signal_count: 4,
    negative_signal_count: 1,
  },

  // -------------------------------------------------------------------------
  // 2. DEMO
  // -------------------------------------------------------------------------
  {
    meetingType: 'demo',
    has_forward_movement: true,
    has_proposal_request: false,
    has_pricing_discussion: true,
    has_competitor_mention: true,
    has_objection: true,
    has_demo_request: false,
    has_timeline_discussion: true,
    has_budget_discussion: true,
    has_decision_maker: true,
    has_next_steps: true,
    outcome: 'positive',
    detected_stage: 'demo',
    topics: [
      { topic: 'Follow-up email drafting', confidence: 0.95, mentions: 7 },
      { topic: 'Meeting brief and prep', confidence: 0.91, mentions: 5 },
      { topic: 'HubSpot integration', confidence: 0.88, mentions: 6 },
      { topic: 'Pricing and seat count', confidence: 0.84, mentions: 3 },
      { topic: 'Trial and onboarding', confidence: 0.86, mentions: 4 },
      { topic: 'Deal re-engagement', confidence: 0.79, mentions: 3 },
    ],
    objections: [
      {
        objection: 'AI-drafted emails have been generic and low quality in past tools we tried',
        response: 'Rep demonstrated a context-specific email referencing the prospect\'s exact objection — not a generic template',
        resolved: true,
        category: 'need',
      },
    ],
    competitors: [
      {
        name: 'Gong',
        context: 'Prospect mentioned Gong built similar re-engagement features but as a manager report, not a rep tool',
        sentiment: 'neutral',
      },
    ],
    keywords: [
      'demo', 'trial', 'follow-up', 'Slack', 'calendar', 'HubSpot', 'per seat',
      'implementation', 'Gong', 'deal pulse', 'brief', 're-engagement', 'credit card',
    ],
    objection_count: 1,
    competitor_mention_count: 1,
    positive_signal_count: 5,
    negative_signal_count: 1,
  },

  // -------------------------------------------------------------------------
  // 3. NEGOTIATION
  // -------------------------------------------------------------------------
  {
    meetingType: 'negotiation',
    has_forward_movement: true,
    has_proposal_request: false,
    has_pricing_discussion: true,
    has_competitor_mention: false,
    has_objection: true,
    has_demo_request: false,
    has_timeline_discussion: true,
    has_budget_discussion: true,
    has_decision_maker: true,
    has_next_steps: true,
    outcome: 'positive',
    detected_stage: 'negotiation',
    topics: [
      { topic: 'Pricing negotiation', confidence: 0.97, mentions: 9 },
      { topic: 'Contract length and exit clause', confidence: 0.93, mentions: 5 },
      { topic: 'Payment terms', confidence: 0.91, mentions: 4 },
      { topic: 'Seat count and growth plan', confidence: 0.88, mentions: 4 },
      { topic: 'Onboarding and support', confidence: 0.76, mentions: 2 },
    ],
    objections: [
      {
        objection: 'Annual price of $22k is higher than the $18k target set by VP of Sales',
        response: 'Rep offered quarterly billing at same annual rate plus a price-lock guarantee for 12 months on future seat expansion',
        resolved: true,
        category: 'budget',
      },
      {
        objection: '12-month contract feels long for a tool only trialled for two weeks',
        response: 'Rep introduced a 60-day exit clause while preserving the annual rate and price-lock benefit',
        resolved: true,
        category: 'timeline',
      },
    ],
    competitors: [],
    keywords: [
      'proposal', 'price', 'eighteen', 'twenty-two', 'quarterly', 'annual', 'contract',
      'exit clause', 'price lock', 'seats', 'legal', 'signature', 'Friday',
    ],
    objection_count: 2,
    competitor_mention_count: 0,
    positive_signal_count: 5,
    negative_signal_count: 2,
  },

  // -------------------------------------------------------------------------
  // 4. FOLLOW-UP
  // -------------------------------------------------------------------------
  {
    meetingType: 'follow_up',
    has_forward_movement: true,
    has_proposal_request: false,
    has_pricing_discussion: false,
    has_competitor_mention: true,
    has_objection: false,
    has_demo_request: false,
    has_timeline_discussion: true,
    has_budget_discussion: false,
    has_decision_maker: true,
    has_next_steps: true,
    outcome: 'neutral',
    detected_stage: 'follow_up',
    topics: [
      { topic: 'Org change and new stakeholder', confidence: 0.94, mentions: 6 },
      { topic: 'Trial rep feedback', confidence: 0.89, mentions: 5 },
      { topic: 'Decision timeline', confidence: 0.85, mentions: 4 },
      { topic: 'Payment timing flexibility', confidence: 0.78, mentions: 2 },
      { topic: 'New VP onboarding', confidence: 0.91, mentions: 5 },
    ],
    objections: [],
    competitors: [
      {
        name: 'Salesloft',
        context: 'Incoming VP Marcus came from a company that used Salesloft heavily and may have existing preference',
        sentiment: 'negative',
      },
    ],
    keywords: [
      'org change', 'Marcus', 'VP', 'Salesloft', 'trial', 'Jamie', 'follow-up',
      're-engagement', 'quarterly', 'case study', 'decision', 'four weeks',
    ],
    objection_count: 0,
    competitor_mention_count: 1,
    positive_signal_count: 3,
    negative_signal_count: 2,
  },

  // -------------------------------------------------------------------------
  // 5. CLOSING
  // -------------------------------------------------------------------------
  {
    meetingType: 'closing',
    has_forward_movement: true,
    has_proposal_request: false,
    has_pricing_discussion: true,
    has_competitor_mention: true,
    has_objection: false,
    has_demo_request: false,
    has_timeline_discussion: true,
    has_budget_discussion: true,
    has_decision_maker: true,
    has_next_steps: true,
    outcome: 'positive',
    detected_stage: 'closing',
    topics: [
      { topic: 'Data ownership and portability', confidence: 0.92, mentions: 3 },
      { topic: 'HubSpot architecture compatibility', confidence: 0.88, mentions: 3 },
      { topic: 'Implementation timeline', confidence: 0.95, mentions: 5 },
      { topic: 'Contract signing and terms', confidence: 0.97, mentions: 6 },
      { topic: 'Onboarding manager and support', confidence: 0.86, mentions: 4 },
    ],
    objections: [],
    competitors: [
      {
        name: 'Salesloft',
        context: 'New VP referenced extensive experience with Salesloft and Outreach at prior companies, contrasted favourably with this AI-native approach',
        sentiment: 'neutral',
      },
    ],
    keywords: [
      'data ownership', 'export', 'cancel', 'contract', 'sign', 'onboarding manager',
      'forty-five days', 'Q2 kickoff', 'implementation', 'Slack channel', 'counter-signed',
    ],
    objection_count: 0,
    competitor_mention_count: 1,
    positive_signal_count: 6,
    negative_signal_count: 0,
  },

  // -------------------------------------------------------------------------
  // 6. GENERAL
  // -------------------------------------------------------------------------
  {
    meetingType: 'general',
    has_forward_movement: false,
    has_proposal_request: false,
    has_pricing_discussion: false,
    has_competitor_mention: false,
    has_objection: false,
    has_demo_request: false,
    has_timeline_discussion: false,
    has_budget_discussion: false,
    has_decision_maker: false,
    has_next_steps: true,
    outcome: 'neutral',
    detected_stage: 'general',
    topics: [
      { topic: 'Outbound prospecting strategy', confidence: 0.82, mentions: 5 },
      { topic: 'Pipeline visibility and reporting', confidence: 0.79, mentions: 3 },
      { topic: 'Warm outbound feature beta', confidence: 0.75, mentions: 3 },
      { topic: 'Rep adoption and usage', confidence: 0.71, mentions: 2 },
    ],
    objections: [],
    competitors: [],
    keywords: [
      'outbound', 'inbound', 'pipeline', 'summary', 'Monday', 'beta', 'warm',
      'Jamie', 'prospecting', 'follow-up', 'HubSpot', 'relationship',
    ],
    objection_count: 0,
    competitor_mention_count: 0,
    positive_signal_count: 2,
    negative_signal_count: 0,
  },
];

// ---------------------------------------------------------------------------
// Scorecard Templates
// ---------------------------------------------------------------------------

export const SCORECARD_TEMPLATES: ScorecardTemplate[] = [
  // -------------------------------------------------------------------------
  // 1. DISCOVERY — Score 72 / B
  // -------------------------------------------------------------------------
  {
    meetingType: 'discovery',
    overall_score: 72,
    grade: 'B',
    metric_scores: {
      talk_ratio: {
        score: 78,
        weight: 25,
        notes: 'Rep at 42% talk time — within the ideal 30–45% band. Good balance maintained throughout.',
      },
      discovery_questions: {
        score: 90,
        weight: 25,
        notes: '8 open-ended discovery questions identified. Strong use of "tell me more" and "what does that mean for you" probes.',
      },
      next_steps: {
        score: 80,
        weight: 25,
        notes: 'Next step agreed: calendar link to be sent for a demo with VP of Sales. Concrete but not time-bound on rep side.',
      },
      monologue_detection: {
        score: 75,
        weight: 25,
        notes: 'One monologue detected (~75 seconds) when explaining the ROI case. Consider breaking that sequence with a question.',
      },
    },
    talk_time_rep_pct: 42,
    talk_time_customer_pct: 58,
    discovery_questions_count: 8,
    discovery_questions_examples: [
      'Can you say more about the tooling side?',
      'How many reps are we talking?',
      'Is it that they don\'t have time to update HubSpot, or they genuinely don\'t trust it?',
      'Who owns that problem on your side — is it you, or is this coming from your VP?',
      'Beyond the follow-up piece, are there other parts of the sales workflow that feel broken right now?',
      'When a deal stalls — like it goes quiet for two or three weeks — what happens?',
      'Has that cost you deals you could quantify?',
      'Is there a reason you\'re looking at this now versus six months ago?',
    ],
    next_steps_established: true,
    next_steps_details: 'Rep to send calendar link for a demo involving VP of Sales. Demo to focus on follow-up automation and meeting prep for 8–12 rep team with HubSpot stack.',
    strengths: [
      'Strong active listening — reflected prospect language back accurately throughout',
      'Effectively quantified the pain point ($400–500k ARR slippage estimate surfaced by prospect)',
      'Positioned next step as a benefit to the prospect rather than a push',
      'Navigated the decision-maker question smoothly without making the contact feel undermined',
    ],
    areas_for_improvement: [
      'ROI summary at the end ran long — break it into a question to confirm the prospect is following',
      'Didn\'t confirm a specific date/time for the follow-up demo before ending the call',
      'Could have probed deeper on what specifically failed with Salesloft to sharpen competitive positioning',
    ],
    specific_feedback: 'Solid discovery call — you let the prospect talk and found genuine pain. The ARR slippage number is a strong anchor for the ROI conversation in the demo. Next time, lock in a specific calendar slot before you hang up rather than sending a link after.',
    coaching_tips: [
      'End every discovery call with a date confirmed, not a promise to send a link — conversion drops significantly without a booked slot',
      'When a prospect mentions a competitor negatively, ask one follow-up: "What specifically didn\'t work?" — it\'s free competitive intelligence',
      'The monologue around ROI (minute 28) was good content but should be a conversation — try "Does that math check out from your side?" halfway through',
    ],
    key_moments: [
      {
        timestamp_seconds: 310,
        type: 'positive',
        description: 'Prospect revealed $400–500k ARR slippage estimate — strong pain quantification moment',
        quote: 'Sarah\'s convinced we lost two or three mid-market deals last year to that exact scenario. Hard to put a number on it but she estimates four to five hundred thousand in ARR slippage.',
      },
      {
        timestamp_seconds: 680,
        type: 'coaching',
        description: 'ROI summary ran ~75 seconds without checking prospect comprehension',
        quote: 'That\'s a meaningful number. If you could get even half of that back with better follow-up, the ROI case writes itself.',
      },
      {
        timestamp_seconds: 890,
        type: 'positive',
        description: 'Prospect confirmed budget was unfrozen specifically for sales productivity tooling — strong buying signal',
        quote: 'Q1 results were softer than expected. There\'s appetite to try something new. Budget got unfrozen specifically for sales productivity tooling.',
      },
      {
        timestamp_seconds: 1050,
        type: 'coaching',
        description: 'Call ended without a confirmed meeting date — follow-up conversion risk',
        quote: 'I\'ll send you a calendar link and a short prep note.',
      },
    ],
    detected_meeting_type: 'discovery',
  },

  // -------------------------------------------------------------------------
  // 2. DEMO — Score 81 / B
  // -------------------------------------------------------------------------
  {
    meetingType: 'demo',
    overall_score: 81,
    grade: 'B',
    metric_scores: {
      talk_ratio: {
        score: 72,
        weight: 25,
        notes: 'Rep at 52% talk time — slightly over the ideal ceiling. Demo format pushes this higher but watch for over-explaining.',
      },
      discovery_questions: {
        score: 76,
        weight: 25,
        notes: '4 discovery questions — appropriate for a demo but more "does this match what you need?" checks would help.',
      },
      next_steps: {
        score: 100,
        weight: 25,
        notes: 'Clear, agreed next step: trial with 2–3 real reps on live deals. VP of Sales co-signed the next step on the call.',
      },
      monologue_detection: {
        score: 75,
        weight: 25,
        notes: 'Two monologues detected during feature walkthroughs. Feature explanations should have mid-point check-ins.',
      },
    },
    talk_time_rep_pct: 52,
    talk_time_customer_pct: 48,
    discovery_questions_count: 4,
    discovery_questions_examples: [
      'What would make you confident enough to run a trial?',
      'Do the reps have to do anything to trigger this?',
      'Can it write back to HubSpot?',
      'What does the HubSpot integration look like?',
    ],
    next_steps_established: true,
    next_steps_details: 'Two reps will participate in a two-week trial using live deals and real accounts. Timing to be confirmed in a separate call after the demo. VP has verbally endorsed the trial format.',
    strengths: [
      'Demo was anchored on the prospect\'s specific use cases identified in discovery — not a generic product walk',
      'Handled the "AI emails are usually garbage" objection with a live example rather than a defensive response',
      'VP of Sales ended the call more positive than when she started — successful skeptic conversion',
      'Pricing was introduced proactively and framed against the team size discussed in discovery',
    ],
    areas_for_improvement: [
      'Feature walkthroughs ran long without checking understanding — two monologues of 90+ seconds each',
      'Didn\'t explicitly ask the VP what it would take to move forward during the close',
      'Trial logistics (how many reps, which deals) left open — should have been scoped on the call',
    ],
    specific_feedback: 'Strong demo — you connected every feature to a pain they told you about in discovery, which is the right playbook. The skeptical VP ending positively is a significant win. The main gap is leaving the trial details loose — nail down the reps and timeline before the next touchpoint.',
    coaching_tips: [
      'After each major feature section, ask a temperature check: "Is this what you were imagining when you described that problem?" — keeps the conversation two-way',
      'Before ending a demo, explicitly ask the decision maker: "What would need to be true after the trial for you to move forward?" — it surfaces deal criteria early',
      'Have a trial scoping checklist ready: number of reps, which deals they\'ll use, who reviews results — move through it at the end of every demo',
    ],
    key_moments: [
      {
        timestamp_seconds: 245,
        type: 'positive',
        description: 'VP of Sales challenged AI email quality — rep responded with a live contextual example rather than a claim',
        quote: 'This draft — it\'s referencing the specific objection the prospect raised about integration complexity. It\'s not "thanks for the call, here\'s a summary."',
      },
      {
        timestamp_seconds: 720,
        type: 'coaching',
        description: 'Feature walkthrough on meeting briefs ran ~95 seconds without a check-in',
        quote: 'One section per call, all in one brief. They can skim or go deep depending on how important the meeting is.',
      },
      {
        timestamp_seconds: 1180,
        type: 'positive',
        description: 'VP expressed genuine surprise at product quality — skeptic converted',
        quote: 'Okay. I have to admit, this is better than I expected. I came in fairly skeptical.',
      },
      {
        timestamp_seconds: 1290,
        type: 'positive',
        description: 'Strong close — rep reframed the trial as exactly what the VP asked for, not a sales tactic',
        quote: 'That\'s exactly the trial. We pick two or three of your reps, connect their real accounts, and they use it on live deals for two weeks.',
      },
    ],
    detected_meeting_type: 'demo',
  },

  // -------------------------------------------------------------------------
  // 3. NEGOTIATION — Score 68 / C
  // -------------------------------------------------------------------------
  {
    meetingType: 'negotiation',
    overall_score: 68,
    grade: 'C',
    metric_scores: {
      talk_ratio: {
        score: 65,
        weight: 25,
        notes: 'Rep at 55% talk time — above ideal, typical in negotiation but prospect had less air time than optimal.',
      },
      discovery_questions: {
        score: 52,
        weight: 25,
        notes: '2 discovery questions — low, but appropriate for a negotiation. Key miss: no question about what would make the contract feel safe.',
      },
      next_steps: {
        score: 100,
        weight: 25,
        notes: 'Excellent close: updated proposal sent same afternoon, signature by Friday, legal contact looped in. Fully concrete.',
      },
      monologue_detection: {
        score: 55,
        weight: 25,
        notes: 'Three monologue segments detected when presenting the 12-seat and exit clause options. Structure ideas as questions, not pitches.',
      },
    },
    talk_time_rep_pct: 55,
    talk_time_customer_pct: 45,
    discovery_questions_count: 2,
    discovery_questions_examples: [
      'Where does the eighteen number come from — is that a hard budget ceiling or more of a target?',
      'Is there anything else in the proposal that created friction, or is it really just the headline number?',
    ],
    next_steps_established: true,
    next_steps_details: 'Rep to send updated proposal with quarterly payments and 60-day exit clause by end of day. Prospect to review with legal and return signature by Friday. Onboarding to begin following week.',
    strengths: [
      'Correctly identified that the $18k number was a negotiating target, not a hard ceiling — avoided unnecessary concession',
      'Introduced alternative deal structures (12-seat volume pricing, quarterly billing, exit clause) rather than simply discounting',
      'The exit clause offer was confident and conviction-based — "it\'s a signal that I\'m confident you\'ll stick around"',
      'Cleared all three objections without reducing the headline price',
    ],
    areas_for_improvement: [
      'Presented the 12-seat option as a pitch rather than a question — prospect had to push back before the alternative emerged',
      'Could have uncovered the cash flow preference (quarterly billing) earlier instead of waiting for the prospect to raise it',
      'Three option structures in one call can feel overwhelming — consider leading with one clear recommendation',
    ],
    specific_feedback: 'You held price well and closed a deal on good terms. The pattern to watch: you presented three different structures (12-seat, price-lock, exit clause) sequentially under pressure. Structuring one clear recommendation upfront, then responding to pushback, tends to feel more confident and reduces cognitive load for the buyer.',
    coaching_tips: [
      'Before a negotiation call, decide your one preferred structure and lead with it — only introduce alternatives if the first is rejected',
      'When prospect reveals their number ("Sarah said get it under twenty"), ask what\'s driving it before you respond — budget ceiling vs. target vs. internal politics each need different responses',
      'The exit clause worked brilliantly — consider offering it proactively for annual contracts rather than holding it as a concession',
    ],
    key_moments: [
      {
        timestamp_seconds: 185,
        type: 'positive',
        description: 'Rep correctly probed whether $18k was a hard ceiling — discovered it was a target, not a limit',
        quote: 'Honest answer? It\'s a target. Sarah said "see if you can get it under twenty" and eighteen felt like a reasonable opening.',
      },
      {
        timestamp_seconds: 420,
        type: 'coaching',
        description: '12-seat option presented as a monologue rather than surfacing prospect preference first',
        quote: 'Twelve seats at a slightly reduced rate comes out to about twenty-six thousand annually, but your cost per seat drops from twenty-seven hundred to roughly twenty-two hundred.',
      },
      {
        timestamp_seconds: 780,
        type: 'positive',
        description: 'Exit clause offer delivered with conviction — immediately changed prospect energy',
        quote: 'It\'s a signal that I\'m confident you\'ll stick around. I\'m not trying to lock you in — I\'m trying to make it easy to say yes today.',
      },
      {
        timestamp_seconds: 920,
        type: 'positive',
        description: 'Prospect gave verbal commitment — first time on the call they led with forward movement',
        quote: 'I think I can get Sarah to sign off on twenty-two thousand annual, quarterly payments, with a sixty-day out and the rate lock on future seats.',
      },
    ],
    detected_meeting_type: 'negotiation',
  },

  // -------------------------------------------------------------------------
  // 4. FOLLOW-UP — Score 75 / B
  // -------------------------------------------------------------------------
  {
    meetingType: 'follow_up',
    overall_score: 75,
    grade: 'B',
    metric_scores: {
      talk_ratio: {
        score: 88,
        weight: 25,
        notes: 'Rep at 38% talk time — ideal balance for a check-in call. Prospect drove much of the content.',
      },
      discovery_questions: {
        score: 72,
        weight: 25,
        notes: '5 questions asked — appropriate for a check-in. Good use of open questions to surface the org change and stakeholder shift.',
      },
      next_steps: {
        score: 90,
        weight: 25,
        notes: 'Four clear action items agreed: one-pager update, payment timing check, Marcus intro meeting, Jamie reference request.',
      },
      monologue_detection: {
        score: 100,
        weight: 25,
        notes: 'No monologues detected. Excellent conversational pacing throughout.',
      },
    },
    talk_time_rep_pct: 38,
    talk_time_customer_pct: 62,
    discovery_questions_count: 5,
    discovery_questions_examples: [
      'What happened?',
      'Does Marcus\'s arrival affect the timeline on this decision?',
      'What\'s your read on him?',
      'Did Jamie notice any specific deals move because of it?',
      'What else do I need to know?',
    ],
    next_steps_established: true,
    next_steps_details: 'Rep: send updated one-page case study focused on deal-recovery use case by tomorrow; check with finance on first payment timing flexibility, respond by end of week. Prospect: reach out to Marcus about a first-week meeting; ask Jamie about sharing her trial experience.',
    strengths: [
      'Stayed calm and curious when the org change was revealed — no panic, no pressure',
      'Reframed the Marcus introduction as doing him a favour rather than asking for a meeting',
      'Recovered the trial feedback loop that had been left open — surfaced the Jamie success story',
      'Clean summary of all action items at the end of the call — no ambiguity on who does what',
    ],
    areas_for_improvement: [
      'The case study sent previously apparently wasn\'t read — consider a shorter format or a quick verbal summary next time',
      'Payment timing question could have been pre-answered before the call — adds a follow-up touchpoint that extends the cycle',
      'Didn\'t attempt to re-confirm the original timeline — opportunity to reset expectations after the delay',
    ],
    specific_feedback: 'This was a strong recovery call after three weeks of silence and a significant stakeholder change. Staying calm and reframing the Marcus introduction was exactly right. The one gap is that a pre-call check with your finance team on payment flexibility would have let you close that thread on the call rather than adding another follow-up touch.',
    coaching_tips: [
      'Before a follow-up call with a stalled deal, answer as many open questions as possible in advance so you can give answers on the call, not promises',
      'When an org change surfaces, map the new decision-making structure before the call ends — ask "who else needs to be involved now?"',
      'The Jamie success story is gold — get it in writing before the Marcus meeting so you have a one-paragraph peer reference ready',
    ],
    key_moments: [
      {
        timestamp_seconds: 95,
        type: 'positive',
        description: 'Prospect revealed org change — rep responded with curiosity, not concern',
        quote: 'We had a bit of an org change. Sarah — who was going to co-sign this — has moved into a different role.',
      },
      {
        timestamp_seconds: 480,
        type: 'positive',
        description: 'Rep reframed Marcus meeting as giving him early visibility rather than asking for approval',
        quote: 'You\'re doing him a favour by giving him visibility, not asking him to rubber-stamp something he didn\'t evaluate.',
      },
      {
        timestamp_seconds: 730,
        type: 'positive',
        description: 'Trial success story surfaced — deal-recovery use case confirmed with real outcome',
        quote: 'She sent the re-engagement email the system drafted and got a reply within an hour. That deal is still active.',
      },
      {
        timestamp_seconds: 1040,
        type: 'positive',
        description: 'Clean mutual action item summary — both sides clear on commitments',
        quote: 'I\'m going to send the updated one-pager, check on the payment timing question, and you\'re going to reach out to Marcus about a first-week meeting and ask Jamie if she\'ll share her experience.',
      },
    ],
    detected_meeting_type: 'follow_up',
  },

  // -------------------------------------------------------------------------
  // 5. CLOSING — Score 88 / A
  // -------------------------------------------------------------------------
  {
    meetingType: 'closing',
    overall_score: 88,
    grade: 'A',
    metric_scores: {
      talk_ratio: {
        score: 82,
        weight: 25,
        notes: 'Rep at 45% talk time — at the upper edge of ideal, appropriate for a closing call where terms need to be confirmed.',
      },
      discovery_questions: {
        score: 68,
        weight: 25,
        notes: '3 discovery questions — low count but appropriate for closing stage. Questions were well-targeted at remaining risks.',
      },
      next_steps: {
        score: 100,
        weight: 25,
        notes: 'Outstanding close: contract sent same afternoon, signature by end of day tomorrow, onboarding manager introduced on countersign.',
      },
      monologue_detection: {
        score: 100,
        weight: 25,
        notes: 'No monologues. Implementation timeline explanation was thorough but prospect questions kept it conversational.',
      },
    },
    talk_time_rep_pct: 45,
    talk_time_customer_pct: 55,
    discovery_questions_count: 3,
    discovery_questions_examples: [
      'Did you have any reactions coming into today?',
      'Who\'s our point of contact for implementation?',
      'Is there someone in legal who needs to review it before Marcus or [contact] signs?',
    ],
    next_steps_established: true,
    next_steps_details: 'Contract to be sent by 3pm today. Marcus to review and return signature by end of day tomorrow. On countersign, rep to introduce onboarding manager. First payment in 45 days. All 8 reps to be live before Q2 kickoff in 4 weeks.',
    strengths: [
      'Handled the data ownership question immediately and completely — no hedging',
      'Confirmed each commercial term verbally before the call ended — no ambiguity going into contract review',
      'The implementation timeline breakdown (week-by-week) gave Marcus the operational confidence to sign without involving legal',
      'Strong close: sent contract same day with a personal instruction to call directly with questions — reduced friction',
      'Framed company size as an advantage ("when something breaks, it matters to us personally")',
    ],
    areas_for_improvement: [
      'HubSpot architecture question was answered reactively — could have been pre-empted with a question at the start of the call',
      'Training materials question came late and slightly disrupted the close flow — consider covering this proactively',
    ],
    specific_feedback: 'Excellent closing call. You confirmed every commercial term verbally, handled the remaining technical concerns cleanly, and left Marcus and the prospect with complete confidence. The week-by-week implementation breakdown was the decisive moment — it turned an abstract Q2 deadline into a credible plan. Keep the "call me directly" instruction in every closing call.',
    coaching_tips: [
      'At the start of every closing call, ask "Are there any questions that have come up since we last spoke?" — surface surprises before they derail the close',
      'Have your implementation timeline slide or summary ready for every deal over $15k — it converts abstract commitments into concrete milestones',
      'The personal Slack channel offer builds trust disproportionate to its cost — make it a standard part of your close',
    ],
    key_moments: [
      {
        timestamp_seconds: 155,
        type: 'positive',
        description: 'VP of Revenue endorsed the AI-native approach — strategic alignment confirmed',
        quote: 'The workflow tools were built in a world where the rep was doing all the thinking. We assume the AI does the thinking and the rep does the approving.',
      },
      {
        timestamp_seconds: 280,
        type: 'positive',
        description: 'Data ownership handled cleanly and completely — major trust signal for new VP',
        quote: 'You own all your data — transcripts, emails, all of it. If you cancel, we export everything to CSV within seven days and then delete it from our systems.',
      },
      {
        timestamp_seconds: 780,
        type: 'positive',
        description: 'Week-by-week implementation breakdown made Q2 deadline feel achievable',
        quote: 'Week one, we get the integrations connected. Week two, we do the rep onboarding session. Week three is the first full week of live use.',
      },
      {
        timestamp_seconds: 1050,
        type: 'positive',
        description: 'Company size reframed as a service advantage — turned a potential concern into a strength',
        quote: 'We\'re a small company. When something breaks, it matters to us personally.',
      },
    ],
    detected_meeting_type: 'closing',
  },

  // -------------------------------------------------------------------------
  // 6. GENERAL — Score 65 / C
  // -------------------------------------------------------------------------
  {
    meetingType: 'general',
    overall_score: 65,
    grade: 'C',
    metric_scores: {
      talk_ratio: {
        score: 92,
        weight: 25,
        notes: 'Rep at 32% talk time — very good for a check-in. Prospect led the conversation naturally.',
      },
      discovery_questions: {
        score: 58,
        weight: 25,
        notes: '3 discovery questions. More probing on the outbound failure two years ago would have been valuable.',
      },
      next_steps: {
        score: 62,
        weight: 25,
        notes: 'Three next steps discussed but only one was immediately actionable. Beta access and customer intro lacked specific timelines.',
      },
      monologue_detection: {
        score: 50,
        weight: 25,
        notes: 'Two monologues around the outbound beta explanation. Product education sections should be more conversational.',
      },
    },
    talk_time_rep_pct: 32,
    talk_time_customer_pct: 68,
    discovery_questions_count: 3,
    discovery_questions_examples: [
      'What kind of crossroads?',
      'What killed it two years ago?',
      'Do you think it\'s a strategy problem, a data problem, or a rep mindset problem this time?',
    ],
    next_steps_established: true,
    next_steps_details: 'Rep to enable outbound research beta for the account and send the setup link for pipeline summary feature today. Rep to introduce customer using warm outbound successfully. Catch-up scheduled for next month after outbound beta trial.',
    strengths: [
      'Strong relationship — prospect opened up candidly about strategic challenges without prompting',
      'Listened for unarticulated needs — the pipeline summary feature connection was made because rep was paying attention',
      'Reframing outbound vs inbound as a spectrum ("high-intent cold") gave the prospect a new mental model',
      'Offered the beta without a hard sell — matched the tone of the conversation',
    ],
    areas_for_improvement: [
      'Next steps lacked specificity: "this week" and "next month" aren\'t dates — lock in actual calendar entries',
      'Didn\'t probe deeply enough on the previous outbound failure — missed a chance to understand what success would look like',
      'Beta access and customer intro could have been set up during the call rather than promised as follow-up',
    ],
    specific_feedback: 'This was a genuinely good relationship call — you listened well, made a useful feature connection, and added value without manufacturing a sales conversation. The gap is execution discipline: two of the three next steps are vague. Strong relationship calls lose their momentum if the follow-through isn\'t crisp.',
    coaching_tips: [
      'End every call — including relationship check-ins — with at least one next step that has a date attached',
      'When a customer reveals a strategic challenge, ask "what does success look like in 90 days?" before jumping to solution mode',
      'Enablement you can do live (turning on a feature, sending a link) should always happen during the call — it removes follow-up risk and shows competence',
    ],
    key_moments: [
      {
        timestamp_seconds: 420,
        type: 'positive',
        description: 'Rep\'s diagnosis of the outbound failure hit the nail on the head — prospect visibly aligned',
        quote: 'Nobody half-asses something they believe in. It becomes a self-fulfilling prophecy.',
      },
      {
        timestamp_seconds: 890,
        type: 'coaching',
        description: 'Beta explanation ran long without confirming prospect interest level first',
        quote: 'Short answer — yes, but it\'s not the primary use case today. We can pull company context and build an outreach brief for a cold prospect.',
      },
      {
        timestamp_seconds: 1120,
        type: 'positive',
        description: 'Prospect-led reframe of outbound vs inbound created genuine insight moment',
        quote: 'That\'s actually a better framing than outbound versus inbound. It\'s more of a spectrum.',
      },
      {
        timestamp_seconds: 1350,
        type: 'positive',
        description: 'Pipeline summary feature introduced reactively but with immediate impact — 20 minutes saved every Monday',
        quote: 'Seriously? That would save me every single Monday.',
      },
    ],
    detected_meeting_type: 'general',
  },
];

// ---------------------------------------------------------------------------
// Structured Summary Templates
// ---------------------------------------------------------------------------

export const STRUCTURED_SUMMARY_TEMPLATES: StructuredSummaryTemplate[] = [
  // -------------------------------------------------------------------------
  // 1. DISCOVERY
  // -------------------------------------------------------------------------
  {
    meetingType: 'discovery',
    key_decisions: [
      {
        decision: 'Both parties agreed to proceed to a product demo as the next step',
        context: 'Rep to set up demo focused on follow-up automation and meeting prep for a team of 8–12 reps using HubSpot',
        importance: 'high',
      },
      {
        decision: 'VP of Sales (Sarah) to be included in the demo call for sign-off authority',
        context: 'Deals over ~$20k annually require VP sign-off. Rep to ensure Sarah is on next call.',
        importance: 'high',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Send calendar link for demo within 24 hours',
        due_date: '+1',
        priority: 'high',
        expectation: 'Calendar link to be sent with a short prep note summarising the use cases discussed',
      },
      {
        commitment: 'Prepare a brief tailored to an 8–12 rep team on HubSpot with follow-up and prep use cases',
        due_date: '+2',
        priority: 'medium',
        expectation: 'Document to be shared before the demo so prospect can brief Sarah',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Get 30 minutes on Sarah\'s calendar within the next two weeks for the demo',
        due_date: '+14',
        priority: 'high',
        expectation: 'Prospect has discretion to agree but needs Sarah for final sign-off on deals over $20k',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Sarah',
        role: 'VP of Sales',
        concerns: ['Follow-up rates tracked obsessively', 'Estimated $400–500k ARR lost to no-follow-up', 'Needs to sign off on deals over $20k'],
        sentiment: 'neutral',
      },
    ],
    pricing_discussed: {
      mentioned: true,
      amount: '$15,000–$40,000',
      structure: 'Annual subscription, budget range shared by prospect',
      notes: 'Budget unfrozen specifically for sales productivity tooling after soft Q1 results',
    },
    technical_requirements: [
      {
        requirement: 'HubSpot integration — read deal records, contact history, notes',
        priority: 'high',
        notes: 'Prospect notes HubSpot data quality is poor — integration must handle stale/incomplete data gracefully',
      },
      {
        requirement: 'Calendar integration for automatic call detection',
        priority: 'high',
        notes: 'Mix of inbound (60%) and outbound (40%) calls — both need to be captured',
      },
    ],
    outcome_signals: {
      overall: 'positive',
      positive_signals: [
        'Budget confirmed as unfrozen for sales productivity tooling',
        'Prospect quantified pain: $400–500k estimated ARR slippage',
        'Genuine urgency — Q1 miss created internal appetite for change',
        'Prospect agreed to next step and will brief VP proactively',
      ],
      negative_signals: [
        'VP of Sales not yet engaged — deal not confirmed until she is involved',
      ],
      next_steps: [
        'Rep sends calendar link for demo with Sarah within 24 hours',
        'Prospect books 30 minutes with Sarah within 2 weeks',
        'Demo to focus on follow-up automation and meeting prep for HubSpot stack',
      ],
      forward_movement: false,
    },
    stage_indicators: {
      detected_stage: 'discovery',
      confidence: 0.92,
      signals: [
        'Pain exploration dominated the conversation',
        'No pricing commitment or proposal requested',
        'Decision-maker not present — evaluation at champion level',
        'Next step is a demo, not a contract review',
      ],
    },
    competitor_mentions: [
      {
        name: 'Gong',
        context: 'Evaluated but dismissed as built for larger enterprise teams — felt like overkill',
        sentiment: 'negative',
      },
      {
        name: 'Salesloft',
        context: 'Briefly reviewed — too many features the team would never use',
        sentiment: 'negative',
      },
    ],
    objections: [],
  },

  // -------------------------------------------------------------------------
  // 2. DEMO
  // -------------------------------------------------------------------------
  {
    meetingType: 'demo',
    key_decisions: [
      {
        decision: 'VP of Sales endorsed running a two-week trial with 2–3 real reps on live deals',
        context: 'Trial format proposed by rep; VP co-signed on the call — significant buying signal from a self-described skeptic',
        importance: 'high',
      },
      {
        decision: 'Trial will use real accounts — not a sandbox environment',
        context: 'VP specifically requested real reps on live deals, not a demo environment. Rep confirmed this is the standard trial format.',
        importance: 'high',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Coordinate trial setup with 2–3 volunteer reps and connect their real accounts',
        due_date: '+3',
        priority: 'high',
        expectation: 'Rep to send trial onboarding steps and identify which reps will participate',
      },
      {
        commitment: 'Follow up with call timing details for trial kickoff',
        due_date: '+2',
        priority: 'high',
        expectation: 'Confirm timing details in a follow-up message or call after the demo',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Identify 2–3 reps willing to participate in the trial on live deals',
        due_date: '+3',
        priority: 'high',
        expectation: 'Prospect confident two reps can be recruited easily',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Sarah',
        role: 'VP of Sales',
        concerns: ['AI email quality — wants context-specific not generic drafts', 'Rep adoption — needs tool the reps will actually use', 'Pricing at team size'],
        sentiment: 'positive',
      },
    ],
    pricing_discussed: {
      mentioned: true,
      amount: '$22,000',
      structure: 'Per seat, 8 reps, all-in annual — scales at same per-seat rate to 12 reps',
      notes: 'Prospect noted this was at the lower end of the range discussed in discovery. VP asked about per-seat vs flat fee.',
    },
    technical_requirements: [
      {
        requirement: 'HubSpot read-write integration — optional logging of sent emails back into deal record',
        priority: 'medium',
        notes: 'Rep confirmed this is configurable — read-only by default, write-back optional',
      },
      {
        requirement: 'Calendar integration for automatic transcript capture',
        priority: 'high',
        notes: 'Can integrate with existing notetaker or use own recording capability',
      },
      {
        requirement: 'Slack notification for follow-up drafts',
        priority: 'medium',
        notes: 'Rep or email delivery — rep preference. Prospect team uses Slack.',
      },
    ],
    outcome_signals: {
      overall: 'positive',
      positive_signals: [
        'VP of Sales self-described as skeptic but ended positively',
        'Trial agreed with VP co-sign — strong momentum',
        'Pricing acknowledged as at lower end of expected range',
        'Both attendees engaged throughout — no disengagement signals',
        'VP asked operational questions (implementation, reps per trial) indicating real evaluation intent',
      ],
      negative_signals: [
        'Trial logistics (rep selection, deal selection) not finalised on the call',
      ],
      next_steps: [
        'Rep to send trial onboarding details and coordinate rep selection',
        'Prospect to identify 2–3 trial reps',
        'Trial kickoff call to be booked',
      ],
      forward_movement: true,
    },
    stage_indicators: {
      detected_stage: 'demo',
      confidence: 0.95,
      signals: [
        'Full product walkthrough with both champion and decision-maker present',
        'Pricing discussed and acknowledged positively',
        'Trial with real accounts agreed — commitment to evaluate',
        'VP of Sales engaged and co-signed next step',
      ],
    },
    competitor_mentions: [
      {
        name: 'Gong',
        context: 'Mentioned by VP in context of deal re-engagement feature — said Gong\'s version was a manager report, not a rep tool. Rep differentiated effectively.',
        sentiment: 'neutral',
      },
    ],
    objections: [
      {
        objection: 'AI-drafted emails have been generic in previous tools',
        response: 'Rep demonstrated a live email draft that referenced the specific objection from the prospect\'s transcript — contextual, not templated',
        resolved: true,
        category: 'need',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 3. NEGOTIATION
  // -------------------------------------------------------------------------
  {
    meetingType: 'negotiation',
    key_decisions: [
      {
        decision: 'Deal agreed: $22,000 annual, 8 seats, quarterly billing ($5,500/quarter), 60-day exit clause, 12-month rate lock on additional seats',
        context: 'All commercial terms verbally agreed. Rep to send updated proposal same afternoon. Legal to review 60-day exit clause language.',
        importance: 'high',
      },
      {
        decision: 'Monthly billing option declined — annual with quarterly split chosen instead',
        context: 'Monthly billing would have cost ~$24k (10% premium). Quarterly billing at annual price agreed as the middle ground.',
        importance: 'medium',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Send updated proposal with quarterly payments and 60-day exit clause by end of day',
        due_date: '+0',
        priority: 'high',
        expectation: 'Proposal to include clean, simple exit clause language for legal review',
      },
      {
        commitment: 'Turn around legal redlines quickly if submitted',
        due_date: '+2',
        priority: 'high',
        expectation: 'Rep to review redlines directly and respond fast — no delays on exit clause language',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Return signed contract by Friday',
        due_date: '+4',
        priority: 'high',
        expectation: 'Prospect to loop in legal person to review exit clause language. Verbal commitment to sign by Friday given.',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Sarah',
        role: 'VP of Sales',
        concerns: ['Annual price above initial target of $18k', 'Cash flow — prefers smaller payment intervals'],
        sentiment: 'neutral',
      },
      {
        name: 'Finance contact (unnamed)',
        role: 'Finance',
        concerns: ['Quarterly payment structure preferred for cash flow management'],
        sentiment: 'neutral',
      },
      {
        name: 'Legal contact (unnamed)',
        role: 'Legal',
        concerns: ['Will need to review 60-day exit clause language'],
        sentiment: 'neutral',
      },
    ],
    pricing_discussed: {
      mentioned: true,
      amount: '$22,000',
      structure: 'Annual price, quarterly billing ($5,500 x4), 60-day exit clause, 12-month rate lock on seat expansion',
      objections: [
        'VP wanted price at $18k — identified as a target, not a hard ceiling',
        'Prospect requested six-month contract term — rejected; 60-day exit clause offered instead',
        'Monthly billing requested — declined due to 10% premium; quarterly agreed at annual rate',
      ],
      notes: 'Headline price held at $22k. All three concessions were structural rather than price reductions.',
    },
    technical_requirements: [],
    outcome_signals: {
      overall: 'positive',
      positive_signals: [
        'Verbal agreement on all commercial terms',
        'Prospect to involve legal — indicates intent to finalise, not delay',
        'Quarterly billing removes cash flow objection',
        'Exit clause removes commitment anxiety — lowers barrier to sign',
      ],
      negative_signals: [
        'Legal review adds a day or two before signature — minor cycle extension',
      ],
      next_steps: [
        'Rep sends updated proposal by end of day today',
        'Prospect loops in legal to review exit clause language',
        'Signature returned by Friday',
        'Onboarding to begin following week',
      ],
      forward_movement: true,
    },
    stage_indicators: {
      detected_stage: 'negotiation',
      confidence: 0.97,
      signals: [
        'Specific price points and alternatives discussed',
        'Contract terms reviewed line by line',
        'Legal involvement confirmed',
        'Signature timeline agreed',
      ],
    },
    competitor_mentions: [],
    objections: [
      {
        objection: '$22,000 is too high — VP of Sales targeting $18k or under',
        response: 'Rep identified $18k as a negotiating target, not a ceiling. Offered quarterly billing and price-lock instead of reducing headline price.',
        resolved: true,
        category: 'budget',
      },
      {
        objection: '12-month contract feels too long given only a 2-week trial',
        response: 'Rep offered a 60-day exit clause at no extra cost as a confidence signal — "I\'m not trying to lock you in."',
        resolved: true,
        category: 'timeline',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 4. FOLLOW-UP
  // -------------------------------------------------------------------------
  {
    meetingType: 'follow_up',
    key_decisions: [
      {
        decision: 'Decision deferred until new VP of Revenue (Marcus) can review the deal in his first week',
        context: 'Sarah moved into a different role. Marcus starts in 3 weeks. Prospect has been advised not to commit over $15k before Marcus reviews.',
        importance: 'high',
      },
      {
        decision: 'Rep to send a shorter, refocused case study on the deal-recovery use case for Marcus to review',
        context: 'Original case study was received but not read. New version to be one page, easy to forward.',
        importance: 'medium',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Send updated one-page case study focused on deal-recovery use case by tomorrow',
        due_date: '+1',
        priority: 'high',
        expectation: 'Shorter format, easy to forward to Marcus as a standalone brief',
      },
      {
        commitment: 'Check with finance on 6-week payment delay flexibility and respond by end of week',
        due_date: '+4',
        priority: 'medium',
        expectation: 'Finance has flagged quarterly billing start — prospect wants first payment in new quarter (6 weeks). Rep can likely accommodate ~30 days.',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Reach out to Marcus before he starts to propose a first-week intro meeting',
        due_date: '+14',
        priority: 'high',
        expectation: 'Prospect to frame it as giving Marcus early visibility, not seeking sign-off on an existing decision',
      },
      {
        commitment: 'Ask Jamie (trial rep) if she\'ll share her trial experience with Marcus',
        due_date: '+7',
        priority: 'medium',
        expectation: 'Jamie successfully used the re-engagement feature and recovered an active deal — strong peer reference',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Marcus',
        role: 'Incoming VP of Revenue',
        concerns: ['Will review all vendor commitments over $15k', 'Came from Salesloft-heavy environment — may have existing preferences'],
        sentiment: 'neutral',
      },
      {
        name: 'Sarah',
        role: 'Former VP of Sales (now in different role)',
        concerns: [],
        sentiment: 'neutral',
      },
      {
        name: 'Jamie',
        role: 'Account Executive (trial participant)',
        concerns: [],
        sentiment: 'positive',
      },
      {
        name: 'Finance contact (unnamed)',
        role: 'Finance',
        concerns: ['First payment timing — wants it to land in new quarter (6 weeks)'],
        sentiment: 'neutral',
      },
    ],
    pricing_discussed: { mentioned: false },
    technical_requirements: [],
    outcome_signals: {
      overall: 'neutral',
      positive_signals: [
        'Prospect was "ready to go" before the org change — still motivated',
        'Trial feedback positive: Jamie saved 2+ hours/week and recovered an active deal',
        'Prospect proactively volunteered to reach out to Marcus before he starts',
      ],
      negative_signals: [
        'New VP from Salesloft background — potential competitor preference to overcome',
        'Decision effectively delayed 4–5 weeks pending Marcus review',
      ],
      next_steps: [
        'Rep sends updated one-pager by tomorrow',
        'Rep checks payment timing flexibility by end of week',
        'Prospect reaches out to Marcus this week',
        'Prospect asks Jamie about sharing trial success story',
        'Intro meeting with Marcus in his first week (3+ weeks out)',
      ],
      forward_movement: true,
    },
    stage_indicators: {
      detected_stage: 'follow_up',
      confidence: 0.88,
      signals: [
        'Stakeholder change disclosed — deal re-qualifying with new decision-maker',
        'Trial has been completed — evaluation stage is done',
        'No pricing objections on call — commercial terms previously agreed',
        'Focus on internal navigation rather than product evaluation',
      ],
    },
    competitor_mentions: [
      {
        name: 'Salesloft',
        context: 'Marcus came from a company that used Salesloft heavily. Prospect believes he\'s open to alternatives but his background is a risk factor.',
        sentiment: 'negative',
      },
    ],
    objections: [],
  },

  // -------------------------------------------------------------------------
  // 5. CLOSING
  // -------------------------------------------------------------------------
  {
    meetingType: 'closing',
    key_decisions: [
      {
        decision: 'Marcus (VP of Revenue) confirmed intent to sign contract without involving legal for a $22k deal',
        context: 'Marcus stated he can sign contracts of this size himself if the language is clean. No legal review required.',
        importance: 'high',
      },
      {
        decision: 'Go-live target confirmed: all 8 reps live before Q2 kickoff in 4 weeks',
        context: 'Rep confirmed the 4-week implementation timeline is achievable. Week-by-week plan reviewed and accepted.',
        importance: 'high',
      },
      {
        decision: 'First payment delayed 45 days from contract signature (matching prospect\'s cash flow request)',
        context: 'Rep confirmed with finance team pre-call — 45 days accommodated. Prospect had requested 6 weeks; 45 days is close enough.',
        importance: 'medium',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Send final contract by 3pm today',
        due_date: '+0',
        priority: 'high',
        expectation: 'Clean language on 60-day exit clause, quarterly billing, 45-day first payment delay all confirmed in writing',
      },
      {
        commitment: 'Introduce dedicated onboarding manager immediately on countersign',
        due_date: '+1',
        priority: 'high',
        expectation: 'Onboarding manager to own the relationship through the first 60 days of live use',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Marcus to review contract and return signature by end of day tomorrow',
        due_date: '+1',
        priority: 'high',
        expectation: 'Marcus confirmed he will read it himself and can sign at this deal size without legal',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Marcus',
        role: 'VP of Revenue',
        concerns: ['Data ownership and portability', 'HubSpot architecture rebuild compatibility', 'Implementation timeline vs Q2 kickoff', 'Contract signing authority'],
        sentiment: 'positive',
      },
    ],
    pricing_discussed: {
      mentioned: true,
      amount: '$22,000',
      structure: '8 seats, annual price, quarterly billing ($5,500 x4), first payment in 45 days, 60-day exit clause, 12-month rate lock',
      notes: 'All terms confirmed verbally. No new pricing objections. Marcus acknowledged terms are fair.',
    },
    technical_requirements: [
      {
        requirement: 'HubSpot API compatibility during architectural rebuild',
        priority: 'high',
        notes: 'Rep confirmed API-based integration is resilient to record structure changes — re-mapping is a 20-minute conversation, not a re-implementation',
      },
    ],
    outcome_signals: {
      overall: 'positive',
      positive_signals: [
        'Marcus confirmed intent to sign without legal involvement',
        'Q2 kickoff deadline creates urgency — implementation timeline confirmed as achievable',
        'All commercial terms confirmed verbally on the call',
        'Marcus endorsed the AI-native philosophy — strategic alignment',
        'Both prospect and Marcus expressed enthusiasm at close',
        'Data ownership concerns resolved cleanly — no remaining trust barriers',
      ],
      negative_signals: [],
      next_steps: [
        'Rep sends contract by 3pm today',
        'Marcus reviews and signs by end of day tomorrow',
        'Rep introduces onboarding manager on countersign',
        'Week 1: integrations connected',
        'Week 2: rep onboarding session',
        'Week 3: first week live',
        'Week 4: full independence with background monitoring',
      ],
      forward_movement: true,
    },
    stage_indicators: {
      detected_stage: 'closing',
      confidence: 0.98,
      signals: [
        'All commercial terms reviewed and verbally agreed',
        'Decision-maker confirmed signing authority and timeline',
        'Implementation plan reviewed in detail',
        'No remaining objections or open questions',
      ],
    },
    competitor_mentions: [
      {
        name: 'Salesloft',
        context: 'Marcus referenced extensive experience with Salesloft and Outreach at prior companies — contrasted favourably with the AI-native approach being discussed',
        sentiment: 'neutral',
      },
    ],
    objections: [],
  },

  // -------------------------------------------------------------------------
  // 6. GENERAL
  // -------------------------------------------------------------------------
  {
    meetingType: 'general',
    key_decisions: [
      {
        decision: 'Rep to enable outbound research beta feature for the account',
        context: 'Customer asked about outbound prospecting briefs. Beta feature is available but rough — rep agreed to enable it for one rep (Jamie) to test.',
        importance: 'medium',
      },
      {
        decision: 'Pipeline summary feature to be set up for customer today',
        context: 'Customer was unaware the pipeline summary feature existed. It directly solves a weekly manual pain point. Rep to send setup link same day.',
        importance: 'high',
      },
    ],
    rep_commitments: [
      {
        commitment: 'Enable outbound research beta for the account this week',
        due_date: '+3',
        priority: 'medium',
        expectation: 'Beta access confirmed for Jamie. Rep to enable and notify customer.',
      },
      {
        commitment: 'Send pipeline summary feature setup link today',
        due_date: '+0',
        priority: 'high',
        expectation: 'Takes ~10 minutes to set up. Customer to handle themselves with the link.',
      },
      {
        commitment: 'Introduce customer to another customer using warm outbound successfully',
        due_date: '+7',
        priority: 'medium',
        expectation: 'Peer-to-peer introduction — 15-minute call, no agenda, just learning exchange',
      },
    ],
    prospect_commitments: [
      {
        commitment: 'Have Jamie test the outbound research beta on a warm prospect',
        due_date: '+14',
        priority: 'medium',
        expectation: 'Feedback to be shared at next month\'s check-in call',
      },
    ],
    stakeholders_mentioned: [
      {
        name: 'Marcus',
        role: 'VP of Revenue',
        concerns: ['Requests weekly pipeline update — currently manual process', 'Bullish on outbound motion'],
        sentiment: 'neutral',
      },
      {
        name: 'Jamie',
        role: 'Account Executive',
        concerns: [],
        sentiment: 'positive',
      },
    ],
    pricing_discussed: { mentioned: false },
    technical_requirements: [
      {
        requirement: 'Pipeline summary feature integration with HubSpot deal data',
        priority: 'high',
        notes: 'Pulls deal stage, activity recency, and at-risk flags. Setup via self-serve link.',
      },
    ],
    outcome_signals: {
      overall: 'neutral',
      positive_signals: [
        'Customer proactively asked about expanding use case to outbound — growth signal',
        'Pipeline summary feature is an immediate win — removes a weekly manual task',
        'Customer trusts rep enough to discuss strategic challenges openly',
      ],
      negative_signals: [],
      next_steps: [
        'Rep sends pipeline summary setup link today',
        'Rep enables outbound beta this week',
        'Rep makes peer customer introduction within 7 days',
        'Monthly check-in scheduled for next month with outbound beta results',
      ],
      forward_movement: false,
    },
    stage_indicators: {
      detected_stage: 'general',
      confidence: 0.85,
      signals: [
        'Existing customer — no evaluation context',
        'Strategic conversation rather than sales or product discussion',
        'Expansion opportunity identified but not pursued formally',
        'Relationship maintenance call with incidental product discovery',
      ],
    },
    competitor_mentions: [],
    objections: [],
  },
];

// ---------------------------------------------------------------------------
// Action Item Templates
// keyed by meetingType, 2–4 items each
// ---------------------------------------------------------------------------

export const ACTION_ITEM_TEMPLATES: Record<string, ActionItemTemplate[]> = {
  discovery: [
    {
      title: 'Send demo calendar link with prep note covering follow-up automation and meeting prep use cases',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'follow_up',
      deadlineOffsetDays: 1,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Prepare one-page overview tailored to 8–12 rep HubSpot team for VP of Sales review',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'preparation',
      deadlineOffsetDays: 2,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
    {
      title: 'Book 30 minutes with VP of Sales for the product demo',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'high',
      category: 'follow_up',
      deadlineOffsetDays: 7,
      is_sales_rep_task: false,
      importance: 'high',
      ai_generated: true,
    },
  ],

  demo: [
    {
      title: 'Send trial onboarding steps and identify which reps will participate in the two-week live trial',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'follow_up',
      deadlineOffsetDays: 2,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Confirm trial timing and book trial kickoff call',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'follow_up',
      deadlineOffsetDays: 3,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Identify two volunteer reps to participate in trial on live deals',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'high',
      category: 'internal',
      deadlineOffsetDays: 3,
      is_sales_rep_task: false,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Share HubSpot field mapping documentation ahead of trial integration setup',
      assignee_name: '{{REP_NAME}}',
      priority: 'low',
      category: 'preparation',
      deadlineOffsetDays: 5,
      is_sales_rep_task: true,
      importance: 'low',
      ai_generated: true,
    },
  ],

  negotiation: [
    {
      title: 'Send updated proposal with quarterly billing schedule and 60-day exit clause language by end of day',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'proposal',
      deadlineOffsetDays: 0,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Review contract and return signed copy — loop in legal for exit clause review',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'high',
      category: 'contract',
      deadlineOffsetDays: 4,
      is_sales_rep_task: false,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Respond to any legal redlines on exit clause language within 24 hours',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'contract',
      deadlineOffsetDays: 5,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
  ],

  follow_up: [
    {
      title: 'Send one-page case study focused on deal-recovery use case — format for easy forwarding to new VP',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'follow_up',
      deadlineOffsetDays: 1,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Check with finance on 6-week first payment delay flexibility and respond',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'commercial',
      deadlineOffsetDays: 4,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
    {
      title: 'Reach out to incoming VP of Revenue before start date to propose a first-week intro call',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'high',
      category: 'stakeholder',
      deadlineOffsetDays: 7,
      is_sales_rep_task: false,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Ask Jamie (trial rep) if she is willing to share her trial success story with the incoming VP',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'medium',
      category: 'reference',
      deadlineOffsetDays: 5,
      is_sales_rep_task: false,
      importance: 'medium',
      ai_generated: true,
    },
  ],

  closing: [
    {
      title: 'Send final contract with quarterly billing, 45-day first payment, 60-day exit clause, and 12-month rate lock by 3pm today',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'contract',
      deadlineOffsetDays: 0,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Review and countersign contract — no legal review required at this deal size',
      assignee_name: '{{CONTACT_NAME}}',
      priority: 'high',
      category: 'contract',
      deadlineOffsetDays: 1,
      is_sales_rep_task: false,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Introduce dedicated onboarding manager by email immediately on countersign',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'onboarding',
      deadlineOffsetDays: 2,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Send rep quick-reference training cards before onboarding session in week two',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'onboarding',
      deadlineOffsetDays: 7,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
  ],

  general: [
    {
      title: 'Send pipeline summary feature setup link — will eliminate manual Monday pipeline report',
      assignee_name: '{{REP_NAME}}',
      priority: 'high',
      category: 'product',
      deadlineOffsetDays: 0,
      is_sales_rep_task: true,
      importance: 'high',
      ai_generated: true,
    },
    {
      title: 'Enable outbound research beta access for account and notify Jamie to begin testing',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'product',
      deadlineOffsetDays: 3,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
    {
      title: 'Introduce customer to peer currently using warm outbound feature successfully',
      assignee_name: '{{REP_NAME}}',
      priority: 'medium',
      category: 'customer_success',
      deadlineOffsetDays: 7,
      is_sales_rep_task: true,
      importance: 'medium',
      ai_generated: true,
    },
  ],
};
