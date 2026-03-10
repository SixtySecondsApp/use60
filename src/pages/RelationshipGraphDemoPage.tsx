import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

type Company = {
  id: string;
  name: string;
  industry: string;
  size: string;
  logo: string;
  color: string;
};

type TimelineEvent = {
  type: 'email' | 'meeting' | 'signal' | 'call' | 'linkedin';
  label: string;
  time: string;
  sentiment: 'hot' | 'positive' | 'neutral' | 'cold';
};

type Contact = {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
  warmth: number;
  warmthDelta: number;
  lastInteraction: string;
  meetings: number;
  emails: number;
  calls: number;
  linkedinMsgs: number;
  signals: string[];
  dealId: string | null;
  nextAction: string;
  timeline: TimelineEvent[];
  scoringBreakdown: {
    recency: number;
    engagement: number;
    dealMomentum: number;
    multiThread: number;
    sentiment: number;
  };
};

type Deal = {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  company: string;
  health: keyof typeof HEALTH_CONFIG;
};

type WarmthTier = {
  label: string;
  min: number;
  color: string;
  bg: string;
  border: string;
};

type RenderNode = Contact & {
  tier: WarmthTier;
  companyData?: Company;
  deal?: Deal | null;
  angle: number;
  radius: number;
  x: number;
  y: number;
};

const COMPANIES: Company[] = [
  { id: 'c1', name: 'Meridian Labs', industry: 'SaaS', size: '50-200', logo: 'M', color: '#6366f1' },
  { id: 'c2', name: 'Vault Systems', industry: 'FinTech', size: '200-500', logo: 'V', color: '#f97316' },
  { id: 'c3', name: 'Prism Health', industry: 'HealthTech', size: '10-50', logo: 'P', color: '#22c55e' },
  { id: 'c4', name: 'Nomad Studios', industry: 'Creative', size: '10-50', logo: 'N', color: '#eab308' },
  { id: 'c5', name: 'Arcline AI', industry: 'AI/ML', size: '50-200', logo: 'A', color: '#ec4899' },
  { id: 'c6', name: 'Frostbyte', industry: 'Cybersecurity', size: '200-500', logo: 'F', color: '#06b6d4' },
];

