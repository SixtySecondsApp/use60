/**
 * Tour Demo Data
 *
 * Static, client-side-only data used during the product tour to showcase
 * meeting analysis capabilities. No database reads or writes.
 */

import type { UnifiedMeeting } from '@/lib/types/unifiedMeeting'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TOUR_DEMO_MEETING_ID = '00000000-0000-0000-0000-000000000060'
export const TOUR_DEMO_PATH = '/meetings/tour-demo'

// ---------------------------------------------------------------------------
// UnifiedMeeting — used in the meetings list view
// ---------------------------------------------------------------------------

export const TOUR_DEMO_MEETING: UnifiedMeeting = {
  id: TOUR_DEMO_MEETING_ID,
  source: 'fathom',
  sourceTable: 'meetings',
  title: 'DataFlow Systems — Platform Demo',
  date: '2026-02-22T10:00:00-05:00',
  durationMinutes: 52,
  companyName: 'DataFlow Systems',
  ownerEmail: 'sarah.chen@meridian.io',
  thumbnailUrl: null,
  summary: JSON.stringify({
    overview:
      'High-energy platform demo with DataFlow Systems engineering and product leadership. Jake Torres confirmed the Jira integration solves their 18-month pain point. Lisa Park needs analytics depth validation. Sophie Wright signed off on SCIM/Okta compliance. Strong buying signals — CTO involvement requested for follow-up.',
  }),
  sentimentScore: 0.72,
  coachRating: 8,
  talkTimeRepPct: 38,
  talkTimeJudgement: 'good',
  meetingType: 'demo',
  status: null,
  platform: null,
  provider: 'fathom',
  thumbnailStatus: 'complete',
  transcriptStatus: 'complete',
  summaryStatus: 'complete',
  openTaskCount: 3,
  recordingS3Key: null,
  hitlRequired: false,
  speakers: null,
  detailPath: TOUR_DEMO_PATH,
  shareUrl: null,
  fathomRecordingId: null,
}

// ---------------------------------------------------------------------------
// Attendee detail type
// ---------------------------------------------------------------------------

export interface TourAttendee {
  id: string
  name: string
  email: string
  title: string
  company: string
  isExternal: boolean
  initials: string
  avatarColor: string
}

// ---------------------------------------------------------------------------
// Transcript line type
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  timestamp: string
  speaker: string
  text: string
  isKeyMoment?: boolean
}

// ---------------------------------------------------------------------------
// Full AI summary structure
// ---------------------------------------------------------------------------

export interface TourAISummary {
  overview: string
  key_topics: string[]
  action_items: string[]
  buyer_signals: string[]
  next_steps: string[]
}

// ---------------------------------------------------------------------------
// TOUR_DEMO_DETAIL — full data for TourMeetingDetail page
// ---------------------------------------------------------------------------

