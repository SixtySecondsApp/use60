import { Shield, Calendar, Mail, Tag, Send, FileText, Unplug } from 'lucide-react';
import type { ShotConfig, MockContact, MockEmail, MockCalendarEvent } from './types';

// ============================================================
// CONTACTS
// ============================================================
export const contacts: MockContact[] = [
  { name: 'Sarah Chen', role: 'VP Sales', company: 'Acme Corp', email: 'sarah.chen@acmecorp.com', avatar: 'SC' },
  { name: 'Marcus Johnson', role: 'CTO', company: 'TechFlow', email: 'marcus.j@techflow.io', avatar: 'MJ' },
  { name: 'Emily Rodriguez', role: 'Head of Growth', company: 'BrightPath', email: 'emily.r@brightpath.co', avatar: 'ER' },
  { name: 'David Kim', role: 'CEO', company: 'Nexus AI', email: 'david@nexusai.com', avatar: 'DK' },
];

// ============================================================
// EMAILS
// ============================================================
export const emails: MockEmail[] = [
  {
    id: 'em-1',
    from: contacts[0],
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Re: Enterprise pricing discussion',
    preview: 'Thanks for the proposal. I shared it with our CFO and he had a few questions about the annual commitment...',
    timestamp: '10:23 AM',
    category: 'to_respond',
    isRead: false,
    isStarred: true,
  },
  {
    id: 'em-2',
    from: contacts[1],
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'TechFlow demo follow-up',
    preview: 'Great demo yesterday. The team was impressed with the API integration capabilities. Can we schedule a technical deep-dive?',
    timestamp: '9:45 AM',
    category: 'to_respond',
    isRead: false,
    isStarred: false,
  },
  {
    id: 'em-3',
    from: contacts[2],
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Q1 Growth Report - BrightPath',
    preview: 'Attaching our Q1 growth numbers as discussed. We hit 142% of target which validates the ROI case we discussed...',
    timestamp: 'Yesterday',
    category: 'fyi',
    isRead: true,
    isStarred: false,
  },
  {
    id: 'em-4',
    from: { name: 'SaaStr Events', role: '', company: 'SaaStr', email: 'events@saastr.com', avatar: 'SE' },
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'SaaStr Annual 2026 - Early Bird Tickets',
    preview: 'Lock in your early bird rate for SaaStr Annual 2026. Join 15,000+ SaaS professionals in San Francisco...',
    timestamp: 'Yesterday',
    category: 'marketing',
    isRead: true,
    isStarred: false,
  },
  {
    id: 'em-5',
    from: contacts[3],
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Partnership opportunity - Nexus AI',
    preview: 'Our board approved the technology partnership. I would like to discuss next steps and integration timeline...',
    timestamp: '2 days ago',
    category: 'to_respond',
    isRead: true,
    isStarred: true,
  },
  {
    id: 'em-6',
    from: { name: 'Google Workspace', role: '', company: 'Google', email: 'noreply@google.com', avatar: 'GW' },
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Your weekly Google Workspace summary',
    preview: 'Here is your weekly activity summary: 47 emails sent, 12 meetings attended, 3 documents shared...',
    timestamp: '2 days ago',
    category: 'automated',
    isRead: true,
    isStarred: false,
  },
  {
    id: 'em-7',
    from: { name: 'HubSpot', role: '', company: 'HubSpot', email: 'notifications@hubspot.com', avatar: 'HS' },
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Deal stage update: Acme Corp moved to Negotiation',
    preview: 'The deal "Acme Corp Enterprise" has been moved to the Negotiation stage by the system...',
    timestamp: '3 days ago',
    category: 'automated',
    isRead: true,
    isStarred: false,
  },
  {
    id: 'em-8',
    from: contacts[0],
    to: 'andrew.bryce@sixtyseconds.video',
    subject: 'Meeting reschedule request',
    preview: 'Hi Andrew, would it be possible to move our Thursday call to Friday at 2pm? Something came up with our board...',
    timestamp: '3 days ago',
    category: 'to_respond',
    isRead: true,
    isStarred: false,
  },
];

// ============================================================
// CALENDAR EVENTS
// ============================================================
export const calendarEvents: MockCalendarEvent[] = [
  {
    id: 'cal-1',
    title: 'Acme Corp - Pricing Review',
    time: '10:00 AM',
    duration: '45 min',
    attendees: [contacts[0]],
    meetLink: 'https://meet.google.com/abc-defg-hij',
    color: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
    day: 0,
    hour: 10,
    dealName: 'Acme Corp Enterprise',
  },
  {
    id: 'cal-2',
    title: 'TechFlow Technical Deep-Dive',
    time: '2:00 PM',
    duration: '60 min',
    attendees: [contacts[1]],
    meetLink: 'https://meet.google.com/klm-nopq-rst',
    color: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
    day: 1,
    hour: 14,
    dealName: 'TechFlow API Integration',
  },
  {
    id: 'cal-3',
    title: 'Team Standup',
    time: '9:00 AM',
    duration: '15 min',
    attendees: [],
    meetLink: 'https://meet.google.com/uvw-xyza-bcd',
    color: 'bg-gray-500/20 border-gray-500/40 text-gray-300',
    day: 2,
    hour: 9,
  },
  {
    id: 'cal-4',
    title: 'BrightPath - QBR Prep',
    time: '11:00 AM',
    duration: '30 min',
    attendees: [contacts[2]],
    meetLink: 'https://meet.google.com/efg-hijk-lmn',
    color: 'bg-green-500/20 border-green-500/40 text-green-300',
    day: 2,
    hour: 11,
    dealName: 'BrightPath Growth Package',
  },
  {
    id: 'cal-5',
    title: 'Nexus AI - Partnership Kickoff',
    time: '3:00 PM',
    duration: '60 min',
    attendees: [contacts[3]],
    meetLink: 'https://meet.google.com/opq-rstu-vwx',
    color: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    day: 3,
    hour: 15,
    dealName: 'Nexus AI Partnership',
  },
  {
    id: 'cal-6',
    title: 'Pipeline Review',
    time: '4:00 PM',
    duration: '30 min',
    attendees: [],
    meetLink: 'https://meet.google.com/yza-bcde-fgh',
    color: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
    day: 4,
    hour: 16,
  },
];

