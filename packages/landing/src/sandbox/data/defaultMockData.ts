/**
 * Default Mock Data for Sandbox
 *
 * Provides a realistic demo dataset when no research data is available.
 * Used as the base template — generatePersonalizedData() overlays visitor-specific data on top.
 */

import type {
  SandboxUser,
  SandboxOrg,
  SandboxCompany,
  SandboxContact,
  SandboxDeal,
  SandboxMeeting,
  SandboxActivity,
  SandboxKPIs,
  SandboxEmailDraft,
  SandboxSlackMessage,
  SandboxMeetingPrep,
  SandboxProposal,
  SandboxData,
} from './sandboxTypes';
// SandboxMetricCard used within SandboxKPIs.metrics array

// ─── Current User (fallback when not personalized) ──────────────
export const defaultUser: SandboxUser = {
  id: 'user-demo-001',
  full_name: 'You',
  email: 'you@yourcompany.com',
  initials: 'YO',
};

export const defaultOrg: SandboxOrg = {
  id: 'org-demo-001',
  name: 'Your Company',
  currency_symbol: '$',
};

// ─── Companies ──────────────────────────────────────────────────
export const defaultCompanies: SandboxCompany[] = [
  {
    id: 'company-visitor',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Technology',
    size: '51-200',
    location: 'San Francisco, CA',
    isVisitorCompany: true,
  },
  {
    id: 'company-002',
    name: 'Northstar Analytics',
    domain: 'northstaranalytics.com',
    industry: 'Data & Analytics',
    size: '11-50',
    location: 'New York, NY',
  },
  {
    id: 'company-003',
    name: 'Greenfield Partners',
    domain: 'greenfieldpartners.com',
    industry: 'Consulting',
    size: '11-50',
    location: 'London, UK',
  },
  {
    id: 'company-004',
    name: 'Velocity SaaS',
    domain: 'velocitysaas.io',
    industry: 'Software',
    size: '201-1000',
    location: 'Austin, TX',
  },
  {
    id: 'company-005',
    name: 'Summit Health',
    domain: 'summithealth.co',
    industry: 'Healthcare',
    size: '51-200',
    location: 'Boston, MA',
  },
];

// ─── Contacts ───────────────────────────────────────────────────
export const defaultContacts: SandboxContact[] = [
  // Visitor company contacts
  {
    id: 'contact-001',
    first_name: 'Sarah',
    last_name: 'Chen',
    email: 'sarah.chen@acme.com',
    title: 'VP of Sales',
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    engagement_level: 'hot',
    last_interaction_at: daysAgo(1),
    isVisitor: true,
  },
  {
    id: 'contact-002',
    first_name: 'James',
    last_name: 'Park',
    email: 'james.park@acme.com',
    title: 'Head of Revenue Operations',
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(3),
  },
  {
    id: 'contact-003',
    first_name: 'Maria',
    last_name: 'Rodriguez',
    email: 'maria@acme.com',
    title: 'CEO',
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(7),
  },
  // Other company contacts
  {
    id: 'contact-004',
    first_name: 'Tom',
    last_name: 'Wilson',
    email: 'tom@northstaranalytics.com',
    title: 'CRO',
    company_id: 'company-002',
    company_name: 'Northstar Analytics',
    engagement_level: 'hot',
    last_interaction_at: daysAgo(2),
  },
  {
    id: 'contact-005',
    first_name: 'Emily',
    last_name: 'Brooks',
    email: 'emily@greenfieldpartners.com',
    title: 'Managing Director',
    company_id: 'company-003',
    company_name: 'Greenfield Partners',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(5),
  },
  {
    id: 'contact-006',
    first_name: 'Ryan',
    last_name: 'Patel',
    email: 'ryan.patel@velocitysaas.io',
    title: 'VP Engineering',
    company_id: 'company-004',
    company_name: 'Velocity SaaS',
    engagement_level: 'cold',
    last_interaction_at: daysAgo(14),
  },
  {
    id: 'contact-007',
    first_name: 'Lisa',
    last_name: 'Nguyen',
    email: 'lisa@summithealth.co',
    title: 'Director of Operations',
    company_id: 'company-005',
    company_name: 'Summit Health',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(4),
  },
  {
    id: 'contact-008',
    first_name: 'David',
    last_name: 'Kim',
    email: 'david.kim@velocitysaas.io',
    title: 'Head of Product',
    company_id: 'company-004',
    company_name: 'Velocity SaaS',
    engagement_level: 'cold',
    last_interaction_at: daysAgo(21),
  },
  {
    id: 'contact-009',
    first_name: 'Anna',
    last_name: 'Kowalski',
    email: 'anna@greenfieldpartners.com',
    title: 'Partner',
    company_id: 'company-003',
    company_name: 'Greenfield Partners',
    engagement_level: 'hot',
    last_interaction_at: daysAgo(1),
  },
  {
    id: 'contact-010',
    first_name: 'Marcus',
    last_name: 'Johnson',
    email: 'marcus@northstaranalytics.com',
    title: 'Head of Sales',
    company_id: 'company-002',
    company_name: 'Northstar Analytics',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(6),
  },
  {
    id: 'contact-011',
    first_name: 'Rachel',
    last_name: 'Torres',
    email: 'rachel@summithealth.co',
    title: 'CTO',
    company_id: 'company-005',
    company_name: 'Summit Health',
    engagement_level: 'cold',
    last_interaction_at: daysAgo(30),
  },
  {
    id: 'contact-012',
    first_name: 'Kevin',
    last_name: 'Blake',
    email: 'kevin.blake@acme.com',
    title: 'Sales Manager',
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    engagement_level: 'warm',
    last_interaction_at: daysAgo(2),
  },
];

