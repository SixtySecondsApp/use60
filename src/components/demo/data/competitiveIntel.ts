// Demo competitive intelligence data
// Tracks competitor encounters, win rates, and strategic patterns

export interface CompetitorStrength {
  name: string;
  encounters: number; // out of total encounters where this was mentioned
  description: string;
}

export interface CompetitorWeakness {
  name: string;
  encounters: number;
  description: string;
}

export interface MonthlyTrend {
  month: string;
  encounters: number;
  wins: number;
  losses: number;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  logo?: string;
  totalEncounters: number;
  winRate: number;
  wins: number;
  losses: number;
  pending: number;
  avgDealSizeWhenCompeting: number;
  strengths: CompetitorStrength[];
  weaknesses: CompetitorWeakness[];
  bestCounterPositioning: string;
  keyBattleCardPoints: string[];
  monthlyTrend: MonthlyTrend[];
  activeDeals: string[]; // deal IDs where this competitor is present
  recentEncounterNotes: string[];
}

export const competitors: CompetitorProfile[] = [
  {
    id: 'comp-intercom',
    name: 'Intercom',
    totalEncounters: 12,
    winRate: 0.58,
    wins: 7,
    losses: 5,
    pending: 0,
    avgDealSizeWhenCompeting: 135000,
    strengths: [
      { name: 'Pricing & Packaging', encounters: 9, description: 'Aggressive startup pricing and flexible seat-based model resonates with finance teams' },
      { name: 'Brand Recognition', encounters: 7, description: 'Strong brand in the SMB/mid-market space — prospects often have prior experience' },
      { name: 'Chat Widget UX', encounters: 5, description: 'Best-in-class chat widget design — often the first thing prospects compare' },
      { name: 'Self-Serve Onboarding', encounters: 4, description: 'Can get started without implementation support — appeals to lean teams' },
    ],
    weaknesses: [
      { name: 'Integration Depth', encounters: 8, description: 'Shallow integrations — works with many tools but none deeply. Critical gap for engineering-led orgs.' },
      { name: 'Customization', encounters: 6, description: 'Limited workflow customization — enterprises hit walls quickly. Template-driven, not flexible.' },
      { name: 'Reporting & Analytics', encounters: 5, description: 'Basic reporting. No cohort analysis, limited custom dashboards, poor data export options.' },
      { name: 'Enterprise Security', encounters: 4, description: 'SCIM support is beta, no custom SSO configurations, SOC2 Type II but limited compliance controls.' },
    ],
    bestCounterPositioning: 'When prospects mention Intercom, lead with integration depth. Ask: "How important is it that your support platform talks to your engineering tools in real-time?" Intercom\'s Jira integration is read-only and delayed. Ours is bi-directional and real-time. This is the #1 reason engineering-led companies choose us over Intercom.',
    keyBattleCardPoints: [
      'Intercom Jira integration is read-only — ours is bi-directional real-time',
      'Their analytics lack cohort analysis — critical for product-led teams',
      'Enterprise pricing jumps significantly past 50 seats — our pricing scales linearly',
      'No custom workflow builder — everything is template-based',
      'SCIM provisioning is still in beta (as of Feb 2026)',
      'Recent price increase (April 2026) creates switching urgency',
    ],
    monthlyTrend: [
      { month: '2025-10', encounters: 2, wins: 1, losses: 1 },
      { month: '2025-11', encounters: 3, wins: 2, losses: 1 },
      { month: '2025-12', encounters: 1, wins: 1, losses: 0 },
      { month: '2026-01', encounters: 1, wins: 0, losses: 1 },
      { month: '2026-02', encounters: 4, wins: 2, losses: 1 },
    ],
    activeDeals: ['deal-001'], // DataFlow — Lisa Park evaluated Intercom
    recentEncounterNotes: [
      'DataFlow (Feb 2026): Lisa Park previously evaluated Intercom Q3 2025. Found integration depth lacking for their Jira-heavy workflow. Intercom rep spotted at DataFlow office — aggressive pursuit.',
      'QuantumLeap (Jan 2026): Lost to Intercom on price. Their CTO prioritized lower upfront cost over integration depth. Lesson: engage finance earlier to show TCO advantage.',
      'NovaTech (Dec 2025): Won. Champion specifically cited our Jira integration as the deciding factor. Intercom demo went poorly — their SE couldn\'t answer Jira questions.',
    ],
  },
  {
    id: 'comp-zendesk',
    name: 'Zendesk AI',
    totalEncounters: 8,
    winRate: 0.45,
    wins: 3,
    losses: 4,
    pending: 1,
    avgDealSizeWhenCompeting: 110000,
    strengths: [
      { name: 'Enterprise Incumbency', encounters: 6, description: 'Many enterprises already have Zendesk — AI add-on is an easy upsell vs. rip-and-replace' },
      { name: 'Ticketing Maturity', encounters: 5, description: 'Most mature ticketing system — decades of iteration on core support workflows' },
      { name: 'Marketplace & Ecosystem', encounters: 4, description: 'Largest app marketplace — 1,200+ integrations available (though many are shallow)' },
      { name: 'Global Support Infrastructure', encounters: 3, description: 'Multi-language, multi-timezone support centers — appeals to global enterprises' },
    ],
    weaknesses: [
      { name: 'AI Quality', encounters: 6, description: 'AI features feel bolted-on rather than native. Answer Bot accuracy consistently 15-20% below ours in head-to-head tests.' },
      { name: 'Modern UX', encounters: 5, description: 'Interface feels dated. Agents complain about workflow friction. Customer-facing widget looks 2018.' },
      { name: 'Health Scoring', encounters: 5, description: 'Customer health scoring is rudimentary — no predictive churn analysis, no engagement correlation.' },
      { name: 'Price-to-Value at Scale', encounters: 3, description: 'Per-agent pricing gets expensive quickly. AI features require premium tier ($115/agent/month).' },
    ],
    bestCounterPositioning: 'Against Zendesk AI, emphasize the cost of staying vs. switching. Calculate: "You\'re paying $X/agent/month for Zendesk + $Y for AI add-on + $Z for the integrations that should be native. With us, that\'s one platform at 40% lower TCO." The health scoring gap is especially powerful — ask prospects to demo their current health scores and watch them struggle.',
    keyBattleCardPoints: [
      'Zendesk AI answer accuracy: ~65% vs. our 82% in head-to-head benchmarks',
      'Health scoring comparison: their 3 metrics vs. our 12-factor model with predictive analytics',
      'Per-agent pricing inflates rapidly — show TCO comparison at 50/100/200 agents',
      'Their customer portal hasn\'t been redesigned since 2019',
      'AI features locked behind Suite Professional ($115/agent) or Enterprise ($169/agent)',
      'TechVault is actively churning from Zendesk — use as proof point (with permission)',
    ],
    monthlyTrend: [
      { month: '2025-10', encounters: 1, wins: 0, losses: 1 },
      { month: '2025-11', encounters: 2, wins: 1, losses: 1 },
      { month: '2025-12', encounters: 2, wins: 1, losses: 1 },
      { month: '2026-01', encounters: 1, wins: 0, losses: 1 },
      { month: '2026-02', encounters: 2, wins: 1, losses: 0 },
    ],
    activeDeals: ['deal-005'], // TechVault — churning from Zendesk
    recentEncounterNotes: [
      'TechVault (Feb 2026): Rachel Adams explicitly moving away from Zendesk AI due to "broken customer health scoring." Ben Foster posted publicly about the pain. Contract ends March 31.',
      'BrightPath (Jan 2026): Lost. Zendesk incumbent too entrenched — migration cost concerns outweighed feature advantages. Key learning: address migration fear early with dedicated onboarding timeline.',
      'CoreStack (Nov 2025): Won. Zendesk couldn\'t demonstrate predictive churn analysis. Our health score demo was the closing moment.',
    ],
  },
  {
    id: 'comp-ada',
    name: 'Ada',
    totalEncounters: 5,
    winRate: 0.70,
    wins: 3,
    losses: 1,
    pending: 1,
    avgDealSizeWhenCompeting: 85000,
    strengths: [
      { name: 'AI-Native Architecture', encounters: 4, description: 'Built from ground up as AI-first platform. No legacy baggage. Clean developer experience.' },
      { name: 'Conversation Design', encounters: 3, description: 'Best-in-class conversation flow builder. Non-technical teams can build complex bots.' },
      { name: 'Time to Value', encounters: 3, description: 'Can have basic bot live in 24 hours. Fastest deployment in the category.' },
    ],
    weaknesses: [
      { name: 'Platform Breadth', encounters: 4, description: 'Focused on AI chatbot only — no ticketing, no customer success, no health scoring. Single-purpose tool.' },
      { name: 'Enterprise Features', encounters: 3, description: 'Limited audit logging, basic RBAC, no custom SLA management. Not enterprise-ready.' },
      { name: 'Human Handoff', encounters: 3, description: 'Bot-to-human handoff is clunky. Agents lose conversation context. No warm transfer capability.' },
      { name: 'Reporting Depth', encounters: 2, description: 'Bot analytics are good, but no end-to-end customer journey analytics. Can\'t connect bot interactions to support outcomes.' },
    ],
    bestCounterPositioning: 'Ada is a great chatbot. But prospects don\'t need just a chatbot — they need a customer platform. Ask: "What happens when the bot can\'t solve it? What\'s your agent experience? How do you track customer health across all channels?" Ada answers none of these. We\'re one platform, not a point solution.',
    keyBattleCardPoints: [
      'Ada is chatbot-only — no ticketing, no knowledge base, no customer health',
      'Human handoff loses conversation context — agents start from scratch',
      'No customer success features — can\'t track health scores or churn risk',
      'Enterprise security gaps: basic RBAC, limited audit trail',
      'Pricing per resolution can spike unexpectedly — hard for finance to forecast',
    ],
    monthlyTrend: [
      { month: '2025-10', encounters: 1, wins: 1, losses: 0 },
      { month: '2025-11', encounters: 0, wins: 0, losses: 0 },
      { month: '2025-12', encounters: 1, wins: 0, losses: 1 },
      { month: '2026-01', encounters: 1, wins: 1, losses: 0 },
      { month: '2026-02', encounters: 2, wins: 1, losses: 0 },
    ],
    activeDeals: ['deal-005'], // TechVault — Ada possibly in play
    recentEncounterNotes: [
      'TechVault (Feb 2026): Rachel Adams follows Ada\'s CEO on Twitter. May be evaluating. Ada\'s chatbot-only approach won\'t meet their full-platform needs — use this.',
      'StreamLine (Jan 2026): Won. Prospect initially attracted to Ada\'s fast deployment but realized they needed ticketing + health scoring. Ada couldn\'t deliver a complete solution.',
      'FlexiPay (Dec 2025): Lost. Small team (15 agents) only needed chatbot automation. Ada\'s simplicity won. Lesson: Ada wins when scope is narrow.',
    ],
  },
];

