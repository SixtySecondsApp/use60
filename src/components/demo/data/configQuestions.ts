// Demo configuration questions — graduated autonomy system
// 17 questions that the AI agent asks over days 2-30 to learn preferences

export type ConfigCategory =
  | 'revenue_pipeline'
  | 'daily_rhythm'
  | 'agent_behaviour'
  | 'methodology'
  | 'signals';

export type TriggerEvent =
  | 'morning_briefing_delivered'
  | 'meeting_processed'
  | 'crm_update_approved'
  | 'eod_synthesis_delivered'
  | 'risk_alert_fired'
  | 'coaching_digest_generated';

export type QuestionScope = 'org' | 'user';
export type AnswerChannel = 'slack' | 'in_app';

export interface ConfigOption {
  label: string;
  value: string;
  description?: string;
}

export interface ConfigQuestion {
  id: string;
  configKey: string;
  questionText: string;
  category: ConfigCategory;
  triggerEvent: TriggerEvent;
  priority: 'critical' | 'high' | 'medium' | 'low';
  options: ConfigOption[];
  scope: QuestionScope;
  followUpQuestion?: string;
  answer?: string;
  answeredAt?: string;
  channel?: AnswerChannel;
}

export const configQuestions: ConfigQuestion[] = [
  // ── ANSWERED (6 questions, days 2-11) ──────────────────────────
  {
    id: 'cq-001',
    configKey: 'briefing.delivery_time',
    questionText: 'What time should I deliver your morning briefing? I noticed you typically open Slack around 7:45 AM.',
    category: 'daily_rhythm',
    triggerEvent: 'morning_briefing_delivered',
    priority: 'critical',
    options: [
      { label: '7:00 AM', value: '07:00' },
      { label: '7:30 AM', value: '07:30' },
      { label: '8:00 AM', value: '08:00', description: 'Most popular with your team' },
      { label: '8:30 AM', value: '08:30' },
      { label: 'Custom time', value: 'custom' },
    ],
    scope: 'user',
    answer: '07:30',
    answeredAt: '2026-02-24T08:12:00Z', // Day 2
    channel: 'slack',
  },
  {
    id: 'cq-002',
    configKey: 'crm.auto_update_fields',
    questionText: 'After your DataFlow meeting, I drafted CRM updates for deal stage, next steps, and contact sentiment. Which fields should I update automatically vs. ask you first?',
    category: 'agent_behaviour',
    triggerEvent: 'meeting_processed',
    priority: 'critical',
    options: [
      { label: 'Auto-update all fields', value: 'all_auto', description: 'I\'ll update everything and notify you' },
      { label: 'Auto-update notes & next steps, ask for stage changes', value: 'partial', description: 'Recommended — stage changes affect forecasting' },
      { label: 'Ask me before any CRM update', value: 'all_manual' },
    ],
    scope: 'user',
    answer: 'partial',
    answeredAt: '2026-02-24T11:45:00Z', // Day 2
    channel: 'slack',
  },
  {
    id: 'cq-003',
    configKey: 'pipeline.risk_threshold',
    questionText: 'I flagged Apex Partners as at-risk because David Kim hasn\'t responded in 12 days. What\'s your threshold for flagging deal risk based on champion silence?',
    category: 'revenue_pipeline',
    triggerEvent: 'risk_alert_fired',
    priority: 'high',
    options: [
      { label: '7 days — flag early', value: '7', description: 'More alerts, catch issues sooner' },
      { label: '10 days — balanced', value: '10' },
      { label: '14 days — flag late', value: '14', description: 'Fewer alerts, may miss early signals' },
      { label: 'Depends on deal stage', value: 'stage_dependent', description: 'Tighter for late-stage deals' },
    ],
    scope: 'user',
    answer: 'stage_dependent',
    answeredAt: '2026-02-25T09:30:00Z', // Day 3
    channel: 'slack',
  },
  {
    id: 'cq-004',
    configKey: 'methodology.deal_qualification',
    questionText: 'I noticed you use MEDDPICC-style qualification in your discovery notes. Should I structure my deal analysis around MEDDPICC criteria?',
    category: 'methodology',
    triggerEvent: 'meeting_processed',
    priority: 'high',
    options: [
      { label: 'Yes — full MEDDPICC', value: 'meddpicc', description: 'Metrics, Economic Buyer, Decision Criteria/Process, Paper Process, Identify Pain, Champion, Competition' },
      { label: 'MEDDIC (without Paper Process)', value: 'meddic' },
      { label: 'BANT', value: 'bant', description: 'Budget, Authority, Need, Timeline' },
      { label: 'Custom framework', value: 'custom' },
    ],
    scope: 'org',
    answer: 'meddpicc',
    answeredAt: '2026-02-27T14:20:00Z', // Day 5
    channel: 'in_app',
  },
  {
    id: 'cq-005',
    configKey: 'eod.synthesis_detail',
    questionText: 'Your end-of-day synthesis — do you prefer a quick summary or detailed analysis? I can include competitive intelligence, next-day prep items, and coaching insights.',
    category: 'daily_rhythm',
    triggerEvent: 'eod_synthesis_delivered',
    priority: 'medium',
    options: [
      { label: 'Quick summary — 3 bullet points', value: 'brief' },
      { label: 'Standard — key events + action items', value: 'standard' },
      { label: 'Detailed — full analysis with coaching', value: 'detailed', description: 'Includes competitive intel + coaching tips' },
    ],
    scope: 'user',
    answer: 'detailed',
    answeredAt: '2026-02-28T17:50:00Z', // Day 6
    channel: 'slack',
  },
  {
    id: 'cq-006',
    configKey: 'signals.email_tracking',
    questionText: 'I detected that Maria Chen opened your proposal 4 times in 2 hours. Should I alert you immediately when contacts show high-engagement email signals, or batch them?',
    category: 'signals',
    triggerEvent: 'risk_alert_fired',
    priority: 'high',
    options: [
      { label: 'Immediate alert for high engagement', value: 'immediate', description: 'Real-time Slack DM when 3+ opens in 1 hour' },
      { label: 'Batch in morning/afternoon digest', value: 'batched' },
      { label: 'Only alert for at-risk deals', value: 'risk_only' },
    ],
    scope: 'user',
    answer: 'immediate',
    answeredAt: '2026-03-04T10:15:00Z', // Day 11
    channel: 'in_app',
  },

  // ── PENDING (11 questions, not yet answered) ───────────────────
  {
    id: 'cq-007',
    configKey: 'coaching.frequency',
    questionText: 'I\'ve been generating coaching insights after each meeting. Would you prefer weekly coaching digests instead, or keep the per-meeting format?',
    category: 'agent_behaviour',
    triggerEvent: 'coaching_digest_generated',
    priority: 'medium',
    options: [
      { label: 'Per-meeting coaching', value: 'per_meeting', description: 'Immediate feedback after each call' },
      { label: 'Weekly digest', value: 'weekly', description: 'Consolidated insights every Friday' },
      { label: 'Only when I ask', value: 'on_demand' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-008',
    configKey: 'pipeline.forecast_method',
    questionText: 'For pipeline forecasting, should I weight deals by your historical close rates per stage, or use the standard probability percentages?',
    category: 'revenue_pipeline',
    triggerEvent: 'eod_synthesis_delivered',
    priority: 'high',
    options: [
      { label: 'My historical close rates', value: 'historical', description: 'Based on your last 4 quarters: Discovery 15%, Proposal 45%, Negotiation 72%' },
      { label: 'Standard stage probabilities', value: 'standard' },
      { label: 'Blended (weighted average)', value: 'blended' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-009',
    configKey: 'agent.draft_emails',
    questionText: 'I can draft follow-up emails after meetings. Should I auto-draft and send after 2 hours, auto-draft for your review, or wait for you to ask?',
    category: 'agent_behaviour',
    triggerEvent: 'meeting_processed',
    priority: 'critical',
    options: [
      { label: 'Auto-draft and send after 2 hours', value: 'auto_send', description: 'Full autonomy — I\'ll CC you' },
      { label: 'Auto-draft for review', value: 'draft_review', description: 'I\'ll write it, you approve before sending' },
      { label: 'Only when I ask', value: 'on_demand' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-010',
    configKey: 'signals.competitor_mentions',
    questionText: 'When a prospect mentions a competitor in a meeting or email, should I immediately trigger a competitive analysis, or just log it?',
    category: 'signals',
    triggerEvent: 'meeting_processed',
    priority: 'medium',
    options: [
      { label: 'Immediate competitive analysis', value: 'immediate', description: 'Full battle card + counter-positioning' },
      { label: 'Log and include in EOD synthesis', value: 'eod' },
      { label: 'Just log it silently', value: 'silent' },
    ],
    scope: 'org',
  },
  {
    id: 'cq-011',
    configKey: 'crm.activity_logging',
    questionText: 'Should I auto-log all meeting activities (calls, emails, meetings) to the CRM, or only customer-facing activities?',
    category: 'agent_behaviour',
    triggerEvent: 'crm_update_approved',
    priority: 'medium',
    options: [
      { label: 'Log everything', value: 'all' },
      { label: 'Customer-facing only', value: 'external_only', description: 'Skip internal meetings and team emails' },
      { label: 'Let me choose per activity', value: 'manual' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-012',
    configKey: 'pipeline.stale_deal_action',
    questionText: 'When a deal has no activity for 21+ days, should I auto-draft a re-engagement email, escalate to your manager, or just flag it?',
    category: 'revenue_pipeline',
    triggerEvent: 'risk_alert_fired',
    priority: 'high',
    options: [
      { label: 'Auto-draft re-engagement email', value: 'auto_reengage' },
      { label: 'Flag and suggest next steps', value: 'flag_suggest' },
      { label: 'Escalate to manager after 30 days', value: 'escalate' },
      { label: 'Just flag it', value: 'flag_only' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-013',
    configKey: 'methodology.multi_thread_alert',
    questionText: 'Your DataFlow deal has 3 contacts engaged but no economic buyer identified. Should I alert you when deals reach Proposal stage without an identified economic buyer?',
    category: 'methodology',
    triggerEvent: 'crm_update_approved',
    priority: 'high',
    options: [
      { label: 'Yes — alert at Proposal stage', value: 'proposal' },
      { label: 'Alert at Discovery stage', value: 'discovery', description: 'Earlier intervention' },
      { label: 'Don\'t alert — I track this myself', value: 'none' },
    ],
    scope: 'org',
  },
  {
    id: 'cq-014',
    configKey: 'daily_rhythm.meeting_prep_timing',
    questionText: 'I currently send meeting prep 30 minutes before each call. Would you prefer more lead time?',
    category: 'daily_rhythm',
    triggerEvent: 'morning_briefing_delivered',
    priority: 'low',
    options: [
      { label: '15 minutes before', value: '15' },
      { label: '30 minutes before', value: '30' },
      { label: '1 hour before', value: '60' },
      { label: 'Include in morning briefing', value: 'morning', description: 'All prep delivered at once' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-015',
    configKey: 'signals.buying_committee_changes',
    questionText: 'I noticed a new VP of Engineering joined TechVault last week. Should I alert you when key personas change at accounts in your pipeline?',
    category: 'signals',
    triggerEvent: 'morning_briefing_delivered',
    priority: 'medium',
    options: [
      { label: 'Alert for all pipeline accounts', value: 'all_pipeline' },
      { label: 'Only for deals in Proposal+ stages', value: 'late_stage' },
      { label: 'Only for C-level changes', value: 'c_level' },
      { label: 'Don\'t track this', value: 'none' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-016',
    configKey: 'agent.overnight_processing',
    questionText: 'I can process overnight signals (email opens, LinkedIn views, news mentions) and have a digest ready by your morning briefing. Enable overnight processing?',
    category: 'agent_behaviour',
    triggerEvent: 'morning_briefing_delivered',
    priority: 'medium',
    options: [
      { label: 'Yes — full overnight processing', value: 'full', description: 'Email signals, social monitoring, news alerts' },
      { label: 'Email signals only', value: 'email_only' },
      { label: 'No overnight processing', value: 'none' },
    ],
    scope: 'user',
  },
  {
    id: 'cq-017',
    configKey: 'coaching.comparison_scope',
    questionText: 'For coaching insights, should I compare your metrics against the full sales team, just your tier (Enterprise), or only your own historical performance?',
    category: 'agent_behaviour',
    triggerEvent: 'coaching_digest_generated',
    priority: 'low',
    options: [
      { label: 'Full team comparison', value: 'full_team' },
      { label: 'Same-tier peers only', value: 'tier', description: 'Compare against other Enterprise AEs' },
      { label: 'My own historical performance', value: 'self', description: 'Track personal improvement only' },
    ],
    scope: 'user',
  },
] as const;

// ── Completeness Progression (day-by-day) ────────────────────────

export interface CompletenessDay {
  day: number;
  percentage: number;
  tier: 'onboarding' | 'learning' | 'calibrating' | 'autonomous' | 'expert';
  questionsAnswered: number;
  autoDetected: number; // patterns learned without explicit questions
}

export const completenessProgression: CompletenessDay[] = [
  { day: 1, percentage: 8, tier: 'onboarding', questionsAnswered: 0, autoDetected: 2 },
  { day: 2, percentage: 18, tier: 'onboarding', questionsAnswered: 2, autoDetected: 3 },
  { day: 3, percentage: 25, tier: 'learning', questionsAnswered: 3, autoDetected: 5 },
  { day: 4, percentage: 28, tier: 'learning', questionsAnswered: 3, autoDetected: 6 },
  { day: 5, percentage: 35, tier: 'learning', questionsAnswered: 4, autoDetected: 8 },
  { day: 6, percentage: 42, tier: 'learning', questionsAnswered: 5, autoDetected: 10 },
  { day: 7, percentage: 45, tier: 'learning', questionsAnswered: 5, autoDetected: 12 },
  { day: 8, percentage: 48, tier: 'calibrating', questionsAnswered: 5, autoDetected: 14 },
  { day: 9, percentage: 52, tier: 'calibrating', questionsAnswered: 5, autoDetected: 16 },
  { day: 10, percentage: 55, tier: 'calibrating', questionsAnswered: 5, autoDetected: 18 },
  { day: 11, percentage: 60, tier: 'calibrating', questionsAnswered: 6, autoDetected: 20 },
  { day: 12, percentage: 63, tier: 'calibrating', questionsAnswered: 6, autoDetected: 22 },
  { day: 14, percentage: 68, tier: 'calibrating', questionsAnswered: 6, autoDetected: 26 },
  { day: 16, percentage: 72, tier: 'autonomous', questionsAnswered: 6, autoDetected: 30 },
  { day: 18, percentage: 76, tier: 'autonomous', questionsAnswered: 6, autoDetected: 33 },
  { day: 20, percentage: 80, tier: 'autonomous', questionsAnswered: 6, autoDetected: 36 },
  { day: 22, percentage: 83, tier: 'autonomous', questionsAnswered: 6, autoDetected: 39 },
  { day: 25, percentage: 87, tier: 'autonomous', questionsAnswered: 6, autoDetected: 43 },
  { day: 28, percentage: 91, tier: 'expert', questionsAnswered: 6, autoDetected: 47 },
  { day: 30, percentage: 94, tier: 'expert', questionsAnswered: 6, autoDetected: 50 },
];

// Helper to get questions by status
export const getAnsweredQuestions = () =>
  configQuestions.filter((q) => q.answer !== undefined);

export const getPendingQuestions = () =>
  configQuestions.filter((q) => q.answer === undefined);

export const getQuestionsByCategory = (category: ConfigCategory) =>
  configQuestions.filter((q) => q.category === category);