// ─── Deals ──────────────────────────────────────────────────────
export const defaultDeals: SandboxDeal[] = [
  {
    id: 'deal-visitor',
    name: 'Acme Corp — Platform License',
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    company_domain: 'acme.com',
    value: 95000,
    stage: 'proposal',
    stage_color: '#8b5cf6',
    health_score: 72,
    health_status: 'warning',
    momentum_score: 15,
    probability: 65,
    owner_id: 'user-demo-001',
    owner_initials: 'YO',
    primary_contact_id: 'contact-001',
    primary_contact_name: 'Sarah Chen',
    expected_close_date: futureDate(21),
    days_in_stage: 4,
    risk_level: 'medium',
    risk_factors: ['Budget approval needs CEO sign-off', 'Champion is relatively new (6 months)'],
    next_steps: 'Send revised proposal with enterprise pricing tier',
    next_actions: ['Send revised proposal', 'Schedule CEO intro call'],
    relationship_health_status: 'healthy',
    contact_count: 4,
    created_at: daysAgo(28),
    isVisitorDeal: true,
  },
  {
    id: 'deal-002',
    name: 'Northstar Analytics — Annual Plan',
    company_id: 'company-002',
    company_name: 'Northstar Analytics',
    company_domain: 'northstaranalytics.com',
    value: 48000,
    stage: 'negotiation',
    stage_color: '#f59e0b',
    health_score: 85,
    health_status: 'healthy',
    momentum_score: 30,
    probability: 80,
    owner_id: 'user-demo-001',
    owner_initials: 'YO',
    primary_contact_id: 'contact-004',
    primary_contact_name: 'Tom Wilson',
    expected_close_date: futureDate(10),
    days_in_stage: 3,
    risk_level: 'low',
    risk_factors: [],
    next_steps: 'Final contract review with legal',
    next_actions: ['Send updated MSA', 'Schedule onboarding kickoff'],
    relationship_health_status: 'healthy',
    contact_count: 2,
    created_at: daysAgo(35),
  },
  {
    id: 'deal-003',
    name: 'Greenfield Partners — Consulting Package',
    company_id: 'company-003',
    company_name: 'Greenfield Partners',
    company_domain: 'greenfieldpartners.com',
    value: 120000,
    stage: 'qualified',
    stage_color: '#3b82f6',
    health_score: 58,
    health_status: 'warning',
    momentum_score: -5,
    probability: 40,
    owner_id: 'user-demo-001',
    owner_initials: 'YO',
    primary_contact_id: 'contact-005',
    primary_contact_name: 'Emily Brooks',
    expected_close_date: futureDate(45),
    days_in_stage: 12,
    risk_level: 'high',
    risk_factors: ['Stalled 12 days in qualified', 'Previously evaluated competitor'],
    next_steps: 'Schedule technical deep-dive with their ops team',
    next_actions: ['Schedule tech deep-dive', 'Share ROI calculator'],
    relationship_health_status: 'at_risk',
    contact_count: 2,
    created_at: daysAgo(42),
  },
  {
    id: 'deal-004',
    name: 'Velocity SaaS — Enterprise Expansion',
    company_id: 'company-004',
    company_name: 'Velocity SaaS',
    company_domain: 'velocitysaas.io',
    value: 210000,
    stage: 'lead',
    stage_color: '#6366f1',
    health_score: 45,
    health_status: 'critical',
    momentum_score: 0,
    probability: 20,
    owner_id: 'user-demo-001',
    owner_initials: 'YO',
    primary_contact_id: 'contact-006',
    primary_contact_name: 'Ryan Patel',
    expected_close_date: futureDate(60),
    days_in_stage: 8,
    risk_level: 'medium',
    risk_factors: ['Low engagement from contacts', 'No meeting scheduled'],
    next_steps: 'Initial discovery call scheduled for Thursday',
    next_actions: ['Confirm discovery call', 'Send pre-call research'],
    relationship_health_status: 'critical',
    contact_count: 2,
    created_at: daysAgo(14),
  },
  {
    id: 'deal-005',
    name: 'Summit Health — Pilot Program',
    company_id: 'company-005',
    company_name: 'Summit Health',
    company_domain: 'summithealth.co',
    value: 35000,
    stage: 'closed_won',
    stage_color: '#10b981',
    health_score: 95,
    health_status: 'healthy',
    momentum_score: 50,
    probability: 100,
    owner_id: 'user-demo-001',
    owner_initials: 'YO',
    primary_contact_id: 'contact-007',
    primary_contact_name: 'Lisa Nguyen',
    expected_close_date: daysAgo(3),
    days_in_stage: 3,
    risk_level: 'low',
    risk_factors: [],
    next_steps: 'Onboarding kickoff next Monday',
    next_actions: ['Schedule onboarding', 'Send welcome pack'],
    relationship_health_status: 'healthy',
    contact_count: 2,
    created_at: daysAgo(50),
  },
];