const CONTACTS: Contact[] = [
  {
    id: 'p1', name: 'Sarah Chen', role: 'VP Sales', company: 'c1', avatar: 'SC', warmth: 0.95, warmthDelta: +0.08,
    lastInteraction: '2h ago', meetings: 12, emails: 34, calls: 5, linkedinMsgs: 8,
    signals: ['replied_fast', 'opened_proposal', 'visited_pricing', 'shared_internally'],
    dealId: 'd1', nextAction: 'Send contract',
    timeline: [
      { type: 'email', label: 'Replied to pricing follow-up', time: '2h ago', sentiment: 'positive' },
      { type: 'meeting', label: 'Negotiation call - 45min', time: 'Yesterday', sentiment: 'positive' },
      { type: 'signal', label: 'Opened proposal 3x in 24h', time: '2 days ago', sentiment: 'hot' },
      { type: 'email', label: 'Sent competitive comparison', time: '4 days ago', sentiment: 'neutral' },
      { type: 'meeting', label: 'Technical deep dive w/ eng team', time: '1 week ago', sentiment: 'positive' },
    ],
    scoringBreakdown: { recency: 0.98, engagement: 0.95, dealMomentum: 0.92, multiThread: 0.88, sentiment: 0.96 },
  },
  {
    id: 'p2', name: 'Marcus Reid', role: 'CTO', company: 'c2', avatar: 'MR', warmth: 0.82, warmthDelta: +0.05,
    lastInteraction: '1d ago', meetings: 8, emails: 21, calls: 3, linkedinMsgs: 4,
    signals: ['booked_demo', 'shared_internally', 'multi_thread'],
    dealId: 'd2', nextAction: 'Schedule technical review',
    timeline: [
      { type: 'meeting', label: 'Demo with engineering team', time: 'Yesterday', sentiment: 'positive' },
      { type: 'signal', label: 'Forwarded to 3 colleagues', time: '2 days ago', sentiment: 'hot' },
      { type: 'email', label: 'Integration questions', time: '3 days ago', sentiment: 'neutral' },
      { type: 'signal', label: 'LinkedIn profile visit', time: '5 days ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.90, engagement: 0.85, dealMomentum: 0.78, multiThread: 0.75, sentiment: 0.82 },
  },
  {
    id: 'p3', name: 'Julia Novak', role: 'Head of Ops', company: 'c1', avatar: 'JN', warmth: 0.78, warmthDelta: -0.03,
    lastInteraction: '2d ago', meetings: 5, emails: 15, calls: 2, linkedinMsgs: 3,
    signals: ['multi_thread', 'cc_decision_maker', 'budget_question'],
    dealId: 'd1', nextAction: 'Address procurement concerns',
    timeline: [
      { type: 'email', label: 'Procurement process questions', time: '2 days ago', sentiment: 'neutral' },
      { type: 'meeting', label: 'Ops review - Sarah joined', time: '5 days ago', sentiment: 'positive' },
      { type: 'signal', label: "CC'd CFO on thread", time: '1 week ago', sentiment: 'hot' },
    ],
    scoringBreakdown: { recency: 0.82, engagement: 0.73, dealMomentum: 0.80, multiThread: 0.90, sentiment: 0.68 },
  },
  {
    id: 'p4', name: 'Tom Haruki', role: 'CEO', company: 'c3', avatar: 'TH', warmth: 0.71, warmthDelta: +0.12,
    lastInteraction: '3d ago', meetings: 4, emails: 9, calls: 2, linkedinMsgs: 6,
    signals: ['linkedin_engaged', 'event_attended', 'booked_demo'],
    dealId: 'd3', nextAction: 'Send pilot proposal',
    timeline: [
      { type: 'meeting', label: 'Discovery call - strong fit', time: '3 days ago', sentiment: 'positive' },
      { type: 'signal', label: 'Liked 2 LinkedIn posts', time: '5 days ago', sentiment: 'positive' },
      { type: 'signal', label: 'Attended webinar', time: '1 week ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.78, engagement: 0.70, dealMomentum: 0.65, multiThread: 0.40, sentiment: 0.85 },
  },
  {
    id: 'p5', name: 'Nina Patel', role: 'CFO', company: 'c2', avatar: 'NP', warmth: 0.65, warmthDelta: -0.02,
    lastInteraction: '5d ago', meetings: 3, emails: 12, calls: 1, linkedinMsgs: 1,
    signals: ['budget_question', 'cc_decision_maker'],
    dealId: 'd2', nextAction: 'Send ROI calculator',
    timeline: [
      { type: 'email', label: 'Budget cycle timing question', time: '5 days ago', sentiment: 'neutral' },
      { type: 'meeting', label: 'Financial review - Marcus joined', time: '2 weeks ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.65, engagement: 0.60, dealMomentum: 0.68, multiThread: 0.72, sentiment: 0.58 },
  },
  {
    id: 'p6', name: 'Leo Strand', role: 'Product Lead', company: 'c4', avatar: 'LS', warmth: 0.52, warmthDelta: +0.02,
    lastInteraction: '1w ago', meetings: 2, emails: 7, calls: 0, linkedinMsgs: 2,
    signals: ['page_view_docs', 'event_attended'],
    dealId: null, nextAction: 'Book discovery call',
    timeline: [
      { type: 'signal', label: 'Viewed API docs - 12min', time: '1 week ago', sentiment: 'positive' },
      { type: 'email', label: 'Follow-up from event', time: '2 weeks ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.52, engagement: 0.55, dealMomentum: 0.20, multiThread: 0.15, sentiment: 0.60 },
  },
  {
    id: 'p7', name: 'Ava Kim', role: 'VP Eng', company: 'c5', avatar: 'AK', warmth: 0.45, warmthDelta: -0.05,
    lastInteraction: '2w ago', meetings: 1, emails: 4, calls: 1, linkedinMsgs: 0,
    signals: ['event_attended', 'page_view_docs'],
    dealId: 'd4', nextAction: 'Send case study',
    timeline: [
      { type: 'meeting', label: 'Intro call - interested but busy', time: '2 weeks ago', sentiment: 'neutral' },
      { type: 'signal', label: 'Attended product launch event', time: '3 weeks ago', sentiment: 'positive' },
    ],
    scoringBreakdown: { recency: 0.42, engagement: 0.45, dealMomentum: 0.35, multiThread: 0.10, sentiment: 0.55 },
  },
  {
    id: 'p8', name: 'Raj Anand', role: 'Director Sales', company: 'c6', avatar: 'RA', warmth: 0.35, warmthDelta: +0.01,
    lastInteraction: '3w ago', meetings: 1, emails: 3, calls: 0, linkedinMsgs: 1,
    signals: ['cold_outbound_reply', 'linkedin_engaged'],
    dealId: null, nextAction: 'Nurture sequence',
    timeline: [
      { type: 'email', label: 'Replied - wants to revisit Q2', time: '3 weeks ago', sentiment: 'neutral' },
      { type: 'signal', label: 'Replied to cold outbound', time: '1 month ago', sentiment: 'positive' },
    ],
    scoringBreakdown: { recency: 0.35, engagement: 0.30, dealMomentum: 0.10, multiThread: 0.05, sentiment: 0.50 },
  },
  {
    id: 'p9', name: 'Elena Voss', role: 'COO', company: 'c3', avatar: 'EV', warmth: 0.28, warmthDelta: -0.08,
    lastInteraction: '1m ago', meetings: 0, emails: 5, calls: 0, linkedinMsgs: 2,
    signals: ['video_viewed', 'linkedin_engaged'],
    dealId: 'd3', nextAction: 'Re-engage via Tom',
    timeline: [
      { type: 'signal', label: 'Watched demo video - 80%', time: '1 month ago', sentiment: 'neutral' },
      { type: 'email', label: 'No reply to follow-up', time: '5 weeks ago', sentiment: 'cold' },
    ],
    scoringBreakdown: { recency: 0.25, engagement: 0.30, dealMomentum: 0.28, multiThread: 0.20, sentiment: 0.35 },
  },
  {
    id: 'p10', name: 'Kai Brennan', role: 'Founder', company: 'c4', avatar: 'KB', warmth: 0.18, warmthDelta: -0.04,
    lastInteraction: '6w ago', meetings: 0, emails: 2, calls: 0, linkedinMsgs: 0,
    signals: ['website_lead'],
    dealId: null, nextAction: 'Enrich + outbound',
    timeline: [
      { type: 'signal', label: 'Filled contact form', time: '6 weeks ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.18, engagement: 0.12, dealMomentum: 0.05, multiThread: 0.0, sentiment: 0.30 },
  },
  {
    id: 'p11', name: 'Diana Cruz', role: 'Sales Ops', company: 'c5', avatar: 'DC', warmth: 0.12, warmthDelta: 0,
    lastInteraction: '2m ago', meetings: 0, emails: 1, calls: 0, linkedinMsgs: 0,
    signals: ['list_import'],
    dealId: 'd4', nextAction: 'Enrich + sequence',
    timeline: [
      { type: 'signal', label: 'Imported from Apollo list', time: '2 months ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.10, engagement: 0.08, dealMomentum: 0.12, multiThread: 0.0, sentiment: 0.20 },
  },
  {
    id: 'p12', name: 'Owen Park', role: 'CRO', company: 'c6', avatar: 'OP', warmth: 0.06, warmthDelta: -0.01,
    lastInteraction: '3m ago', meetings: 0, emails: 0, calls: 0, linkedinMsgs: 0,
    signals: ['scraped_linkedin'],
    dealId: null, nextAction: 'Cold outbound',
    timeline: [
      { type: 'signal', label: 'Scraped from LinkedIn Sales Nav', time: '3 months ago', sentiment: 'neutral' },
    ],
    scoringBreakdown: { recency: 0.05, engagement: 0.02, dealMomentum: 0.0, multiThread: 0.0, sentiment: 0.10 },
  },
];

const DEALS: Deal[] = [
  { id: 'd1', name: 'Meridian Enterprise', value: 48000, stage: 'Negotiation', probability: 0.85, company: 'c1', health: 'strong' },
  { id: 'd2', name: 'Vault Pro Rollout', value: 32000, stage: 'Proposal', probability: 0.60, company: 'c2', health: 'healthy' },
  { id: 'd3', name: 'Prism Pilot', value: 12000, stage: 'Discovery', probability: 0.35, company: 'c3', health: 'at_risk' },
  { id: 'd4', name: 'Arcline POC', value: 8500, stage: 'Qualification', probability: 0.20, company: 'c5', health: 'stalled' },
];

const WARMTH_TIERS: WarmthTier[] = [
  { label: 'Hot', min: 0.7, color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  { label: 'Warm', min: 0.4, color: '#eab308', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.20)' },
  { label: 'Cool', min: 0.15, color: '#6366f1', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.20)' },
  { label: 'Cold', min: 0, color: '#475569', bg: 'rgba(71,85,105,0.06)', border: 'rgba(71,85,105,0.20)' },
];

const SIGNAL_LABELS: Record<string, string> = {
  replied_fast: 'Fast reply',
  opened_proposal: 'Opened proposal',
  visited_pricing: 'Pricing page',
  booked_demo: 'Booked demo',
  shared_internally: 'Shared internally',
  multi_thread: 'Multi-thread',
  cc_decision_maker: "CC'd decision maker",
  linkedin_engaged: 'LinkedIn active',
  budget_question: 'Budget Q',
  page_view_docs: 'Viewed docs',
  event_attended: 'Event attended',
  cold_outbound_reply: 'Outbound reply',
  video_viewed: 'Watched video',
  website_lead: 'Website lead',
  list_import: 'List import',
  scraped_linkedin: 'LinkedIn scrape',
};

const HEALTH_CONFIG = {
  strong: { label: 'Strong', color: '#22c55e', icon: '▲' },
  healthy: { label: 'Healthy', color: '#6366f1', icon: '●' },
  at_risk: { label: 'At Risk', color: '#f97316', icon: '◆' },
  stalled: { label: 'Stalled', color: '#ef4444', icon: '▼' },
} as const;

const SENTIMENT_CONFIG = {
  hot: { color: '#f97316', icon: '●' },
  positive: { color: '#22c55e', icon: '↗' },
  neutral: { color: '#64748b', icon: '→' },
  cold: { color: '#6366f1', icon: '↘' },
} as const;

const TIMELINE_ICONS: Record<TimelineEvent['type'], string> = { email: '✉', meeting: '◎', signal: '◈', call: '☎', linkedin: 'in' };

function getTier(warmth: number): WarmthTier {
  return WARMTH_TIERS.find((tier) => warmth >= tier.min) || WARMTH_TIERS[3];
}

function fmt(value: number): string {
  return value >= 1000 ? `£${(value / 1000).toFixed(0)}k` : `£${value}`;
}

function getAgentActions(contact: Contact) {
  const company = COMPANIES.find((c) => c.id === contact.company);
  const deal = contact.dealId ? DEALS.find((d) => d.id === contact.dealId) : null;

  return [
    {
      id: 'email',
      label: 'Draft Follow-up',
      icon: '✉',
      color: '#22c55e',
      credits: 2,
      preview: {
        type: 'email',
        subject: `Re: ${deal ? `${deal.name} — ` : ''}Next Steps`,
        body: `Hi ${contact.name.split(' ')[0]},\n\nFollowing up on our ${contact.lastInteraction === '2h ago' ? 'earlier conversation' : 'recent discussion'} — I wanted to ${deal?.stage === 'Negotiation' ? 'confirm the contract details we discussed' : deal?.stage === 'Proposal' ? 'see if you had a chance to review the proposal' : 'check in on timing for a next step'}.\n\n${contact.signals.includes('budget_question') ? 'Happy to walk through the ROI numbers in more detail if that would help with the budget conversation.' : "Let me know if there's anything else you need from our side."}\n\nBest,\nAndrew`,
        confidence: 0.87,
      },
    },
    {
      id: 'prep',
      label: 'Meeting Prep',
      icon: '◎',
      color: '#6366f1',
      credits: 4,
      preview: {
        type: 'briefing',
        sections: [
          `${contact.name} — ${contact.role} at ${company?.name}`,
          `${contact.meetings} meetings, ${contact.emails} emails, warmth trending ${contact.warmthDelta > 0 ? 'up' : 'down'}`,
          deal ? `Deal: ${deal.name} (${deal.stage}) — ${fmt(deal.value)} at ${Math.round(deal.probability * 100)}%` : 'No active deal',
          `Key signals: ${contact.signals.slice(0, 3).map((signal) => SIGNAL_LABELS[signal]).join(', ')}`,
          `Suggested agenda: ${contact.nextAction}`,
        ],
        confidence: 0.92,
      },
    },
    {
      id: 'reengage',
      label: contact.warmth > 0.5 ? 'Keep Warm' : 'Re-engage',
      icon: '↻',
      color: '#f97316',
      credits: 3,
      preview: {
        type: 'sequence',
        name: contact.warmth > 0.5 ? 'Nurture - Active Deal' : contact.warmth > 0.2 ? 'Re-engage - Gone Quiet' : 'Cold Reactivation',
        steps: contact.warmth > 0.5
          ? ['Send value-add content (Day 0)', 'LinkedIn touchpoint (Day 3)', 'Check-in email (Day 7)']
          : contact.warmth > 0.2
          ? ['Personalised re-engage email (Day 0)', 'LinkedIn connection + message (Day 2)', 'Value content share (Day 5)', 'Direct ask for call (Day 8)']
          : ['Enrich via Apollo (Day 0)', 'Cold personalised outbound (Day 1)', 'LinkedIn connect (Day 3)', 'Follow-up with case study (Day 6)', 'Break-up email (Day 10)'],
        confidence: contact.warmth > 0.5 ? 0.90 : 0.72,
      },
    },
    {
      id: 'task',
      label: 'Create Task',
      icon: '✓',
      color: '#eab308',
      credits: 0,
      preview: {
        type: 'task',
        title: contact.nextAction,
        due: contact.warmth > 0.7 ? 'Today' : contact.warmth > 0.4 ? 'Tomorrow' : 'This week',
        priority: contact.warmth > 0.7 ? 'High' : contact.warmth > 0.4 ? 'Medium' : 'Low',
        confidence: 0.95,
      },
    },
    {
      id: 'enrich',
      label: 'Enrich Profile',
      icon: '◈',
      color: '#8b5cf6',
      credits: 1,
      preview: {
        type: 'enrich',
        sources: ['Apollo', 'LinkedIn Sales Nav', 'Company website', 'News mentions'],
        fields: ['Direct phone', 'Tech stack', 'Recent funding', 'Org chart', 'Buying signals'],
        confidence: 0.88,
      },
    },
  ] as const;
}

export default function RelationshipGraphDemoPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const nodesRef = useRef<RenderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<RenderNode | null>(null);
  const [filter, setFilter] = useState('all');
  const [showOrbits, setShowOrbits] = useState(true);
  const [dims, setDims] = useState({ w: 900, h: 700 });
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [panelTab, setPanelTab] = useState<'overview' | 'timeline' | 'agents'>('overview');
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [actionFired, setActionFired] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const nodes = useMemo<RenderNode[]>(() => {
    let items = CONTACTS;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((contact) => {
        const companyName = COMPANIES.find((company) => company.id === contact.company)?.name.toLowerCase();
        return contact.name.toLowerCase().includes(q) || companyName?.includes(q);
      });
    }

    if (filter !== 'all') {
      const tier = WARMTH_TIERS.find((t) => t.label.toLowerCase() === filter);
      if (tier) {
        const prev = WARMTH_TIERS[WARMTH_TIERS.indexOf(tier) - 1];
        items = items.filter((contact) => contact.warmth >= tier.min && (!prev || contact.warmth < prev.min));
      }
    }

    return items.map((contact, i) => {
      const tier = getTier(contact.warmth);
      const companyData = COMPANIES.find((company) => company.id === contact.company);
      const deal = contact.dealId ? DEALS.find((d) => d.id === contact.dealId) : null;
      const angle = (i / items.length) * Math.PI * 2 + (contact.warmth * 2.7);
      const radius = (1 - contact.warmth) * 0.42 + 0.07;
      return { ...contact, tier, companyData, deal, angle, radius, x: 0, y: 0 };
    });
  }, [filter, searchQuery]);

  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDims({ w: r.width, h: r.height });
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    ctx.scale(dpr, dpr);

    let t = 0;
    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const maxR = Math.min(cx, cy) * 0.88;

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * dims.w,
      y: Math.random() * dims.h,
      size: Math.random() * 1.2 + 0.2,
      speed: Math.random() * 0.25 + 0.05,
      opacity: Math.random() * 0.25 + 0.03,
      hue: Math.random() > 0.6 ? 270 : Math.random() > 0.3 ? 230 : 200,
    }));

    const comets = nodes.filter((node) => node.warmthDelta > 0.03).map((node) => ({
      id: node.id,
      trail: [] as Array<{ x: number; y: number }>,
      maxTrail: 14,
    }));

    function draw() {
      t += 0.003;
      ctx.clearRect(0, 0, dims.w, dims.h);
      ctx.save();
      ctx.translate(cx + pan.x, cy + pan.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.5);
      bg.addColorStop(0, 'rgba(99, 102, 241, 0.045)');
      bg.addColorStop(0.2, 'rgba(139, 92, 246, 0.025)');
      bg.addColorStop(0.5, 'rgba(6, 182, 212, 0.012)');
      bg.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dims.w, dims.h);

      const nebulaT = t * 0.3;
      for (let i = 0; i < 3; i++) {
        const nx = cx + Math.cos(nebulaT + i * 2.1) * maxR * 0.3;
        const ny = cy + Math.sin(nebulaT * 0.7 + i * 1.4) * maxR * 0.25;
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, maxR * 0.4);
        const hues = ['99,102,241', '139,92,246', '6,182,212'];
        ng.addColorStop(0, `rgba(${hues[i]}, 0.02)`);
        ng.addColorStop(1, `rgba(${hues[i]}, 0)`);
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, dims.w, dims.h);
      }

      particles.forEach((particle) => {
        particle.y -= particle.speed;
        particle.x += Math.sin(t + particle.y * 0.008) * 0.12;
        if (particle.y < 0) {
          particle.y = dims.h;
          particle.x = Math.random() * dims.w;
        }
        // Keep flicker in a strictly positive range so arc radius cannot go negative.
        const flicker = 0.3 + ((Math.sin(t * 2.5 + particle.x * 0.4) + 1) * 0.35);
        const particleRadius = Math.max(0.01, particle.size * flicker);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particleRadius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${particle.hue}, 60%, 72%, ${Math.max(0, particle.opacity * flicker)})`;
        ctx.fill();
      });

      if (showOrbits) {
        [0.14, 0.30, 0.52, 0.76, 0.94].forEach((ratio, i) => {
          const r = ratio * maxR;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.05 * (i % 2 === 0 ? 1 : -1));
          ctx.translate(-cx, -cy);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(99, 102, 241, ${0.055 - i * 0.008})`;
          ctx.lineWidth = 0.7;
          ctx.setLineDash([2, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        });

        WARMTH_TIERS.forEach((tier, i) => {
          const labelR = [0.11, 0.36, 0.60, 0.86][i] * maxR;
          ctx.font = "600 8.5px 'DM Sans', sans-serif";
          ctx.fillStyle = `${tier.color}44`;
          ctx.textAlign = 'right';
          ctx.fillText(tier.label.toUpperCase(), cx - 10, cy - labelR + 3);
        });
      }

      const pulse = 1 + Math.sin(t * 2.5) * 0.05;
      for (let ring = 4; ring >= 0; ring--) {
        const rr = (18 + ring * 10) * pulse;
        const cg = ctx.createRadialGradient(cx, cy, rr * 0.3, cx, cy, rr);
        cg.addColorStop(0, `rgba(99,102,241,${0.04 - ring * 0.008})`);
        cg.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 17, 0, Math.PI * 2);
      const coreFill = ctx.createRadialGradient(cx - 5, cy - 5, 0, cx, cy, 17);
      coreFill.addColorStop(0, '#a5b4fc');
      coreFill.addColorStop(0.5, '#6366f1');
      coreFill.addColorStop(1, '#4338ca');
      ctx.fillStyle = coreFill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(165,180,252,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = "800 8.5px 'DM Sans', sans-serif";
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU', cx, cy);

      const positions: RenderNode[] = [];
      nodes.forEach((node, i) => {
        const speed = 0.10 * (1.1 - node.warmth * 0.55);
        const a = node.angle + t * speed;
        const r = node.radius * maxR;
        const jx = Math.sin(t * 1.6 + i * 2.3) * 2;
        const jy = Math.cos(t * 1.3 + i * 1.7) * 2;
        const x = cx + Math.cos(a) * r + jx;
        const y = cy + Math.sin(a) * r + jy;
        positions.push({ ...node, x, y });
      });

      const dealGroups: Record<string, RenderNode[]> = {};
      positions.forEach((node) => {
        if (node.dealId) {
          if (!dealGroups[node.dealId]) {
            dealGroups[node.dealId] = [];
          }
          dealGroups[node.dealId].push(node);
        }
      });

      Object.entries(dealGroups).forEach(([dealId, group]) => {
        if (group.length < 2) return;
        const deal = DEALS.find((d) => d.id === dealId);
        const hc = deal ? HEALTH_CONFIG[deal.health] : null;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            const bulge = dist * 0.12;
            const angle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(mx + Math.cos(angle) * bulge, my + Math.sin(angle) * bulge, b.x, b.y);
            ctx.strokeStyle = `${hc?.color || '#8b5cf6'}18`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      positions.forEach((node) => {
        const grad = ctx.createLinearGradient(cx, cy, node.x, node.y);
        grad.addColorStop(0, `${node.tier.color}03`);
        grad.addColorStop(0.6, `${node.tier.color}${Math.round((node.warmth * 0.18 + 0.02) * 255).toString(16).padStart(2, '0')}`);
        grad.addColorStop(1, `${node.tier.color}06`);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = node.warmth * 1.3 + 0.3;
        ctx.stroke();
      });

      comets.forEach((comet) => {
        const node = positions.find((n) => n.id === comet.id);
        if (!node) return;
        comet.trail.push({ x: node.x, y: node.y });
        if (comet.trail.length > comet.maxTrail) {
          comet.trail.shift();
        }
        comet.trail.forEach((pt, i) => {
          const progress = i / comet.trail.length;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, progress * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(249, 115, 22, ${progress * 0.25})`;
          ctx.fill();
        });
      });

      positions.forEach((node) => {
        const isSel = selectedId === node.id;
        const isHov = hovered?.id === node.id;
        const isMatch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const baseSize = 15 + node.warmth * 11;
        const size = baseSize + (isSel ? 5 : 0) + (isHov ? 3 : 0);

        if (isSel || isHov || node.warmth > 0.6 || isMatch) {
          const gs = size * (isSel ? 3.2 : isHov ? 2.6 : isMatch ? 2.3 : 1.7);
          const gg = ctx.createRadialGradient(node.x, node.y, size * 0.4, node.x, node.y, gs);
          gg.addColorStop(0, `${node.tier.color}30`);
          gg.addColorStop(0.4, `${node.tier.color}10`);
          gg.addColorStop(1, `${node.tier.color}00`);
          ctx.beginPath();
          ctx.arc(node.x, node.y, gs, 0, Math.PI * 2);
          ctx.fillStyle = gg;
          ctx.fill();
        }

        if (node.deal) {
          const health = HEALTH_CONFIG[node.deal.health];
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * node.deal.probability);
          ctx.strokeStyle = `${health.color}66`;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineCap = 'butt';
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
        const nf = ctx.createRadialGradient(node.x - size * 0.3, node.y - size * 0.3, 0, node.x, node.y, size);
        nf.addColorStop(0, `${node.tier.color}ee`);
        nf.addColorStop(0.6, `${node.tier.color}cc`);
        nf.addColorStop(1, `${node.tier.color}88`);
        ctx.fillStyle = nf;
        ctx.fill();

        if (isSel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (isHov || isMatch) {
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (Math.abs(node.warmthDelta) > 0.02) {
          const ax = node.x + size * 0.72;
          const ay = node.y - size * 0.72;
          const isUp = node.warmthDelta > 0;
          ctx.beginPath();
          ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = isUp ? '#22c55e' : '#ef4444';
          ctx.fill();
          ctx.font = '700 7px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isUp ? '↑' : '↓', ax, ay);
        }

        if (node.companyData) {
          const bx = node.x - size * 0.68;
          const by = node.y + size * 0.68;
          ctx.beginPath();
          ctx.arc(bx, by, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = node.companyData.color;
          ctx.fill();
          ctx.strokeStyle = '#030712';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = '700 6px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.companyData.logo, bx, by);
        }

        ctx.font = `700 ${8.5 + node.warmth * 3}px 'DM Sans', sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.avatar, node.x, node.y);

        if (node.warmth > 0.42 || isHov || isSel || isMatch) {
          ctx.font = `600 ${isSel ? 11.5 : 10.5}px 'DM Sans', sans-serif`;
          ctx.fillStyle = isSel || isHov ? '#f1f5f9' : 'rgba(226,232,240,0.6)';
          ctx.textAlign = 'center';
          ctx.fillText(node.name.split(' ')[0], node.x, node.y + size + 13);
          if (isHov || isSel) {
            ctx.font = "400 8.5px 'DM Sans', sans-serif";
            ctx.fillStyle = 'rgba(148,163,184,0.7)';
            ctx.fillText(`${node.role} · ${node.companyData?.name || ''}`, node.x, node.y + size + 24);
          }
        }
      });

      nodesRef.current = positions;
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [dims, nodes, selectedId, hovered, showOrbits, zoom, pan, searchQuery]);

  const hitTest = useCallback((mx: number, my: number): RenderNode | null => {
    const ex = (mx - dims.w / 2 - pan.x) / zoom + dims.w / 2;
    const ey = (my - dims.h / 2 - pan.y) / zoom + dims.h / 2;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      const s = 15 + node.warmth * 11 + 5;
      if ((ex - node.x) ** 2 + (ey - node.y) ** 2 < s * s * 1.8) {
        return node;
      }
    }
    return null;
  }, [dims, zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({ x: e.clientX, y: e.clientY });
    if (dragging.current) {
      setPan((prev) => ({ x: prev.x + e.clientX - dragStart.current.x, y: prev.y + e.clientY - dragStart.current.y }));
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const node = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    setHovered(node);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    }
  }, [hitTest]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (node) {
      setSelectedId(node.id);
      setPanelTab('overview');
      setExpandedAction(null);
      setActionFired(null);
    } else if (!dragging.current) {
      setSelectedId(null);
    }
  }, [hitTest]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.25, Math.min(4, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!hitTest(e.clientX - rect.left, e.clientY - rect.top)) {
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
    }
  }, [hitTest]);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hovered ? 'pointer' : 'grab';
    }
  }, [hovered]);

  const fireAction = (action: ReturnType<typeof getAgentActions>[number]) => {
    setActionFired(action.id);
    setTimeout(() => setActionFired(null), 3000);
  };

  const sc = useMemo(() => nodes.find((node) => node.id === selectedId) ?? null, [nodes, selectedId]);
  const sCompany = sc?.companyData;
  const sDeal = sc?.deal;
  const sRelated = sc ? CONTACTS.filter((contact) => contact.company === sc.company && contact.id !== sc.id) : [];
  const sActions = sc ? getAgentActions(sc) : [];

  const stats = useMemo(() => ({
    hot: CONTACTS.filter((contact) => contact.warmth >= 0.7).length,
    warm: CONTACTS.filter((contact) => contact.warmth >= 0.4 && contact.warmth < 0.7).length,
    cool: CONTACTS.filter((contact) => contact.warmth >= 0.15 && contact.warmth < 0.4).length,
    cold: CONTACTS.filter((contact) => contact.warmth < 0.15).length,
    pipeline: DEALS.reduce((sum, deal) => sum + deal.value, 0),
    trending: CONTACTS.filter((contact) => contact.warmthDelta > 0.03).length,
  }), []);

  const glass: React.CSSProperties = { background: 'rgba(17,17,24,0.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' };

  return (
    <div style={{ width: '100%', height: '100vh', background: '#030712', fontFamily: "'DM Sans','Inter',-apple-system,sans-serif", color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ ...glass, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(99,102,241,0.10)', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>60</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.3 }}>Relationship Graph</div>
        <div style={{ marginLeft: 16, position: 'relative' }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            style={{ width: 200, padding: '5px 12px 5px 26px', borderRadius: 7, fontSize: 11, background: 'rgba(42,42,58,0.3)', border: '1px solid rgba(42,42,58,0.4)', color: '#e2e8f0', outline: 'none' }}
          />
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#475569' }}>⌕</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
          {[{ l: 'Hot', c: stats.hot, clr: '#f97316' }, { l: 'Warm', c: stats.warm, clr: '#eab308' }, { l: 'Cool', c: stats.cool, clr: '#6366f1' }, { l: 'Cold', c: stats.cold, clr: '#475569' }].map((statItem) => (
            <button
              key={statItem.l}
              onClick={() => setFilter((current) => current === statItem.l.toLowerCase() ? 'all' : statItem.l.toLowerCase())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 9px',
                borderRadius: 5,
                background: filter === statItem.l.toLowerCase() ? `${statItem.clr}22` : `${statItem.clr}0a`,
                border: filter === statItem.l.toLowerCase() ? `1px solid ${statItem.clr}50` : `1px solid ${statItem.clr}18`,
                fontSize: 10,
                fontWeight: 600,
                color: statItem.clr,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statItem.clr }} />
              {statItem.c}
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: 'rgba(42,42,58,0.4)', margin: '0 3px' }} />
          <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.22)', fontSize: 10, fontWeight: 600, color: '#a78bfa' }}>Pipeline {fmt(stats.pipeline)}</div>
          {stats.trending > 0 && (
            <div style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)', fontSize: 10, fontWeight: 600, color: '#86efac' }}>
              ↑ {stats.trending} trending
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '5px 18px', display: 'flex', alignItems: 'center', gap: 5, borderBottom: '1px solid rgba(42,42,58,0.30)', background: 'rgba(17,17,24,0.35)', flexShrink: 0 }}>
        <PillBtn active={showOrbits} onClick={() => setShowOrbits(!showOrbits)}>Orbits</PillBtn>
        <PillBtn active={filter === 'all'} onClick={() => setFilter('all')}>All</PillBtn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
          <ZBtn onClick={() => setZoom((z) => Math.max(0.25, z - 0.2))}>-</ZBtn>
          <span style={{ fontSize: 10, color: '#64748b', minWidth: 34, textAlign: 'center', fontFamily: 'monospace' }}>{Math.round(zoom * 100)}%</span>
          <ZBtn onClick={() => setZoom((z) => Math.min(4, z + 0.2))}>+</ZBtn>
          <ZBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} wide>Reset</ZBtn>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {hovered && !selectedId && (
            <div style={{ position: 'fixed', left: mouse.x + 16, top: mouse.y - 12, ...glass, border: `1px solid ${hovered.tier.color}25`, borderRadius: 10, padding: '10px 14px', pointerEvents: 'none', zIndex: 100, minWidth: 210 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${hovered.tier.color}bb`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{hovered.avatar}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{hovered.name}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{hovered.role} · {hovered.companyData?.name}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                <TipStat l="Warmth" v={`${Math.round(hovered.warmth * 100)}%`} c={hovered.tier.color} />
                <TipStat l="Trend" v={hovered.warmthDelta > 0 ? `+${Math.round(hovered.warmthDelta * 100)}` : `${Math.round(hovered.warmthDelta * 100)}`} c={hovered.warmthDelta > 0 ? '#22c55e' : '#ef4444'} />
                <TipStat l="Last" v={hovered.lastInteraction} />
                <TipStat l="Mtgs" v={hovered.meetings} />
              </div>
              {hovered.deal && <div style={{ marginTop: 6, padding: '4px 7px', borderRadius: 5, background: 'rgba(139,92,246,0.08)', fontSize: 10, color: '#a78bfa' }}>{hovered.deal.name} · {hovered.deal.stage} · {fmt(hovered.deal.value)}</div>}
            </div>
          )}
          {!selectedId && <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: '#475569', ...glass, padding: '5px 14px', borderRadius: 20, border: '1px solid rgba(42,42,58,0.20)' }}>Click to inspect · Scroll to zoom · Drag to pan · {nodes.length} contacts</div>}
        </div>

        {sc && (
          <div style={{ width: 360, flexShrink: 0, borderLeft: '1px solid rgba(99,102,241,0.10)', ...glass, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(42,42,58,0.30)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: `linear-gradient(135deg, ${sc.tier.color}dd, ${sc.tier.color}77)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', position: 'relative' }}>
                    {sc.avatar}
                    {sc.warmthDelta !== 0 && <div style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: sc.warmthDelta > 0 ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>{sc.warmthDelta > 0 ? '↑' : '↓'}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{sc.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{sc.role} · {sCompany?.name}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ background: 'rgba(42,42,58,0.4)', border: 'none', color: '#64748b', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Warmth Score</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10, color: sc.warmthDelta > 0 ? '#22c55e' : sc.warmthDelta < 0 ? '#ef4444' : '#64748b' }}>{sc.warmthDelta > 0 ? '+' : ''}{Math.round(sc.warmthDelta * 100)}%</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: sc.tier.color }}>{Math.round(sc.warmth * 100)}</span>
                  </div>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(42,42,58,0.35)', overflow: 'hidden' }}>
                  <div style={{ width: `${sc.warmth * 100}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${sc.tier.color}55, ${sc.tier.color})`, boxShadow: `0 0 10px ${sc.tier.color}33`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(42,42,58,0.30)' }}>
              {(['overview', 'timeline', 'agents'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setPanelTab(tab); setExpandedAction(null); }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: panelTab === tab ? '#e2e8f0' : '#475569',
                    borderBottom: panelTab === tab ? `2px solid ${sc.tier.color}` : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {panelTab === 'overview' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
                  {([['Meetings', sc.meetings], ['Emails', sc.emails], ['Calls', sc.calls], ['LinkedIn', sc.linkedinMsgs]] as const).map(([label, value]) => (
                    <div key={label} style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(42,42,58,0.12)', border: '1px solid rgba(42,42,58,0.20)', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
                      <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 16px 12px' }}>
                  <SL>Warmth Breakdown</SL>
                  {Object.entries(sc.scoringBreakdown).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', width: 78, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(42,42,58,0.35)', overflow: 'hidden' }}>
                        <div style={{ width: `${val * 100}%`, height: '100%', borderRadius: 2, background: val > 0.7 ? '#f97316' : val > 0.4 ? '#eab308' : '#6366f1', transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', width: 26, textAlign: 'right' }}>{Math.round(val * 100)}</span>
                    </div>
                  ))}
                </div>
                {sDeal && (
                  <div style={{ padding: '0 16px 12px' }}>
                    <SL>Active Deal</SL>
                    <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{sDeal.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#a78bfa' }}>{fmt(sDeal.value)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                        <Tag bg="rgba(99,102,241,0.10)" c="#a5b4fc">{sDeal.stage}</Tag>
                        <Tag bg="rgba(34,197,94,0.08)" c="#86efac">{Math.round(sDeal.probability * 100)}%</Tag>
                        <Tag bg={`${HEALTH_CONFIG[sDeal.health].color}12`} c={HEALTH_CONFIG[sDeal.health].color}>{HEALTH_CONFIG[sDeal.health].icon} {HEALTH_CONFIG[sDeal.health].label}</Tag>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ padding: '0 16px 12px' }}>
                  <SL>Signals</SL>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {sc.signals.map((signal) => (
                      <span key={signal} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 5, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.10)', color: '#a5b4fc', fontWeight: 500 }}>
                        {SIGNAL_LABELS[signal]}
                      </span>
                    ))}
                  </div>
                </div>
                {sRelated.length > 0 && (
                  <div style={{ padding: '0 16px 12px' }}>
                    <SL>Related at {sCompany?.name}</SL>
                    {sRelated.map((relatedContact) => {
                      const relatedTier = getTier(relatedContact.warmth);
                      return (
                        <div
                          key={relatedContact.id}
                          onClick={() => { setSelectedId(relatedContact.id); setPanelTab('overview'); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, transition: 'background 0.15s' }}
                          onMouseOver={(event) => { event.currentTarget.style.background = 'rgba(42,42,58,0.20)'; }}
                          onMouseOut={(event) => { event.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{ width: 22, height: 22, borderRadius: 5, background: `${relatedTier.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: '#e2e8f0' }}>{relatedContact.avatar}</div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 500 }}>{relatedContact.name}</div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>{relatedContact.role}</div>
                          </div>
                          <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: relatedTier.color }}>{Math.round(relatedContact.warmth * 100)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ padding: '0 16px 16px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>◎</div>
                    <div>
                      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next Step</div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1 }}>{sc.nextAction}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {panelTab === 'timeline' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                <SL>Activity Timeline</SL>
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 1, background: 'rgba(42,42,58,0.35)' }} />
                  {sc.timeline.map((eventItem, i) => {
                    const sent = SENTIMENT_CONFIG[eventItem.sentiment] || SENTIMENT_CONFIG.neutral;
                    return (
                      <div key={i} style={{ marginBottom: 14, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: -17, top: 3, width: 10, height: 10, borderRadius: '50%', background: sent.color, border: '2px solid #030712' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{TIMELINE_ICONS[eventItem.type] || '·'} {eventItem.type[0].toUpperCase() + eventItem.type.slice(1)}</span>
                          <span style={{ fontSize: 9, color: '#475569' }}>{eventItem.time}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }}>{eventItem.label}</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, fontSize: 9, color: sent.color, background: `${sent.color}10`, padding: '2px 6px', borderRadius: 4 }}>{sent.icon} {eventItem.sentiment}</div>
                      </div>
                    );
                  })}
                  {sc.timeline.length === 0 && <div style={{ fontSize: 11, color: '#475569', padding: 20, textAlign: 'center' }}>No activity yet</div>}
                </div>
              </div>
            )}

            {panelTab === 'agents' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                <SL>Agent Actions</SL>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {sActions.map((action) => {
                    const isExp = expandedAction === action.id;
                    const isFired = actionFired === action.id;
                    return (
                      <div key={action.id} style={{ borderRadius: 9, background: isFired ? `${action.color}10` : isExp ? 'rgba(42,42,58,0.22)' : 'rgba(42,42,58,0.10)', border: isFired ? `1px solid ${action.color}35` : isExp ? '1px solid rgba(99,102,241,0.12)' : '1px solid rgba(42,42,58,0.22)', transition: 'all 0.2s' }}>
                        <button onClick={() => setExpandedAction(isExp ? null : action.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', width: '100%', textAlign: 'left' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: `${action.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{action.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{isFired ? `✓ ${action.label} - Triggered` : action.label}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{action.credits > 0 ? `${action.credits} credits` : 'Free'} · {Math.round(action.preview.confidence * 100)}% confidence</div>
                          </div>
                          <span style={{ fontSize: 10, color: '#475569', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                        </button>
                        {isExp && !isFired && (
                          <div style={{ padding: '0 12px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                              <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(42,42,58,0.35)', overflow: 'hidden' }}>
                                <div style={{ width: `${action.preview.confidence * 100}%`, height: '100%', borderRadius: 2, background: action.color }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#94a3b8' }}>{Math.round(action.preview.confidence * 100)}%</span>
                            </div>
                            <div style={{ background: 'rgba(3,7,18,0.45)', borderRadius: 7, padding: '10px 12px', border: '1px solid rgba(42,42,58,0.25)' }}>
                              {action.preview.type === 'email' && (
                                <>
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Subject: <span style={{ color: '#94a3b8' }}>{action.preview.subject}</span></div>
                                  <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>{action.preview.body}</div>
                                </>
                              )}
                              {action.preview.type === 'briefing' && action.preview.sections.map((section, i) => <div key={i} style={{ fontSize: 11, color: i === 0 ? '#e2e8f0' : '#94a3b8', marginBottom: 3, fontWeight: i === 0 ? 600 : 400 }}>{section}</div>)}
                              {action.preview.type === 'sequence' && (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 5, color: action.color }}>{action.preview.name}</div>
                                  {action.preview.steps.map((step, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}><div style={{ width: 15, height: 15, borderRadius: 4, background: 'rgba(42,42,58,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>{i + 1}</div><span style={{ fontSize: 10, color: '#94a3b8' }}>{step}</span></div>)}
                                </>
                              )}
                              {action.preview.type === 'task' && (
                                <>
                                  <div style={{ fontSize: 12, fontWeight: 600 }}>{action.preview.title}</div>
                                  <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                                    <Tag bg="rgba(234,179,8,0.08)" c="#fde047">Due: {action.preview.due}</Tag>
                                    <Tag bg="rgba(99,102,241,0.08)" c="#a5b4fc">{action.preview.priority}</Tag>
                                  </div>
                                </>
                              )}
                              {action.preview.type === 'enrich' && (
                                <>
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>Sources: {action.preview.sources.join(', ')}</div>
                                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Fields: {action.preview.fields.join(', ')}</div>
                                </>
                              )}
                            </div>
                            <button onClick={() => fireAction(action)} style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, background: `linear-gradient(135deg, ${action.color}cc, ${action.color}88)`, border: 'none', color: '#fff', cursor: 'pointer', transition: 'all 0.2s' }}>
                              Trigger {action.label} · {action.credits > 0 ? `${action.credits} credits` : 'Free'}
                            </button>
                          </div>
                        )}
                        {isFired && <div style={{ padding: '0 12px 10px', display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 16, height: 16, borderRadius: '50%', background: `${action.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: action.color }}>✓</div><span style={{ fontSize: 11, color: action.color }}>Queued - executing via Command Centre</span></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TipStat({ l, v, c }: { l: string; v: string | number; c?: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: c || '#e2e8f0', marginTop: 1 }}>{v}</div>
    </div>
  );
}

function SL({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>{children}</div>;
}

function Tag({ bg, c, children }: { bg: string; c: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: bg, color: c, fontWeight: 500 }}>{children}</span>;
}

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 500, border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(42,42,58,0.35)', background: active ? 'rgba(99,102,241,0.10)' : 'transparent', color: active ? '#a5b4fc' : '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>{children}</button>;
}

function ZBtn({ onClick, children, wide }: { onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return <button onClick={onClick} style={{ width: wide ? 'auto' : 22, height: 22, padding: wide ? '2px 8px' : 0, borderRadius: 4, background: 'rgba(42,42,58,0.25)', border: '1px solid rgba(42,42,58,0.40)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: wide ? 10 : 13 }}>{children}</button>;
}
