// Demo meeting data for Sarah Chen's Day 1 calendar

export interface MeetingAttendee {
  name: string;
  title: string;
  company: string;
  email: string;
  isOrganizer?: boolean;
}

export interface DemoMeeting {
  id: string;
  title: string;
  time: string;
  startTime: string; // ISO format
  duration: number; // minutes
  attendees: MeetingAttendee[];
  dealId?: string;
  type: 'external_sales' | 'internal_1on1' | 'internal_standup' | 'internal_review';
  prepStatus: 'ready' | 'needs_prep' | 'auto_prepped' | 'not_applicable';
  location?: string;
  meetingUrl?: string;
  description?: string;
  transcriptExcerpts?: TranscriptExcerpt[];
  aiPrepNotes?: string[];
}

export interface TranscriptExcerpt {
  speaker: string;
  timestamp: string;
  text: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'excited';
  isKeyMoment?: boolean;
}

export const demoMeetings: DemoMeeting[] = [
  {
    id: 'mtg-001',
    title: 'DataFlow Systems — Platform Demo & Technical Deep-Dive',
    time: '10:00 AM',
    startTime: '2026-02-22T10:00:00-05:00',
    duration: 60,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io', isOrganizer: true },
      { name: 'Jake Torres', title: 'VP of Engineering', company: 'DataFlow Systems', email: 'jake.torres@dataflow.io' },
      { name: 'Lisa Park', title: 'Director of Product', company: 'DataFlow Systems', email: 'lisa.park@dataflow.io' },
      { name: 'Sophie Wright', title: 'Head of IT', company: 'DataFlow Systems', email: 'sophie.wright@dataflow.io' },
    ],
    dealId: 'deal-001',
    type: 'external_sales',
    prepStatus: 'auto_prepped',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    description: 'Technical demo for DataFlow engineering team. Focus on Jira integration, API throughput, and SOC2 compliance. Jake is the technical champion — Lisa evaluating against Intercom.',
    aiPrepNotes: [
      'Jake Torres visited the pricing page 3 times this week — likely preparing internal budget justification',
      'Lisa Park previously evaluated Intercom (Q3 2025) — emphasize integration depth over brand',
      'Sophie Wright joined the thread last week asking about SSO/SCIM — prepare identity management demo',
      'DataFlow raised Series C ($45M) in November — budget is available, timeline is the constraint',
      'Competitor alert: Intercom rep spotted at DataFlow office last Tuesday (LinkedIn check-in)',
    ],
    transcriptExcerpts: [
      {
        speaker: 'Sarah Chen',
        timestamp: '00:02:15',
        text: 'Thanks everyone for joining. I know Jake mentioned wanting to see the Jira integration specifically, so I\'ve got a live environment set up with a mock sprint board.',
        sentiment: 'neutral',
      },
      {
        speaker: 'Jake Torres',
        timestamp: '00:04:30',
        text: 'Yeah, that\'s the big one for us. Our engineering team lives in Jira. If we have to context-switch to another tool, adoption is going to be a nightmare.',
        sentiment: 'neutral',
        isKeyMoment: true,
      },
      {
        speaker: 'Sarah Chen',
        timestamp: '00:12:45',
        text: 'So here you can see bi-directional sync — when a ticket moves to "In Review" in Jira, the customer-facing status updates automatically. No manual step.',
        sentiment: 'neutral',
      },
      {
        speaker: 'Jake Torres',
        timestamp: '00:14:10',
        text: 'Wait, that\'s real-time? Not batched?',
        sentiment: 'excited',
      },
      {
        speaker: 'Sarah Chen',
        timestamp: '00:14:18',
        text: 'Real-time via webhooks. Sub-second latency. We can also batch if you prefer — some teams do hourly syncs for staging environments.',
        sentiment: 'neutral',
      },
      {
        speaker: 'Jake Torres',
        timestamp: '00:15:02',
        text: 'If you can integrate with our Jira, this is a no-brainer. We\'ve been trying to solve this for eighteen months.',
        sentiment: 'excited',
        isKeyMoment: true,
      },
      {
        speaker: 'Lisa Park',
        timestamp: '00:18:30',
        text: 'What about the product analytics side? We need to track feature adoption per customer segment, not just support tickets.',
        sentiment: 'neutral',
      },
      {
        speaker: 'Sophie Wright',
        timestamp: '00:25:00',
        text: 'Quick question on the security side — do you support SCIM provisioning? We\'re standardizing on Okta across the org.',
        sentiment: 'neutral',
        isKeyMoment: true,
      },
      {
        speaker: 'Sarah Chen',
        timestamp: '00:25:15',
        text: 'Absolutely. Full SCIM 2.0 support, and we have a pre-built Okta integration. I can share our security whitepaper after the call.',
        sentiment: 'positive',
      },
      {
        speaker: 'Jake Torres',
        timestamp: '00:45:20',
        text: 'I\'m going to be honest — we looked at Intercom last quarter and the integration story was... not great. This is significantly better.',
        sentiment: 'positive',
        isKeyMoment: true,
      },
      {
        speaker: 'Lisa Park',
        timestamp: '00:48:00',
        text: 'I agree with Jake on the technical side. My concern is more about the analytics depth — can we do cohort analysis on customer health scores?',
        sentiment: 'neutral',
      },
      {
        speaker: 'Sarah Chen',
        timestamp: '00:55:30',
        text: 'So for next steps — I\'ll send over the security whitepaper for Sophie, the analytics deep-dive doc for Lisa, and Jake, I\'d love to get a sandbox set up with your actual Jira instance. Does next Wednesday work for a follow-up?',
        sentiment: 'positive',
      },
      {
        speaker: 'Jake Torres',
        timestamp: '00:56:10',
        text: 'Wednesday works. And honestly, loop in our CTO Marcus — I think he\'ll want to see this.',
        sentiment: 'excited',
        isKeyMoment: true,
      },
    ],
  },
  {
    id: 'mtg-002',
    title: 'Team Standup — Pipeline & Priorities',
    time: '11:00 AM',
    startTime: '2026-02-22T11:00:00-05:00',
    duration: 15,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io' },
      { name: 'Marcus Lee', title: 'Sales Director', company: 'Meridian', email: 'marcus.lee@meridian.io', isOrganizer: true },
      { name: 'Devon Park', title: 'Account Executive', company: 'Meridian', email: 'devon.park@meridian.io' },
      { name: 'Alex Rivera', title: 'SDR Lead', company: 'Meridian', email: 'alex.rivera@meridian.io' },
    ],
    type: 'internal_standup',
    prepStatus: 'not_applicable',
    meetingUrl: 'https://meet.google.com/team-standup-daily',
    description: 'Daily pipeline standup. Sarah to update on DataFlow demo results and CloudBase timeline.',
  },
  {
    id: 'mtg-003',
    title: 'CloudBase Inc — Contract Follow-Up & Negotiation',
    time: '11:30 AM',
    startTime: '2026-02-22T11:30:00-05:00',
    duration: 45,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io', isOrganizer: true },
      { name: 'Maria Chen', title: 'Head of Operations', company: 'CloudBase Inc', email: 'maria.chen@cloudbase.com' },
    ],
    dealId: 'deal-003',
    type: 'external_sales',
    prepStatus: 'auto_prepped',
    meetingUrl: 'https://meet.google.com/klm-nopq-rst',
    description: 'Contract negotiation follow-up with Maria. She requested 15% volume discount and multi-year terms. Need to discuss payment schedule and implementation timeline.',
    aiPrepNotes: [
      'Maria opened the proposal PDF 4 times since last meeting — focused on pricing section (page 7-8)',
      'CloudBase Q4 board deck mentioned "operational efficiency tooling" as 2026 priority — align messaging',
      'Maria\'s LinkedIn shows she just got promoted to Head of Ops (was Director) — she has more budget authority now',
      'Last email from Maria (Feb 19): "Need to get this wrapped up before our March planning cycle"',
      'Recommended: Offer 10% multi-year discount (standard) but hold firm on implementation timeline — they need us more than we need the discount',
    ],
  },
  {
    id: 'mtg-004',
    title: 'Pipeline Review — Q1 Forecast',
    time: '12:30 PM',
    startTime: '2026-02-22T12:30:00-05:00',
    duration: 30,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io' },
      { name: 'Marcus Lee', title: 'Sales Director', company: 'Meridian', email: 'marcus.lee@meridian.io', isOrganizer: true },
      { name: 'Jennifer Walsh', title: 'VP of Sales', company: 'Meridian', email: 'jennifer.walsh@meridian.io' },
    ],
    type: 'internal_review',
    prepStatus: 'auto_prepped',
    meetingUrl: 'https://meet.google.com/pipeline-review-q1',
    description: 'Q1 forecast review with leadership. Sarah\'s pipeline: $1.2M weighted, $2.4M total. Need to discuss DataFlow ($180K) timeline and Apex risk.',
    aiPrepNotes: [
      'Sarah\'s Q1 pipeline: 8 active deals, $2.4M total, $1.2M weighted',
      'At-risk: Apex Partners ($95K) — champion David Kim went silent 12 days ago',
      'Upside: DataFlow ($180K) — strong champion signal from Jake Torres post-demo',
      'Forecast accuracy: Sarah has been within 8% of forecast for 3 consecutive quarters',
    ],
  },
  {
    id: 'mtg-005',
    title: 'TechVault — Discovery Call & Needs Assessment',
    time: '2:00 PM',
    startTime: '2026-02-22T14:00:00-05:00',
    duration: 45,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io', isOrganizer: true },
      { name: 'Rachel Adams', title: 'CTO', company: 'TechVault', email: 'rachel.adams@techvault.io' },
      { name: 'Ben Foster', title: 'VP of Customer Success', company: 'TechVault', email: 'ben.foster@techvault.io' },
    ],
    dealId: 'deal-005',
    type: 'external_sales',
    prepStatus: 'needs_prep',
    meetingUrl: 'https://meet.google.com/uvw-xyza-bcd',
    description: 'Initial discovery call with TechVault leadership. Inbound from website — they\'re evaluating customer success platforms after churning from Zendesk AI. Need to understand pain points and timeline.',
    aiPrepNotes: [
      'TechVault (Series B, $22M raised) — 180 employees, growing 40% YoY',
      'Rachel Adams previously used Meridian at her last company (Signal Corp, 2023-2024) — potential warm reference',
      'Ben Foster posted on LinkedIn last week about "broken customer health scoring" — key pain point',
      'TechVault\'s Zendesk contract ends March 31 — tight evaluation window',
      'Competitors likely in play: Ada (they follow Ada\'s CEO on Twitter), possibly Intercom',
    ],
  },
  {
    id: 'mtg-006',
    title: '1:1 with James — Coaching & Deal Strategy',
    time: '4:00 PM',
    startTime: '2026-02-22T16:00:00-05:00',
    duration: 30,
    attendees: [
      { name: 'Sarah Chen', title: 'Senior Account Executive', company: 'Meridian', email: 'sarah.chen@meridian.io' },
      { name: 'James Wright', title: 'Sales Manager', company: 'Meridian', email: 'james.wright@meridian.io', isOrganizer: true },
    ],
    type: 'internal_1on1',
    prepStatus: 'not_applicable',
    meetingUrl: 'https://meet.google.com/one-on-one-jw',
    description: 'Weekly 1:1 with James. Topics: DataFlow deal strategy, Apex Partners risk mitigation, Q1 quota pacing, professional development.',
    aiPrepNotes: [
      'Sarah is at 68% of Q1 quota with 5 weeks remaining — on track if DataFlow closes',
      'Discussion point: Apex Partners — should we escalate to VP-level outreach?',
      'James asked last week about Sarah\'s interest in the Enterprise team — follow up',
      'Coaching opportunity: Sarah\'s discovery-to-proposal conversion is 85% (team avg 72%) — highlight as strength',
    ],
  },
] as const;

export type DemoMeetingType = (typeof demoMeetings)[number];

// Helper to get meetings by type
export const getExternalMeetings = () =>
  demoMeetings.filter((m) => m.type === 'external_sales');

export const getInternalMeetings = () =>
  demoMeetings.filter((m) => m.type !== 'external_sales');

// Meeting-to-deal mapping for cross-referencing
export const meetingDealMap: Record<string, string> = {
  'mtg-001': 'deal-001', // DataFlow
  'mtg-003': 'deal-003', // CloudBase
  'mtg-005': 'deal-005', // TechVault
};