// ─── Meetings ───────────────────────────────────────────────────
const visitorMeetingPrep: SandboxMeetingPrep = {
  company_overview:
    'Acme Corp is a mid-market technology company with 120 employees, growing 40% YoY. They currently use a fragmented sales stack (HubSpot + Calendly + Notion) and are looking to consolidate.',
  talking_points: [
    'Their sales team of 8 reps spends ~15 hours/week on admin — position 60 as the fix',
    'Competitor Gong was evaluated but deemed too expensive — emphasize our pricing advantage',
    'Sarah mentioned pipeline visibility as their #1 pain point in the last call',
    'They have a board meeting in 6 weeks — this creates natural urgency for a decision',
    'Their CTO is the technical blocker — offer a security review doc proactively',
  ],
  risk_signals: [
    'Budget approval needs CEO sign-off for deals over $50K',
    'They evaluated a competitor 3 months ago and paused — ask what changed',
    'Internal champion (Sarah) is relatively new (6 months) — validate her influence',
  ],
  questions_to_ask: [
    'What does your current follow-up process look like after a sales call?',
    'How are you tracking deal health and pipeline accuracy today?',
    'Who else needs to be involved in the decision before we can move forward?',
  ],
  deal_context:
    '$95K proposal stage, 65% probability. 4 days in current stage. Medium risk — needs revised pricing proposal.',
};

