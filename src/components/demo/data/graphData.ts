// Demo relationship graph data for D3 force visualization
// Maps Sarah Chen's professional network with health indicators and warm intro paths

export type NodeHealth = 'healthy' | 'at_risk' | 'critical' | 'ghost';

export interface GraphNode {
  id: string;
  name: string;
  title: string;
  company: string;
  avatar?: string;
  health: NodeHealth;
  strength: number; // 0-100 relationship strength
  group: string; // company name for clustering
  isUser?: boolean;
  dealId?: string;
  lastInteraction?: string; // ISO date
  contactId?: string; // cross-reference to contacts.ts
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'colleague' | 'former_colleague' | 'champion' | 'referral' | 'stakeholder' | 'reports_to';
  strength: number; // 0-100
  interactionCount: number;
  lastInteraction: string; // ISO date
  sharedCompany?: string;
  notes?: string;
}

export interface WarmIntroStep {
  personId: string;
  name: string;
  company: string;
  relationship: string;
}

export interface WarmIntroPath {
  id: string;
  target: WarmIntroStep;
  intermediaries: WarmIntroStep[];
  confidence: number; // 0-100
  description: string;
}

export const graphNodes: GraphNode[] = [
  // ── Sarah (Center Node) ────────────────────────────────────────
  {
    id: 'sarah',
    name: 'Sarah Chen',
    title: 'Senior Account Executive',
    company: 'Meridian',
    health: 'healthy',
    strength: 100,
    group: 'Meridian',
    isUser: true,
  },

  // ── DataFlow Systems (deal-001) ────────────────────────────────
  {
    id: 'jake-torres',
    name: 'Jake Torres',
    title: 'VP of Engineering',
    company: 'DataFlow Systems',
    health: 'healthy',
    strength: 88,
    group: 'DataFlow Systems',
    dealId: 'deal-001',
    lastInteraction: '2026-02-22',
    contactId: 'contact-001',
  },
  {
    id: 'lisa-park',
    name: 'Lisa Park',
    title: 'Director of Product',
    company: 'DataFlow Systems',
    health: 'healthy',
    strength: 72,
    group: 'DataFlow Systems',
    dealId: 'deal-001',
    lastInteraction: '2026-02-22',
    contactId: 'contact-002',
  },
  {
    id: 'sophie-wright',
    name: 'Sophie Wright',
    title: 'Head of IT',
    company: 'DataFlow Systems',
    health: 'healthy',
    strength: 55,
    group: 'DataFlow Systems',
    dealId: 'deal-001',
    lastInteraction: '2026-02-22',
    contactId: 'contact-003',
  },

  // ── CloudBase Inc (deal-003) ───────────────────────────────────
  {
    id: 'maria-chen',
    name: 'Maria Chen',
    title: 'Head of Operations',
    company: 'CloudBase Inc',
    health: 'healthy',
    strength: 81,
    group: 'CloudBase Inc',
    dealId: 'deal-003',
    lastInteraction: '2026-02-22',
    contactId: 'contact-005',
  },

  // ── Apex Partners (deal-004) ───────────────────────────────────
  {
    id: 'david-kim',
    name: 'David Kim',
    title: 'COO',
    company: 'Apex Partners',
    health: 'critical',
    strength: 35,
    group: 'Apex Partners',
    dealId: 'deal-004',
    lastInteraction: '2026-02-10',
    contactId: 'contact-006',
  },

  // ── TechVault (deal-005) ───────────────────────────────────────
  {
    id: 'rachel-adams',
    name: 'Rachel Adams',
    title: 'CTO',
    company: 'TechVault',
    health: 'healthy',
    strength: 62,
    group: 'TechVault',
    dealId: 'deal-005',
    lastInteraction: '2026-02-22',
    contactId: 'contact-007',
  },
  {
    id: 'ben-foster',
    name: 'Ben Foster',
    title: 'VP of Customer Success',
    company: 'TechVault',
    health: 'healthy',
    strength: 48,
    group: 'TechVault',
    dealId: 'deal-005',
    lastInteraction: '2026-02-22',
    contactId: 'contact-008',
  },

  // ── Vertex AI (deal-006 — ghost) ───────────────────────────────
  {
    id: 'tom-nguyen',
    name: 'Tom Nguyen',
    title: 'Head of AI/ML',
    company: 'Vertex AI',
    health: 'ghost',
    strength: 18,
    group: 'Vertex AI',
    dealId: 'deal-006',
    lastInteraction: '2026-01-28',
    contactId: 'contact-009',
  },

  // ── SkyBridge (deal-007) ───────────────────────────────────────
  {
    id: 'nina-patel',
    name: 'Nina Patel',
    title: 'VP of Sales',
    company: 'SkyBridge Solutions',
    health: 'at_risk',
    strength: 42,
    group: 'SkyBridge Solutions',
    dealId: 'deal-007',
    lastInteraction: '2026-02-15',
    contactId: 'contact-010',
  },

  // ── Quantum Labs (deal-008) ────────────────────────────────────
  {
    id: 'omar-hassan',
    name: 'Omar Hassan',
    title: 'CEO',
    company: 'Quantum Labs',
    health: 'healthy',
    strength: 38,
    group: 'Quantum Labs',
    dealId: 'deal-008',
    lastInteraction: '2026-02-20',
    contactId: 'contact-011',
  },
  {
    id: 'emily-watson',
    name: 'Emily Watson',
    title: 'Head of Support',
    company: 'Quantum Labs',
    health: 'healthy',
    strength: 30,
    group: 'Quantum Labs',
    lastInteraction: '2026-02-20',
    contactId: 'contact-012',
  },

  // ── Additional Network Contacts (not in deals) ─────────────────
  {
    id: 'james-wright',
    name: 'James Wright',
    title: 'Sales Manager',
    company: 'Nexus Corp',
    health: 'healthy',
    strength: 75,
    group: 'Nexus Corp',
    lastInteraction: '2026-02-22',
  },
  {
    id: 'priya-sharma',
    name: 'Priya Sharma',
    title: 'VP of Partnerships',
    company: 'FinanceFirst',
    health: 'healthy',
    strength: 65,
    group: 'FinanceFirst',
    lastInteraction: '2026-02-18',
  },
];