// ============================================================
// SHOT CONFIGURATIONS
// ============================================================
export const shots: ShotConfig[] = [
  {
    id: 0,
    title: 'OAuth Flow',
    icon: Shield,
    duration: '25s',
    steps: ['Integration cards', 'Connecting', 'Connected'],
    stepTimings: [4000, 5000, 5000],
  },
  {
    id: 1,
    title: 'Calendar Sync',
    icon: Calendar,
    duration: '35s',
    steps: ['Week view', 'Event detail', 'AI prep brief', 'Create event', 'Event created'],
    stepTimings: [5000, 5000, 7000, 5000, 4000],
  },
  {
    id: 2,
    title: 'Email Sync',
    icon: Mail,
    duration: '30s',
    steps: ['Contact record', 'Thread list', 'AI analysis', 'New email'],
    stepTimings: [3000, 5000, 6000, 5000],
  },
  {
    id: 3,
    title: 'Email Triage',
    icon: Tag,
    duration: '25s',
    steps: ['Categorized inbox', 'Interact', 'Label sync'],
    stepTimings: [5000, 4000, 6000],
  },
  {
    id: 4,
    title: 'Email Sending',
    icon: Send,
    duration: '30s',
    steps: ['Deal card', 'AI drafting', 'Full draft', 'Sent'],
    stepTimings: [4000, 8000, 5000, 4000],
  },
  {
    id: 5,
    title: 'Draft Creation',
    icon: FileText,
    duration: '20s',
    steps: ['AI suggestion', 'Draft preview', 'Saved to drafts'],
    stepTimings: [5000, 5000, 4000],
  },
  {
    id: 6,
    title: 'Disconnect',
    icon: Unplug,
    duration: '15s',
    steps: ['Connected state', 'Confirm dialog', 'Disconnected'],
    stepTimings: [4000, 4000, 4000],
  },
];

// ============================================================
// EMAIL DRAFT CONTENT
// ============================================================
export const draftEmailContent = `Hi Sarah,

Thank you for taking the time to review the proposal with your team. I'm glad the enterprise plan resonated with your needs.

To address the CFO's questions on the annual commitment:

- **Annual pricing**: £3,750/month (£45,000/year) — a 17% saving vs monthly
- **ROI timeline**: Based on similar deployments, teams see measurable pipeline acceleration within 60 days
- **Flexibility**: We can structure quarterly checkpoints with an exit clause after 6 months if targets aren't met

I've also attached the case study from BrightPath, who saw a 142% increase in qualified pipeline within Q1.

Would Thursday at 2pm work for a quick call with your CFO? I can walk through the numbers directly.

Best,
Andrew`;

export const aiSuggestionDraft = `Hi Marcus,

Great connecting at the demo yesterday. Your team asked excellent questions about the API integration — here are the specifics:

- **REST & GraphQL support**: Full bidirectional sync with your existing stack
- **Webhook events**: Real-time notifications for deal stage changes, meeting outcomes, and email engagement
- **Rate limits**: 10,000 requests/min on the Enterprise plan

I've set up a sandbox environment for your engineering team: sandbox.use60.com/techflow

Let me know if Friday at 11am works for the technical deep-dive.

Best,
Andrew`;

// ============================================================
// AI MEETING PREP
// ============================================================
export const meetingPrepBrief = {
  company: 'Acme Corp',
  dealStage: 'Negotiation',
  dealValue: '£45,000',
  recentInteractions: [
    { type: 'Email', detail: 'Proposal sent — CFO has questions on annual commitment', date: '2 days ago' },
    { type: 'Meeting', detail: 'Product demo — positive reception from VP Sales team', date: '1 week ago' },
    { type: 'Email', detail: 'Initial outreach — connected via SaaStr conference', date: '3 weeks ago' },
  ],
  talkingPoints: [
    'Address CFO concerns on annual commitment flexibility',
    'Share BrightPath case study (142% pipeline growth in Q1)',
    'Propose quarterly checkpoint structure with exit clause',
    'Discuss implementation timeline — 2 week onboarding',
  ],
  risks: [
    'CFO may push for monthly billing (17% revenue impact)',
    'Competitor evaluation with Gong mentioned in last call',
  ],
};