export const defaultMeetings: SandboxMeeting[] = [
  {
    id: 'meeting-001',
    title: 'Acme Corp — Platform Demo & Pricing Review',
    summary:
      'Walked through the full platform demo. Sarah was impressed with the meeting intelligence and follow-up automation. James had questions about CRM integration depth. Next step: send revised proposal with enterprise tier pricing.',
    meeting_start: futureDate(1, 14, 0),
    meeting_end: futureDate(1, 14, 45),
    duration_minutes: 45,
    attendees: [
      { name: 'Sarah Chen', title: 'VP of Sales', company: 'Acme Corp' },
      { name: 'James Park', title: 'Head of RevOps', company: 'Acme Corp' },
    ],
    company_id: 'company-visitor',
    company_name: 'Acme Corp',
    deal_id: 'deal-visitor',
    source: 'zoom',
    sentiment_score: 78,
    sentiment_label: 'positive',
    coach_rating: 82,
    talk_time_rep_pct: 40,
    talk_time_customer_pct: 60,
    talk_time_judgement: 'good',
    coach_summary: 'Strong discovery questions and good objection handling. Consider allowing more silence after asking about budget.',
    action_items: [
      { text: 'Send revised proposal with enterprise pricing', completed: false },
      { text: 'Schedule CEO intro call', completed: false },
      { text: 'Share ROI calculator', completed: true },
    ],
    summary_oneliner: 'Positive demo — pricing discussion needed, champion engaged.',
    next_steps_oneliner: 'Revised proposal due by Friday.',
    has_recording: true,
    talking_points: visitorMeetingPrep.talking_points,
    risk_signals: visitorMeetingPrep.risk_signals,
    prep: visitorMeetingPrep,
  },
  {
    id: 'meeting-002',
    title: 'Northstar Analytics — Contract Finalization',
    summary:
      'Reviewed final contract terms. Legal had minor redlines on data processing. Tom confirmed budget is approved. Expecting signed contract by Friday.',
    meeting_start: futureDate(2, 10, 0),
    meeting_end: futureDate(2, 10, 30),
    duration_minutes: 30,
    attendees: [
      { name: 'Tom Wilson', title: 'CRO', company: 'Northstar Analytics' },
    ],
    company_id: 'company-002',
    company_name: 'Northstar Analytics',
    deal_id: 'deal-002',
    source: 'fathom',
    sentiment_score: 88,
    sentiment_label: 'positive',
    coach_rating: 90,
    talk_time_rep_pct: 35,
    talk_time_customer_pct: 65,
    talk_time_judgement: 'good',
    coach_summary: 'Excellent listening skills. Good control of the conversation while letting the client lead on key topics.',
    action_items: [
      { text: 'Address legal redlines on DPA', completed: true },
      { text: 'Confirm onboarding date', completed: false },
    ],
    summary_oneliner: 'Contract nearly finalized — minor legal redlines remain.',
    next_steps_oneliner: 'Signed contract expected by Friday.',
    has_recording: true,
    next_actions: ['Send updated MSA with legal redlines addressed', 'Schedule onboarding kickoff for next week'],
  },
  {
    id: 'meeting-003',
    title: 'Greenfield Partners — Technical Deep-Dive',
    meeting_start: futureDate(3, 15, 0),
    meeting_end: futureDate(3, 16, 0),
    duration_minutes: 60,
    attendees: [
      { name: 'Emily Brooks', title: 'Managing Director', company: 'Greenfield Partners' },
      { name: 'Anna Kowalski', title: 'Partner', company: 'Greenfield Partners' },
    ],
    company_id: 'company-003',
    company_name: 'Greenfield Partners',
    deal_id: 'deal-003',
    source: 'google_meet',
    sentiment_score: 55,
    sentiment_label: 'neutral',
    coach_rating: 68,
    has_recording: false,
  },
  {
    id: 'meeting-004',
    title: 'Velocity SaaS — Discovery Call',
    meeting_start: futureDate(4, 11, 0),
    meeting_end: futureDate(4, 11, 30),
    duration_minutes: 30,
    attendees: [
      { name: 'Ryan Patel', title: 'VP Engineering', company: 'Velocity SaaS' },
    ],
    company_id: 'company-004',
    company_name: 'Velocity SaaS',
    deal_id: 'deal-004',
    source: 'teams',
    sentiment_score: 42,
    sentiment_label: 'challenging',
    has_recording: false,
  },
  {
    id: 'meeting-005',
    title: 'Summit Health — Onboarding Kickoff',
    summary: 'Covered platform setup, data import timeline, and team training schedule. Lisa excited to start.',
    meeting_start: daysAgo(2) as string,
    meeting_end: daysAgo(2) as string,
    duration_minutes: 45,
    attendees: [
      { name: 'Lisa Nguyen', title: 'Director of Operations', company: 'Summit Health' },
      { name: 'Rachel Torres', title: 'CTO', company: 'Summit Health' },
    ],
    company_id: 'company-005',
    company_name: 'Summit Health',
    deal_id: 'deal-005',
    source: '60_notetaker',
    sentiment_score: 92,
    sentiment_label: 'positive',
    coach_rating: 85,
    talk_time_rep_pct: 55,
    talk_time_customer_pct: 45,
    talk_time_judgement: 'high',
    coach_summary: 'Good energy but slightly dominated the conversation. Try asking more open questions during onboarding sessions.',
    action_items: [
      { text: 'Send integration guide', completed: false },
      { text: 'Schedule team training', completed: false },
      { text: 'Set up data import', completed: true },
    ],
    summary_oneliner: 'Onboarding kicked off — team excited to start.',
    next_steps_oneliner: 'Training session next week.',
    has_recording: true,
    next_actions: ['Send integration guide', 'Schedule training session for team'],
  },
];