// ── Cross-Deal Pattern Analysis ──────────────────────────────────

export interface ObjectionCluster {
  objection: string;
  frequency: number;
  dealsAffected: string[];
  bestResponse: string;
  winRateWhenHandled: number;
}

export interface StageBottleneck {
  fromStage: string;
  toStage: string;
  avgDaysInStage: number;
  teamAvgDays: number;
  topBlocker: string;
  recommendation: string;
}

export interface EngagementCorrelation {
  signal: string;
  correlationStrength: number; // 0-1
  description: string;
  direction: 'positive' | 'negative';
}

export interface WinLossFactor {
  factor: string;
  winCorrelation: number; // 0-1, higher = more correlated with wins
  occurrenceRate: number; // % of deals where this factor was present
  description: string;
}

export interface CrossDealPatterns {
  objectionClustering: ObjectionCluster[];
  stageBottlenecks: StageBottleneck[];
  engagementCorrelations: EngagementCorrelation[];
  winLossFactors: WinLossFactor[];
}

export const crossDealPatterns: CrossDealPatterns = {
  objectionClustering: [
    {
      objection: 'Integration complexity',
      frequency: 7,
      dealsAffected: ['deal-001', 'deal-005'],
      bestResponse: 'Show the 15-minute Jira setup video. Walk through bi-directional sync live. Offer a free sandbox environment for their team to test. Quote: "Our median integration time is 2.3 hours, not 2 weeks."',
      winRateWhenHandled: 0.82,
    },
    {
      objection: 'Price vs. incumbent',
      frequency: 6,
      dealsAffected: ['deal-003', 'deal-004'],
      bestResponse: 'Shift conversation from license cost to total cost of ownership. Include: agent productivity savings (22% avg improvement), reduced escalation rate (35% avg), eliminated point-solution costs. Show the ROI calculator with their specific numbers.',
      winRateWhenHandled: 0.71,
    },
    {
      objection: 'Migration risk and timeline',
      frequency: 5,
      dealsAffected: ['deal-005'],
      bestResponse: 'Present the phased migration plan: Week 1-2 parallel running, Week 3-4 gradual cutover, Week 5-6 optimization. Offer dedicated migration engineer. Reference: "CloudBase migrated from Zendesk in 18 days with zero downtime."',
      winRateWhenHandled: 0.67,
    },
    {
      objection: 'Need to evaluate more vendors',
      frequency: 4,
      dealsAffected: ['deal-001'],
      bestResponse: 'Don\'t resist — enable the evaluation. Provide a comparison framework that highlights your strengths. Say: "I want you to make the best decision. Here\'s a criteria matrix that covers the key differentiators. Happy to help you evaluate fairly."',
      winRateWhenHandled: 0.60,
    },
    {
      objection: 'Internal adoption concerns',
      frequency: 3,
      dealsAffected: ['deal-001', 'deal-003'],
      bestResponse: 'Offer a pilot program: 2 teams, 30 days, defined success metrics. Show adoption curves from similar deployments. "Our average team reaches 80% daily active usage within 2 weeks — because it lives where they already work (Slack, Jira, email)."',
      winRateWhenHandled: 0.78,
    },
  ],

  stageBottlenecks: [
    {
      fromStage: 'Discovery',
      toStage: 'Proposal',
      avgDaysInStage: 12,
      teamAvgDays: 18,
      topBlocker: 'Waiting for prospect to schedule follow-up meeting',
      recommendation: 'Sarah is 33% faster than team average at Discovery→Proposal. Key habit: she sends tailored follow-up within 2 hours and always proposes specific meeting times.',
    },
    {
      fromStage: 'Proposal',
      toStage: 'Negotiation',
      avgDaysInStage: 14,
      teamAvgDays: 11,
      topBlocker: 'Internal review cycles on prospect side — proposal sits in procurement queue',
      recommendation: 'Sarah is slower than average here. Pattern: proposals go to procurement without an internal champion pushing. Recommendation: identify and enable an internal champion before sending the proposal.',
    },
    {
      fromStage: 'Negotiation',
      toStage: 'Closed Won',
      avgDaysInStage: 8,
      teamAvgDays: 15,
      topBlocker: 'Legal redline cycles',
      recommendation: 'Sarah excels at closing once in negotiation (47% faster than team). Tactic: she pre-addresses common legal concerns in the proposal itself, reducing redline cycles.',
    },
  ],

  engagementCorrelations: [
    {
      signal: 'Proposal opened 3+ times in 48 hours',
      correlationStrength: 0.85,
      description: 'Prospects who open the proposal 3+ times within 48 hours close at 78% rate (vs. 34% baseline)',
      direction: 'positive',
    },
    {
      signal: 'Champion forwards email to unknown internal contact',
      correlationStrength: 0.79,
      description: 'When a champion forwards emails internally, deal velocity increases 2.3x — indicates active internal selling',
      direction: 'positive',
    },
    {
      signal: 'No response within 5 business days of proposal',
      correlationStrength: 0.72,
      description: 'Deals with 5+ day silence after proposal have only 23% close rate. Immediate re-engagement required.',
      direction: 'negative',
    },
    {
      signal: 'Prospect visits pricing page independently',
      correlationStrength: 0.68,
      description: 'Self-serve pricing page visits during active deal indicate budget preparation — 65% close rate',
      direction: 'positive',
    },
    {
      signal: 'Multiple stakeholder email opens within same hour',
      correlationStrength: 0.74,
      description: 'When 2+ stakeholders open the same email within 1 hour, indicates internal discussion — deal advancing',
      direction: 'positive',
    },
    {
      signal: 'Champion LinkedIn activity drops',
      correlationStrength: 0.61,
      description: 'When a champion\'s LinkedIn activity drops significantly, often indicates internal restructuring or role change risk',
      direction: 'negative',
    },
  ],

  winLossFactors: [
    {
      factor: 'Multi-threaded (3+ contacts engaged)',
      winCorrelation: 0.82,
      occurrenceRate: 0.45,
      description: 'Deals with 3+ engaged contacts win at 82% vs. 31% for single-threaded deals',
    },
    {
      factor: 'Technical champion identified',
      winCorrelation: 0.76,
      occurrenceRate: 0.60,
      description: 'Having a technical champion (eng/IT leader) who actively evaluates increases win rate to 76%',
    },
    {
      factor: 'Economic buyer engaged before Proposal stage',
      winCorrelation: 0.71,
      occurrenceRate: 0.35,
      description: 'Engaging the budget holder before sending proposal correlates with 71% win rate',
    },
    {
      factor: 'Competitor displacement (vs. greenfield)',
      winCorrelation: 0.55,
      occurrenceRate: 0.65,
      description: 'Displacement deals are harder (55% win rate) but represent 65% of pipeline',
    },
    {
      factor: 'Live demo within first 2 meetings',
      winCorrelation: 0.73,
      occurrenceRate: 0.70,
      description: 'Showing a live demo (not slides) in the first 2 meetings correlates with 73% win rate',
    },
    {
      factor: 'Follow-up email within 1 hour of meeting',
      winCorrelation: 0.69,
      occurrenceRate: 0.40,
      description: 'Rapid follow-up (within 1 hour) correlates with 69% win rate vs. 48% for slower follow-ups',
    },
  ],
};

// Helper
export const getCompetitorById = (id: string) =>
  competitors.find((c) => c.id === id);

export const getCompetitorsForDeal = (dealId: string) =>
  competitors.filter((c) => c.activeDeals.includes(dealId));

export const getTopCompetitorThreat = () =>
  [...competitors].sort((a, b) => {
    // Sort by recent encounter volume * inverse win rate (higher = bigger threat)
    const aRecent = a.monthlyTrend.slice(-2).reduce((sum, m) => sum + m.encounters, 0);
    const bRecent = b.monthlyTrend.slice(-2).reduce((sum, m) => sum + m.encounters, 0);
    return (bRecent * (1 - b.winRate)) - (aRecent * (1 - a.winRate));
  })[0];