export const graphEdges: GraphEdge[] = [
  // ── Sarah's direct relationships ───────────────────────────────

  // DataFlow
  {
    source: 'sarah',
    target: 'jake-torres',
    type: 'champion',
    strength: 88,
    interactionCount: 14,
    lastInteraction: '2026-02-22',
    notes: 'Technical champion. "This is a no-brainer" — strong buy signal.',
  },
  {
    source: 'sarah',
    target: 'lisa-park',
    type: 'stakeholder',
    strength: 72,
    interactionCount: 8,
    lastInteraction: '2026-02-22',
    notes: 'Product evaluator. Former Zendesk colleague (2019-2023). Concerned about analytics depth.',
  },
  {
    source: 'sarah',
    target: 'sophie-wright',
    type: 'stakeholder',
    strength: 55,
    interactionCount: 3,
    lastInteraction: '2026-02-22',
    notes: 'IT security gatekeeper. Focused on SSO/SCIM compliance.',
  },

  // CloudBase
  {
    source: 'sarah',
    target: 'maria-chen',
    type: 'champion',
    strength: 81,
    interactionCount: 11,
    lastInteraction: '2026-02-22',
    notes: 'Deal champion with budget authority (recently promoted). Negotiating final terms.',
  },

  // Apex
  {
    source: 'sarah',
    target: 'david-kim',
    type: 'champion',
    strength: 35,
    interactionCount: 9,
    lastInteraction: '2026-02-10',
    notes: 'Champion gone dark. 12 days of silence. LinkedIn profile view detected at 11:47 PM — potential re-engagement.',
  },

  // TechVault
  {
    source: 'sarah',
    target: 'rachel-adams',
    type: 'stakeholder',
    strength: 62,
    interactionCount: 4,
    lastInteraction: '2026-02-22',
    notes: 'CTO and technical decision maker. Previously used Meridian at Signal Corp.',
  },
  {
    source: 'sarah',
    target: 'ben-foster',
    type: 'champion',
    strength: 48,
    interactionCount: 3,
    lastInteraction: '2026-02-22',
    notes: 'Internal champion for change. Publicly posted about Zendesk pain on LinkedIn.',
  },

  // Vertex AI
  {
    source: 'sarah',
    target: 'tom-nguyen',
    type: 'stakeholder',
    strength: 18,
    interactionCount: 5,
    lastInteraction: '2026-01-28',
    notes: 'Ghost contact. Last meaningful interaction 25 days ago. Deal may be dead.',
  },

  // SkyBridge
  {
    source: 'sarah',
    target: 'nina-patel',
    type: 'stakeholder',
    strength: 42,
    interactionCount: 6,
    lastInteraction: '2026-02-15',
    notes: 'Engaged but slowing down. Delayed proposal review twice. May have competing priorities.',
  },

  // Quantum Labs
  {
    source: 'sarah',
    target: 'omar-hassan',
    type: 'stakeholder',
    strength: 38,
    interactionCount: 2,
    lastInteraction: '2026-02-20',
    notes: 'New relationship. CEO is directly involved — small company, fast decisions.',
  },
  {
    source: 'sarah',
    target: 'emily-watson',
    type: 'stakeholder',
    strength: 30,
    interactionCount: 2,
    lastInteraction: '2026-02-20',
    notes: 'Head of Support — will be primary user. Evaluating from operational perspective.',
  },

  // Internal / Network
  {
    source: 'sarah',
    target: 'james-wright',
    type: 'colleague',
    strength: 75,
    interactionCount: 45,
    lastInteraction: '2026-02-22',
    notes: 'Sales Manager at Nexus Corp. Former colleague at previous company. Strong professional bond.',
  },
  {
    source: 'sarah',
    target: 'priya-sharma',
    type: 'former_colleague',
    strength: 65,
    interactionCount: 22,
    lastInteraction: '2026-02-18',
    sharedCompany: 'DataFlow Systems',
    notes: 'Former colleague at DataFlow (2022-2025). Now VP of Partnerships at FinanceFirst. Warm intro source.',
  },

  // ── Cross-contact relationships ────────────────────────────────

  // DataFlow internal
  {
    source: 'jake-torres',
    target: 'lisa-park',
    type: 'colleague',
    strength: 80,
    interactionCount: 0,
    lastInteraction: '2026-02-22',
    sharedCompany: 'DataFlow Systems',
    notes: 'Work closely together on product-engineering alignment.',
  },
  {
    source: 'jake-torres',
    target: 'sophie-wright',
    type: 'colleague',
    strength: 65,
    interactionCount: 0,
    lastInteraction: '2026-02-22',
    sharedCompany: 'DataFlow Systems',
    notes: 'IT and engineering collaborate on infrastructure decisions.',
  },
  {
    source: 'lisa-park',
    target: 'sophie-wright',
    type: 'colleague',
    strength: 50,
    interactionCount: 0,
    lastInteraction: '2026-02-22',
    sharedCompany: 'DataFlow Systems',
  },

  // Key former colleague connections for warm intros
  {
    source: 'lisa-park',
    target: 'jake-torres',
    type: 'former_colleague',
    strength: 70,
    interactionCount: 0,
    lastInteraction: '2026-02-22',
    sharedCompany: 'Zendesk',
    notes: 'Both worked at Zendesk (overlapping 2020-2023). Lisa introduced Jake to DataFlow.',
  },

  // Quantum Labs internal
  {
    source: 'omar-hassan',
    target: 'emily-watson',
    type: 'reports_to',
    strength: 85,
    interactionCount: 0,
    lastInteraction: '2026-02-20',
    sharedCompany: 'Quantum Labs',
  },

  // TechVault internal
  {
    source: 'rachel-adams',
    target: 'ben-foster',
    type: 'colleague',
    strength: 75,
    interactionCount: 0,
    lastInteraction: '2026-02-22',
    sharedCompany: 'TechVault',
    notes: 'Ben reports to Rachel\'s peer (VP of Product). Close cross-functional relationship.',
  },

  // Network bridge: Priya → FinanceFirst opportunity
  {
    source: 'priya-sharma',
    target: 'james-wright',
    type: 'former_colleague',
    strength: 45,
    interactionCount: 8,
    lastInteraction: '2026-01-15',
    sharedCompany: 'Nexus Corp',
    notes: 'Priya and James overlapped at Nexus Corp (2020-2022).',
  },
];