// ─── Activities ─────────────────────────────────────────────────
export const defaultActivities: SandboxActivity[] = [
  {
    id: 'act-001',
    type: 'email',
    subject: 'Follow-up: Platform demo recap',
    details: 'AI-drafted follow-up sent to Sarah Chen with pricing attachment',
    contact_name: 'Sarah Chen',
    company_name: 'Acme Corp',
    deal_name: 'Acme Corp — Platform License',
    created_at: hoursAgo(2),
  },
  {
    id: 'act-002',
    type: 'meeting',
    subject: 'Discovery call completed',
    details: 'Initial discovery with Ryan. Strong interest in automation features.',
    contact_name: 'Ryan Patel',
    company_name: 'Velocity SaaS',
    deal_name: 'Velocity SaaS — Enterprise Expansion',
    created_at: hoursAgo(5),
  },
  {
    id: 'act-003',
    type: 'deal_update',
    subject: 'Deal moved to Closed Won',
    details: 'Summit Health pilot signed. $35K ARR.',
    company_name: 'Summit Health',
    deal_name: 'Summit Health — Pilot Program',
    created_at: daysAgo(1),
  },
  {
    id: 'act-004',
    type: 'call',
    subject: 'Quick check-in call',
    details: 'Confirmed Tom has budget approval. Legal reviewing contract.',
    contact_name: 'Tom Wilson',
    company_name: 'Northstar Analytics',
    deal_name: 'Northstar Analytics — Annual Plan',
    created_at: daysAgo(1),
  },
  {
    id: 'act-005',
    type: 'task',
    subject: 'Send revised proposal to Acme Corp',
    details: 'Include enterprise pricing tier and implementation timeline',
    company_name: 'Acme Corp',
    deal_name: 'Acme Corp — Platform License',
    created_at: daysAgo(1),
  },
  {
    id: 'act-006',
    type: 'email',
    subject: 'Introduction email to Anna Kowalski',
    details: 'Warm intro via Emily. Technical evaluation starting.',
    contact_name: 'Anna Kowalski',
    company_name: 'Greenfield Partners',
    created_at: daysAgo(2),
  },
  {
    id: 'act-007',
    type: 'note',
    subject: 'Competitor intel: Greenfield evaluated Gong',
    details: 'Emily mentioned they looked at Gong 3 months ago. Too expensive, too enterprise. Good positioning for us.',
    company_name: 'Greenfield Partners',
    deal_name: 'Greenfield Partners — Consulting Package',
    created_at: daysAgo(3),
  },
  {
    id: 'act-008',
    type: 'meeting',
    subject: 'Onboarding kickoff — Summit Health',
    details: 'Lisa and Rachel joining. Cover integrations, data import, and team training.',
    contact_name: 'Lisa Nguyen',
    company_name: 'Summit Health',
    created_at: daysAgo(3),
  },
  {
    id: 'act-009',
    type: 'email',
    subject: 'Case study shared with Acme Corp',
    details: 'Sent the Northstar case study showing 41% improvement in follow-up rates',
    contact_name: 'James Park',
    company_name: 'Acme Corp',
    created_at: daysAgo(4),
  },
  {
    id: 'act-010',
    type: 'call',
    subject: 'Pricing discussion with Emily',
    details: 'Discussed consulting package pricing. She needs to bring to partner meeting next week.',
    contact_name: 'Emily Brooks',
    company_name: 'Greenfield Partners',
    deal_name: 'Greenfield Partners — Consulting Package',
    created_at: daysAgo(5),
  },
];