export const TOUR_DEMO_DETAIL = {
  id: TOUR_DEMO_MEETING_ID,
  title: 'DataFlow Systems — Platform Demo',
  date: '2026-02-22T10:00:00-05:00',
  durationMinutes: 52,
  meetingType: 'demo' as const,
  sentimentScore: 0.72,
  sentimentReasoning:
    'The conversation carried strong positive momentum throughout. Jake Torres expressed immediate enthusiasm about the real-time Jira integration and explicitly compared the platform favourably to Intercom. Sophie Wright received the SCIM/Okta answer positively. Lisa Park remained analytical but engaged — her follow-up questions indicate genuine evaluation intent rather than resistance. The closing request to involve CTO Marcus is a high-confidence buying signal. Minor friction arose around analytics depth, which tempered the overall score slightly below peak.',
  talkTimeRepPct: 38,
  talkTimeCustomerPct: 62,
  coachRating: 8,
  openTaskCount: 3,

  attendees: [
    {
      id: 'att-1',
      name: 'Sarah Chen',
      email: 'sarah.chen@meridian.io',
      title: 'Senior Account Executive',
      company: 'Meridian',
      isExternal: false,
      initials: 'SC',
      avatarColor: '#10b981',
    },
    {
      id: 'att-2',
      name: 'Jake Torres',
      email: 'jake.torres@dataflow.io',
      title: 'VP of Engineering',
      company: 'DataFlow Systems',
      isExternal: true,
      initials: 'JT',
      avatarColor: '#6366f1',
    },
    {
      id: 'att-3',
      name: 'Lisa Park',
      email: 'lisa.park@dataflow.io',
      title: 'Director of Product',
      company: 'DataFlow Systems',
      isExternal: true,
      initials: 'LP',
      avatarColor: '#f59e0b',
    },
    {
      id: 'att-4',
      name: 'Sophie Wright',
      email: 'sophie.wright@dataflow.io',
      title: 'Head of IT',
      company: 'DataFlow Systems',
      isExternal: true,
      initials: 'SW',
      avatarColor: '#ec4899',
    },
  ] satisfies TourAttendee[],

  aiSummary: {
    overview:
      'High-energy platform demo with DataFlow Systems engineering and product leadership. Jake Torres confirmed the Jira integration solves their 18-month pain point. Lisa Park needs analytics depth validation. Sophie Wright signed off on SCIM/Okta compliance. Strong buying signals with CTO involvement requested for follow-up.',
    key_topics: [
      'Bi-directional Jira sync via webhooks (sub-second latency)',
      'Feature adoption analytics and customer cohort segmentation',
      'SCIM 2.0 provisioning with pre-built Okta integration',
      'Competitive comparison vs Intercom — platform favoured significantly',
      'SOC2 compliance and security whitepaper',
    ],
    action_items: [
      'Send Sophie Wright the SOC2 security whitepaper',
      'Send Lisa Park the analytics deep-dive documentation',
      "Set up a live sandbox with DataFlow's actual Jira instance",
      'Schedule Wednesday follow-up and include CTO Marcus',
    ],
    buyer_signals: [
      'Jake Torres: "If you can integrate with our Jira, this is a no-brainer."',
      'Jake Torres: "This is significantly better than what we saw from Intercom."',
      "Jake Torres: \"Loop in our CTO Marcus — I think he'll want to see this.\"",
      'Sophie Wright: Confirmed Okta standardisation plans across the org',
    ],
    next_steps: [
      'Follow-up call Wednesday with engineering + CTO Marcus',
      'Sandbox environment provisioned with DataFlow Jira',
      'Security review package sent to Sophie',
      'Analytics deep-dive doc sent to Lisa for async review',
    ],
  } satisfies TourAISummary,

  transcript: [
    {
      timestamp: '00:02:15',
      speaker: 'Sarah Chen',
      text: "Thanks everyone for joining. I know Jake mentioned wanting to see the Jira integration specifically, so I've got a live environment set up with a mock sprint board.",
    },
    {
      timestamp: '00:04:30',
      speaker: 'Jake Torres',
      text: "Yeah, that's the big one for us. Our engineering team lives in Jira. If we have to context-switch to another tool, adoption is going to be a nightmare.",
      isKeyMoment: true,
    },
    {
      timestamp: '00:07:45',
      speaker: 'Sarah Chen',
      text: "Completely understand. Let me walk you through the integration architecture first so you can see how it maps to your existing workflow, then we'll go live.",
    },
    {
      timestamp: '00:12:45',
      speaker: 'Sarah Chen',
      text: 'So here you can see bi-directional sync — when a ticket moves to "In Review" in Jira, the customer-facing status updates automatically. No manual step.',
    },
    {
      timestamp: '00:14:10',
      speaker: 'Jake Torres',
      text: "Wait, that's real-time? Not batched?",
      isKeyMoment: true,
    },
    {
      timestamp: '00:14:18',
      speaker: 'Sarah Chen',
      text: 'Real-time via webhooks. Sub-second latency. We can also batch if you prefer — some teams do hourly syncs for staging environments.',
    },
    {
      timestamp: '00:15:02',
      speaker: 'Jake Torres',
      text: "If you can integrate with our Jira, this is a no-brainer. We've been trying to solve this for eighteen months.",
      isKeyMoment: true,
    },
    {
      timestamp: '00:18:30',
      speaker: 'Lisa Park',
      text: "What about the product analytics side? We need to track feature adoption per customer segment, not just support tickets.",
    },
    {
      timestamp: '00:19:50',
      speaker: 'Sarah Chen',
      text: "Great question — let me pull up the analytics module. You can define segments on any combination of plan tier, company size, or custom attributes, and see adoption curves per feature per segment.",
    },
    {
      timestamp: '00:25:00',
      speaker: 'Sophie Wright',
      text: "Quick question on the security side — do you support SCIM provisioning? We're standardising on Okta across the org.",
      isKeyMoment: true,
    },
    {
      timestamp: '00:25:15',
      speaker: 'Sarah Chen',
      text: "Absolutely. Full SCIM 2.0 support, and we have a pre-built Okta integration. I can share our security whitepaper after the call — it covers SOC2 Type II as well.",
    },
    {
      timestamp: '00:26:40',
      speaker: 'Sophie Wright',
      text: "That's exactly what I needed to hear. We had a blocker with the last vendor on this — their SCIM implementation was read-only.",
    },
    {
      timestamp: '00:38:10',
      speaker: 'Lisa Park',
      text: 'Can we do cohort analysis on customer health scores? We want to correlate support ticket volume with expansion revenue.',
    },
    {
      timestamp: '00:39:22',
      speaker: 'Sarah Chen',
      text: "Yes — health scores are composable. You set the weighting across usage frequency, ticket velocity, NPS, and engagement. Then cohort analysis runs on any date range. Let me show you a live example.",
    },
    {
      timestamp: '00:45:20',
      speaker: 'Jake Torres',
      text: "I'm going to be honest — we looked at Intercom last quarter and the integration story was... not great. This is significantly better.",
      isKeyMoment: true,
    },
    {
      timestamp: '00:48:00',
      speaker: 'Lisa Park',
      text: "I agree with Jake on the technical side. My concern is more about the analytics depth — can we validate the cohort analysis against our actual data?",
    },
    {
      timestamp: '00:49:30',
      speaker: 'Sarah Chen',
      text: "Absolutely. That's exactly why I want to set up a sandbox with your real Jira instance — so you're validating on your data, not a demo dataset.",
    },
    {
      timestamp: '00:55:30',
      speaker: 'Sarah Chen',
      text: "So for next steps — I'll send over the security whitepaper for Sophie, the analytics deep-dive doc for Lisa, and Jake, I'd love to get a sandbox set up with your actual Jira instance. Does next Wednesday work for a follow-up?",
    },
    {
      timestamp: '00:56:10',
      speaker: 'Jake Torres',
      text: "Wednesday works. And honestly, loop in our CTO Marcus — I think he'll want to see this.",
      isKeyMoment: true,
    },
    {
      timestamp: '00:56:45',
      speaker: 'Sarah Chen',
      text: "Perfect. I'll send a calendar invite for Wednesday with Marcus included. Really appreciate everyone's time today — this was a great conversation.",
    },
  ] satisfies TranscriptLine[],
}

export type TourDemoDetail = typeof TOUR_DEMO_DETAIL