// ── Warm Introduction Paths ──────────────────────────────────────

export const warmIntroPaths: WarmIntroPath[] = [
  {
    id: 'intro-001',
    target: {
      personId: 'jake-torres',
      name: 'Jake Torres',
      company: 'DataFlow Systems',
      relationship: 'VP of Engineering, active deal champion',
    },
    intermediaries: [
      {
        personId: 'lisa-park',
        name: 'Lisa Park',
        company: 'DataFlow Systems',
        relationship: 'Former Zendesk colleague (2019-2023). Lisa brought Jake from Zendesk to DataFlow.',
      },
    ],
    confidence: 92,
    description: 'Sarah worked with Lisa Park at Zendesk from 2019-2023. Lisa recruited Jake Torres from Zendesk to DataFlow in 2024. This prior relationship means Lisa can vouch for Sarah\'s understanding of the space and Jake already trusts Lisa\'s judgment on vendor selection.',
  },
  {
    id: 'intro-002',
    target: {
      personId: 'priya-sharma',
      name: 'Priya Sharma',
      company: 'FinanceFirst',
      relationship: 'VP of Partnerships — potential new pipeline opportunity',
    },
    intermediaries: [],
    confidence: 85,
    description: 'Direct relationship. Sarah and Priya worked together at DataFlow from 2022-2025. Priya recently moved to FinanceFirst as VP of Partnerships. FinanceFirst matches Meridian\'s ICP: 200+ employees, B2B SaaS, evaluating customer success platforms.',
  },
  {
    id: 'intro-003',
    target: {
      personId: 'financefirst-cto',
      name: 'Raj Kapoor',
      company: 'FinanceFirst',
      relationship: 'CTO — decision maker for platform purchases',
    },
    intermediaries: [
      {
        personId: 'priya-sharma',
        name: 'Priya Sharma',
        company: 'FinanceFirst',
        relationship: 'Former DataFlow colleague (2022-2025). Priya works directly with Raj at FinanceFirst.',
      },
    ],
    confidence: 72,
    description: 'Sarah knows Priya from DataFlow. Priya now works at FinanceFirst where she reports to Raj Kapoor (CTO). Priya can make a warm introduction to Raj, positioning Meridian as a solution she\'s seen work firsthand.',
  },
  {
    id: 'intro-004',
    target: {
      personId: 'marcus-wong',
      name: 'Marcus Wong',
      company: 'DataFlow Systems',
      relationship: 'CTO — economic buyer for DataFlow deal',
    },
    intermediaries: [
      {
        personId: 'jake-torres',
        name: 'Jake Torres',
        company: 'DataFlow Systems',
        relationship: 'Jake reports to Marcus. Already championing the deal internally. Forwarded demo recording to Marcus.',
      },
    ],
    confidence: 88,
    description: 'Jake Torres (VP Engineering) reports directly to Marcus Wong (CTO). Jake has already forwarded the demo recording to Marcus and requested he join the next meeting. The intro is happening organically through Jake\'s internal championing.',
  },
  {
    id: 'intro-005',
    target: {
      personId: 'david-kim',
      name: 'David Kim',
      company: 'Apex Partners',
      relationship: 'COO — gone silent, deal at risk',
    },
    intermediaries: [
      {
        personId: 'james-wright',
        name: 'James Wright',
        company: 'Nexus Corp',
        relationship: 'James and David served on the same fintech advisory board (2024-present). Can make a backchannel inquiry about David\'s status.',
      },
    ],
    confidence: 55,
    description: 'James Wright (Nexus Corp) and David Kim (Apex Partners) both serve on the FinTech Innovation Advisory Board. James could make a casual inquiry about David\'s availability, providing Sarah intel on whether the deal is stalled due to internal factors or lost interest.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────

export const getNodeById = (id: string) => graphNodes.find((n) => n.id === id);

export const getEdgesForNode = (nodeId: string) =>
  graphEdges.filter((e) => e.source === nodeId || e.target === nodeId);

export const getNodesByHealth = (health: NodeHealth) =>
  graphNodes.filter((n) => n.health === health && !n.isUser);

export const getNodesByCompany = (company: string) =>
  graphNodes.filter((n) => n.group === company);

export const getIntroPathsForTarget = (targetCompany: string) =>
  warmIntroPaths.filter((p) => p.target.company === targetCompany);