// ─── KPIs ───────────────────────────────────────────────────────
export const defaultKPIs: SandboxKPIs = {
  metrics: [
    {
      title: 'New Business',
      value: 178000,
      target: 250000,
      trend: 12,
      previousPeriodTotal: 215000,
      totalTrend: -17,
      icon: 'revenue',
      color: 'emerald',
    },
    {
      title: 'Outbound',
      value: 42,
      target: 60,
      trend: 8,
      previousPeriodTotal: 55,
      totalTrend: -24,
      icon: 'outbound',
      color: 'blue',
    },
    {
      title: 'Meetings',
      value: 18,
      target: 25,
      trend: 15,
      previousPeriodTotal: 22,
      totalTrend: -18,
      icon: 'meetings',
      color: 'violet',
    },
    {
      title: 'Proposals',
      value: 5,
      target: 8,
      trend: 25,
      previousPeriodTotal: 6,
      totalTrend: -17,
      icon: 'proposals',
      color: 'orange',
    },
  ],
};

// ─── Email Draft (from the user to a prospect) ─────────────────
export const defaultEmailDraft: SandboxEmailDraft = {
  to_name: 'Sarah Chen',
  to_email: 'sarah.chen@acme.com',
  to_title: 'VP of Sales',
  to_company: 'Acme Corp',
  subject: 'Re: Next steps — revised proposal attached',
  body: `Hi Sarah,

Great speaking with you and James yesterday. I could tell from the conversation that pipeline visibility and follow-up automation are exactly the pain points we can solve for your team.

As promised, I've put together a revised proposal with the pricing we discussed. The key highlights:

- Full platform access for your team of 8 reps
- Dedicated onboarding and migration support
- Meeting intelligence + AI follow-ups from day one
- 90-day pilot option if you'd prefer to start smaller

I also noticed James had questions about integration depth — I've included a technical spec sheet that covers the full capabilities.

Given your timeline, I'd suggest we aim to have a decision by the end of this month so your team can start seeing results quickly. Happy to jump on a quick call to walk through the proposal.

Looking forward to your thoughts.

Best,
You`,
  reasoning:
    'Generated based on yesterday\'s demo call context. Sarah\'s pain points (pipeline visibility, follow-up automation) addressed directly. Timeline urgency incorporated. James\'s integration questions proactively handled.',
};

// ─── Slack Messages ─────────────────────────────────────────────
export const defaultSlackMessages: SandboxSlackMessage[] = [
  {
    channel: '#deals',
    title: 'Meeting Prep Ready — Acme Corp',
    body: 'Your meeting with Sarah Chen (Acme Corp) is tomorrow at 2pm. Prep doc is ready with 5 talking points and 3 risk signals.',
    accent_color: '#6C5CE7',
    fields: [
      { label: 'Deal Value', value: '$95,000' },
      { label: 'Health Score', value: '72/100' },
      { label: 'Stage', value: 'Proposal' },
      { label: 'Days in Stage', value: '4' },
    ],
    actions: ['View Prep Doc', 'Open Deal'],
    timestamp: hoursAgo(1),
  },
  {
    channel: '#deals',
    title: 'Follow-up Email Ready for Approval',
    body: 'AI drafted a follow-up to Sarah Chen based on yesterday\'s demo. Ready for your review.',
    accent_color: '#06b6d4',
    fields: [
      { label: 'To', value: 'sarah.chen@acme.com' },
      { label: 'Subject', value: 'Re: Platform demo — revised proposal' },
    ],
    actions: ['Approve & Send', 'Edit Draft'],
    timestamp: hoursAgo(3),
  },
  {
    channel: '#deals',
    title: 'Deal Won — Summit Health',
    body: 'Summit Health pilot signed! $35K ARR. Lisa Nguyen confirmed onboarding starts Monday.',
    accent_color: '#22c55e',
    fields: [
      { label: 'Deal Value', value: '$35,000' },
      { label: 'Sales Cycle', value: '47 days' },
      { label: 'Win Rate Impact', value: '+3%' },
    ],
    actions: ['Celebrate', 'Start Onboarding'],
    timestamp: daysAgo(1),
  },
];

// ─── Proposals ──────────────────────────────────────────────────
export const defaultProposals: SandboxProposal[] = [
  {
    id: 'proposal-001',
    title: 'Acme Corp — Platform License Proposal',
    deal_name: 'Acme Corp — Platform License',
    company_name: 'Acme Corp',
    contact_name: 'Sarah Chen',
    status: 'viewed',
    created_at: daysAgo(2),
    value: 95000,
    brand_color: '#1e40af',
    sections: [
      {
        id: 'sec-001-cover',
        type: 'cover',
        title: 'Platform License Proposal',
        content: '',
        order: 0,
      },
      {
        id: 'sec-001-exec',
        type: 'executive_summary',
        title: 'Executive Summary',
        content: '<p>This proposal outlines a comprehensive platform solution designed to eliminate the 15+ hours per week your sales team spends on manual admin tasks. By consolidating your fragmented sales stack (HubSpot, Calendly, Notion) into a single command center, we project a <strong>41% improvement</strong> in follow-up rates and a <strong>28% reduction</strong> in sales cycle length within the first 90 days.</p><p>Based on our conversations with Sarah Chen and James Park, pipeline visibility and automated follow-ups are your team\'s top priorities. This proposal addresses both with a solution that pays for itself within the first quarter.</p>',
        order: 1,
      },
      {
        id: 'sec-001-problem',
        type: 'problem',
        title: 'The Challenge',
        content: '<p>Acme Corp\'s sales team of 8 reps is experiencing three core challenges:</p><ul><li><strong>Fragmented tools:</strong> Your team switches between 4+ applications daily, losing context and creating data silos</li><li><strong>Manual follow-ups:</strong> Reps spend 3+ hours per day on admin instead of selling — drafting emails, updating CRM, preparing for meetings</li><li><strong>Pipeline blind spots:</strong> No unified view of deal health, risk signals, or relationship status across accounts</li></ul><p>These challenges are costing an estimated <strong>$180K annually</strong> in lost productivity and missed opportunities.</p>',
        order: 2,
      },
      {
        id: 'sec-001-solution',
        type: 'solution',
        title: 'Our Solution',
        content: '<p>60 provides an AI-powered command center that:</p><ul><li><strong>AI Meeting Intelligence:</strong> Automatic prep docs before every call with talking points, risk signals, and deal context. Post-meeting follow-up emails drafted in your team\'s voice within minutes.</li><li><strong>Pipeline Health Engine:</strong> Real-time health scoring across all deals with predictive risk alerts and AI-recommended next steps</li><li><strong>Unified Workspace:</strong> One platform for CRM, email, meetings, and tasks — no more context switching</li><li><strong>Autonomous Actions:</strong> AI handles the repetitive work (data entry, reminders, research) while your team focuses on conversations that close revenue</li></ul>',
        order: 3,
      },
      {
        id: 'sec-001-timeline',
        type: 'timeline',
        title: 'Implementation Timeline',
        content: '<p><strong>Week 1-2: Onboarding & Integration</strong></p><ul><li>CRM data migration and sync setup</li><li>Calendar and email integration</li><li>Team account provisioning</li></ul><p><strong>Week 3-4: Training & Activation</strong></p><ul><li>Team training sessions (2 x 1hr)</li><li>Meeting intelligence configuration</li><li>Custom pipeline stages and health scoring</li></ul><p><strong>Week 5-8: Optimization</strong></p><ul><li>AI tone calibration from your team\'s writing style</li><li>Workflow automation setup</li><li>Monthly performance review</li></ul>',
        order: 4,
      },
      {
        id: 'sec-001-pricing',
        type: 'pricing',
        title: 'Investment',
        content: '<p><strong>Enterprise Plan — 8 seats</strong></p><table><thead><tr><th>Item</th><th>Annual</th></tr></thead><tbody><tr><td>Platform License (8 seats)</td><td>$76,800</td></tr><tr><td>Meeting Intelligence Add-on</td><td>$9,600</td></tr><tr><td>Dedicated Onboarding</td><td>$4,800</td></tr><tr><td>Priority Support (Year 1)</td><td>$3,800</td></tr><tr><td><strong>Total Investment</strong></td><td><strong>$95,000</strong></td></tr></tbody></table><p><em>90-day pilot option available at $28,500 (3-month commitment, 3 seats)</em></p>',
        order: 5,
      },
      {
        id: 'sec-001-terms',
        type: 'terms',
        title: 'Terms & Next Steps',
        content: '<p>This proposal is valid for 30 days from the date of issue. To proceed:</p><ol><li>Review and approve this proposal</li><li>Schedule a CEO intro call to align on strategic value</li><li>Execute the service agreement</li><li>Kick off onboarding within 5 business days of signing</li></ol><p>We\'re confident this partnership will transform how your team sells. Let\'s make it happen.</p>',
        order: 6,
      },
    ],
  },
  {
    id: 'proposal-002',
    title: 'Northstar Analytics — Annual Plan',
    deal_name: 'Northstar Analytics — Annual Plan',
    company_name: 'Northstar Analytics',
    contact_name: 'Tom Wilson',
    status: 'sent',
    created_at: daysAgo(5),
    value: 48000,
    brand_color: '#7c3aed',
    sections: [
      {
        id: 'sec-002-cover',
        type: 'cover',
        title: 'Annual Plan Proposal',
        content: '',
        order: 0,
      },
      {
        id: 'sec-002-exec',
        type: 'executive_summary',
        title: 'Executive Summary',
        content: '<p>Northstar Analytics is scaling rapidly and needs a sales intelligence platform that grows with you. This proposal covers a full annual plan with meeting intelligence, pipeline automation, and dedicated onboarding — designed to help your CRO team close 30% more deals in the next two quarters.</p>',
        order: 1,
      },
      {
        id: 'sec-002-pricing',
        type: 'pricing',
        title: 'Investment',
        content: '<p><strong>Growth Plan — 4 seats</strong></p><table><thead><tr><th>Item</th><th>Annual</th></tr></thead><tbody><tr><td>Platform License (4 seats)</td><td>$38,400</td></tr><tr><td>Meeting Intelligence</td><td>$4,800</td></tr><tr><td>Onboarding Package</td><td>$4,800</td></tr><tr><td><strong>Total</strong></td><td><strong>$48,000</strong></td></tr></tbody></table>',
        order: 2,
      },
    ],
  },
  {
    id: 'proposal-003',
    title: 'Greenfield Partners — Consulting Package',
    deal_name: 'Greenfield Partners — Consulting Package',
    company_name: 'Greenfield Partners',
    contact_name: 'Emily Brooks',
    status: 'draft',
    created_at: daysAgo(1),
    value: 120000,
    brand_color: '#059669',
    sections: [
      {
        id: 'sec-003-cover',
        type: 'cover',
        title: 'Consulting Package Proposal',
        content: '',
        order: 0,
      },
      {
        id: 'sec-003-exec',
        type: 'executive_summary',
        title: 'Executive Summary',
        content: '<p>A tailored consulting engagement to help Greenfield Partners implement enterprise-grade sales intelligence across their advisory practice. Includes custom workflow design, team training, and a 12-month support plan.</p>',
        order: 1,
      },
      {
        id: 'sec-003-pricing',
        type: 'pricing',
        title: 'Investment',
        content: '<p><strong>Enterprise Consulting — 10 seats</strong></p><table><thead><tr><th>Item</th><th>Annual</th></tr></thead><tbody><tr><td>Platform License (10 seats)</td><td>$84,000</td></tr><tr><td>Custom Workflow Design</td><td>$18,000</td></tr><tr><td>Training & Enablement</td><td>$12,000</td></tr><tr><td>Priority Support</td><td>$6,000</td></tr><tr><td><strong>Total</strong></td><td><strong>$120,000</strong></td></tr></tbody></table>',
        order: 2,
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function hoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function futureDate(days: number, hours?: number, minutes?: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (hours !== undefined) d.setHours(hours);
  if (minutes !== undefined) d.setMinutes(minutes);
  return d.toISOString();
}

// ─── Assembled Default Dataset ──────────────────────────────────
export function getDefaultSandboxData(): SandboxData {
  const visitorCompany = defaultCompanies.find((c) => c.isVisitorCompany)!;
  const visitorDeal = defaultDeals.find((d) => d.isVisitorDeal)!;

  return {
    user: defaultUser,
    org: defaultOrg,
    companies: defaultCompanies,
    contacts: defaultContacts,
    deals: defaultDeals,
    meetings: defaultMeetings,
    activities: defaultActivities,
    kpis: defaultKPIs,
    emailDraft: defaultEmailDraft,
    slackMessages: defaultSlackMessages,
    proposals: defaultProposals,
    visitorCompany,
    visitorDeal,
  };
}
