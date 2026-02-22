// Demo proposal data for DataFlow Systems
// Used in the proposal generation demo scene

export interface BrandConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  font: string;
  logoUrl?: string;
  companyName: string;
}

export interface ProposalSection {
  id: string;
  type: 'cover' | 'executive_summary' | 'problem' | 'solution' | 'approach' | 'timeline' | 'pricing' | 'terms';
  title: string;
  content: string;
  order: number;
  isEditable?: boolean;
}

export interface PricingTierFeature {
  name: string;
  included: boolean;
  limit?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: 'annual' | 'monthly';
  description: string;
  features: PricingTierFeature[];
  recommended?: boolean;
  savings?: string;
}

export interface SlackHITLReview {
  channel: string;
  requestedBy: string;
  timestamp: string;
  proposalTitle: string;
  dealName: string;
  dealValue: number;
  sections: { name: string; status: 'approved' | 'needs_review' | 'auto_approved' }[];
  reviewerNotes: string;
  actions: { label: string; style: 'primary' | 'danger' | 'default'; value: string }[];
}

// ── Brand Configuration ──────────────────────────────────────────

export const brandConfig: BrandConfig = {
  primaryColor: '#6C5CE7',
  secondaryColor: '#2D3436',
  accentColor: '#00B894',
  font: 'Inter',
  companyName: 'Meridian',
};

// ── Proposal Sections ────────────────────────────────────────────

export const proposalSections: ProposalSection[] = [
  {
    id: 'section-cover',
    type: 'cover',
    title: 'Cover Page',
    order: 1,
    content: `# Customer Success Platform Proposal

**Prepared for:** DataFlow Systems
**Prepared by:** Sarah Chen, Senior Account Executive
**Date:** February 22, 2026
**Proposal #:** MER-2026-0847

---

*Confidential — For DataFlow Systems Internal Use Only*

**Meridian, Inc.**
548 Market Street, Suite 400
San Francisco, CA 94104
proposals@meridian.io`,
  },
  {
    id: 'section-exec-summary',
    type: 'executive_summary',
    title: 'Executive Summary',
    order: 2,
    isEditable: true,
    content: `## Executive Summary

DataFlow Systems is scaling rapidly after a successful Series C ($45M), and your engineering-led team needs a customer success platform that integrates deeply with your existing tools — not another siloed system.

After our technical deep-dive on February 22nd, it's clear that Meridian is uniquely positioned to solve three critical challenges:

1. **Bi-directional Jira integration** — Real-time sync between customer tickets and engineering sprints, eliminating the 18-month pain point Jake Torres described as "context-switching nightmare"
2. **Predictive customer health scoring** — 12-factor model with cohort analysis capabilities that Lisa Park needs for product-led growth metrics
3. **Enterprise-grade security** — Full SCIM 2.0 / Okta integration, SOC2 Type II compliance, and the identity management controls Sophie Wright requires

**Projected ROI: 340% over 3 years** — driven by 22% improvement in agent productivity, 35% reduction in escalation rate, and elimination of 3 point-solution costs.

We recommend the **Enterprise tier** at **$150,000/year** with a 12-month initial term and dedicated implementation support.`,
  },
  {
    id: 'section-problem',
    type: 'problem',
    title: 'The Challenge',
    order: 3,
    content: `## The Challenge

DataFlow's customer success operations face three interconnected problems:

### 1. Engineering-Support Disconnect
Your engineering team lives in Jira. Your support team lives in email and chat. When a customer reports a bug, the ticket crosses this divide — and context is lost. Today, this handoff takes an average of 4.2 hours and requires manual copy-paste between systems.

*"If we have to context-switch to another tool, adoption is going to be a nightmare."* — Jake Torres, VP of Engineering

### 2. Reactive Customer Health Management
Without predictive health scoring, your team discovers churn risk when it's too late. You need leading indicators — product usage trends, support ticket patterns, engagement velocity — not lagging ones.

### 3. Security & Compliance Gaps
As DataFlow scales past 200 employees and pursues enterprise customers, you need SCIM provisioning, custom SSO, and comprehensive audit logging. Your current tools require manual user management across 6 systems.

### The Cost of Inaction
Based on your current metrics:
- **$340K/year** in lost productivity from manual tool switching
- **$180K/year** in preventable churn from late-detected risk signals
- **$95K/year** in compliance overhead from manual identity management

**Total addressable cost: $615K/year**`,
  },
  {
    id: 'section-solution',
    type: 'solution',
    title: 'Our Solution',
    order: 4,
    content: `## Our Solution

Meridian provides a unified customer success platform built for engineering-led organizations.

### Bi-Directional Jira Integration
- **Real-time webhook sync** — sub-second latency, not batched
- **Two-way status mapping** — Jira "In Review" automatically updates customer-facing status
- **Sprint-aware routing** — customer tickets routed based on active sprint capacity
- **Custom field sync** — map any Jira field to customer-facing attributes

### Predictive Health Scoring
- **12-factor scoring model** with configurable weights
- **Cohort analysis** — segment health by plan, industry, company size, or custom attributes
- **Churn prediction** — 90-day forward-looking risk assessment with 87% accuracy
- **Product adoption correlation** — connect feature usage to health outcomes

### Enterprise Security
- **SCIM 2.0** with pre-built Okta, Azure AD, and OneLogin integrations
- **SOC2 Type II** certified (report available upon request)
- **Custom SSO** configurations with SAML 2.0 and OIDC
- **Comprehensive audit logging** with 2-year retention and export API
- **Role-based access control** with custom permission sets

### AI-Powered Automation
- **Intelligent ticket routing** — 82% accuracy on first assignment
- **Automated response drafting** — suggested replies based on knowledge base and historical resolutions
- **Proactive alerting** — real-time notifications when health scores drop below threshold`,
  },
  {
    id: 'section-approach',
    type: 'approach',
    title: 'Implementation Approach',
    order: 5,
    content: `## Implementation Approach

Our implementation follows a proven 6-week methodology, delivered by a dedicated Customer Success Engineer.

### Phase 1: Foundation (Weeks 1-2)
- Environment setup and SSO/SCIM configuration
- Core data migration from existing tools
- Jira integration deployment and field mapping
- Basic workflow configuration

### Phase 2: Configuration (Weeks 3-4)
- Health score model customization
- Automation rules and routing logic
- Knowledge base migration
- Agent training (2 sessions, recorded for on-demand access)

### Phase 3: Optimization (Weeks 5-6)
- Parallel running with existing tools
- Performance benchmarking
- Fine-tuning based on real usage data
- Full cutover and legacy decommissioning

### Dedicated Support
- **Named CSE** for the first 90 days post-launch
- **24/7 priority support** for Enterprise tier
- **Quarterly business reviews** with your account team
- **Executive sponsor** assigned from Meridian leadership`,
  },
  {
    id: 'section-timeline',
    type: 'timeline',
    title: 'Project Timeline',
    order: 6,
    content: `## Project Timeline

| Milestone | Target Date | Owner |
|-----------|-------------|-------|
| Contract signed | March 7, 2026 | Sarah Chen / Jake Torres |
| Kickoff meeting | March 10, 2026 | CSE Team |
| SSO/SCIM configured | March 14, 2026 | Sophie Wright / CSE |
| Jira integration live | March 17, 2026 | Jake Torres / CSE |
| Data migration complete | March 24, 2026 | CSE Team |
| Agent training (Session 1) | March 26, 2026 | Support Team |
| Health scoring configured | March 31, 2026 | Lisa Park / CSE |
| Parallel running begins | April 1, 2026 | All Stakeholders |
| Agent training (Session 2) | April 7, 2026 | Support Team |
| Full cutover | April 14, 2026 | All Stakeholders |
| 90-day review | July 14, 2026 | Account Team |

**Total implementation: 5 weeks** (industry average: 8-12 weeks)`,
  },
  {
    id: 'section-pricing',
    type: 'pricing',
    title: 'Investment',
    order: 7,
    isEditable: true,
    content: `## Investment

Based on DataFlow's requirements (180 employees, enterprise security, Jira integration, advanced analytics), we recommend the **Enterprise tier**.

### Recommended: Enterprise — $150,000/year
See detailed tier comparison below.

### One-Time Implementation Fee: $15,000
Includes dedicated CSE, data migration, custom integration setup, and 2 training sessions.

### Total Year 1 Investment: $165,000
### ROI Payback Period: 4.2 months

*Multi-year discount available: 10% off for 2-year commitment ($135,000/year).*`,
  },
  {
    id: 'section-terms',
    type: 'terms',
    title: 'Terms & Conditions',
    order: 8,
    content: `## Terms & Conditions

### Contract Terms
- **Initial Term:** 12 months from contract execution
- **Renewal:** Auto-renews for successive 12-month terms unless cancelled 60 days prior
- **Payment:** Net 30 from invoice date, quarterly billing
- **Implementation Fee:** Due upon contract execution

### Service Level Agreement
- **Uptime:** 99.95% monthly availability guarantee
- **Response Time:** Priority 1 (Critical) — 15 minutes, Priority 2 (High) — 1 hour
- **Credits:** 5% monthly credit for each 0.1% below SLA threshold

### Data & Security
- **Data Ownership:** All customer data remains property of DataFlow Systems
- **Data Portability:** Full export available at any time via API or bulk download
- **Retention:** Data retained for contract duration + 90 days post-termination
- **Compliance:** SOC2 Type II, GDPR, CCPA compliant

### Confidentiality
This proposal and its contents are confidential and intended solely for DataFlow Systems. Pricing is valid for 30 days from the date of this proposal.

---

**Accepted By:**

___________________________ ___________________________
Jake Torres                  Sarah Chen
VP of Engineering            Senior Account Executive
DataFlow Systems             Meridian, Inc.

Date: _____________          Date: _____________`,
  },
];

// ── Pricing Tiers ────────────────────────────────────────────────

export const pricingTiers: PricingTier[] = [
  {
    id: 'tier-starter',
    name: 'Starter',
    price: 45000,
    period: 'annual',
    description: 'For growing teams getting started with customer success',
    features: [
      { name: 'Up to 50 users', included: true },
      { name: 'Email & chat support', included: true },
      { name: 'Basic health scoring (5 factors)', included: true },
      { name: 'Standard integrations (Slack, Email)', included: true },
      { name: 'Knowledge base', included: true },
      { name: 'Basic reporting', included: true },
      { name: 'Jira integration', included: false },
      { name: 'SCIM / Custom SSO', included: false },
      { name: 'Predictive analytics', included: false },
      { name: 'AI automation', included: false },
      { name: 'Custom workflows', included: false },
      { name: 'Dedicated CSE', included: false },
      { name: 'Priority support', included: false },
      { name: 'SLA guarantee', included: false },
    ],
  },
  {
    id: 'tier-professional',
    name: 'Professional',
    price: 95000,
    period: 'annual',
    description: 'For scaling teams that need deeper integrations and analytics',
    features: [
      { name: 'Up to 150 users', included: true },
      { name: 'Email, chat & phone support', included: true },
      { name: 'Advanced health scoring (8 factors)', included: true },
      { name: 'All standard integrations + Jira (one-way)', included: true },
      { name: 'Knowledge base with AI suggestions', included: true },
      { name: 'Custom dashboards & reporting', included: true },
      { name: 'Jira integration (one-way sync)', included: true },
      { name: 'Standard SSO (SAML 2.0)', included: true },
      { name: 'Basic predictive analytics', included: true },
      { name: 'AI automation', included: false },
      { name: 'Custom workflows', included: true, limit: '10 workflows' },
      { name: 'Shared CSE', included: true },
      { name: 'Priority support', included: false },
      { name: 'SLA guarantee', included: false },
    ],
  },
  {
    id: 'tier-enterprise',
    name: 'Enterprise',
    price: 150000,
    period: 'annual',
    description: 'For organizations that demand deep integration, security, and AI',
    recommended: true,
    savings: 'Recommended for DataFlow',
    features: [
      { name: 'Unlimited users', included: true },
      { name: '24/7 priority support', included: true },
      { name: 'Predictive health scoring (12 factors)', included: true },
      { name: 'All integrations + bi-directional Jira', included: true },
      { name: 'Knowledge base with AI + cohort analysis', included: true },
      { name: 'Advanced analytics with data export API', included: true },
      { name: 'Jira integration (bi-directional, real-time)', included: true },
      { name: 'SCIM 2.0 + Custom SSO + Okta pre-built', included: true },
      { name: 'Full predictive analytics & churn modeling', included: true },
      { name: 'AI automation (routing, drafting, alerting)', included: true },
      { name: 'Unlimited custom workflows', included: true },
      { name: 'Dedicated CSE (90 days)', included: true },
      { name: '24/7 priority support (15 min P1 SLA)', included: true },
      { name: '99.95% uptime SLA with credits', included: true },
    ],
  },
];

// ── ROI Analysis ─────────────────────────────────────────────────

export interface ROIProjection {
  category: string;
  currentCost: number;
  projectedSavings: number;
  timeframe: string;
  confidence: 'high' | 'medium' | 'low';
}

export const roiProjection: ROIProjection[] = [
  {
    category: 'Agent productivity improvement',
    currentCost: 340000,
    projectedSavings: 74800,
    timeframe: 'Year 1',
    confidence: 'high',
  },
  {
    category: 'Churn prevention (health scoring)',
    currentCost: 180000,
    projectedSavings: 108000,
    timeframe: 'Year 1',
    confidence: 'medium',
  },
  {
    category: 'Point-solution consolidation',
    currentCost: 95000,
    projectedSavings: 95000,
    timeframe: 'Year 1',
    confidence: 'high',
  },
  {
    category: 'Compliance automation',
    currentCost: 65000,
    projectedSavings: 48750,
    timeframe: 'Year 1',
    confidence: 'medium',
  },
  {
    category: 'Reduced escalation rate',
    currentCost: 120000,
    projectedSavings: 42000,
    timeframe: 'Year 1',
    confidence: 'medium',
  },
];

export const totalROI = {
  totalInvestmentYear1: 165000,
  totalSavingsYear1: 368550,
  roiPercentage: 123,
  paybackMonths: 4.2,
  threeYearROI: 340,
  threeYearSavings: 1105650,
};

// ── Slack HITL Review ────────────────────────────────────────────

export const slackHITLReview: SlackHITLReview = {
  channel: '#deal-room-dataflow',
  requestedBy: '60 Copilot',
  timestamp: '2026-02-22T10:30:00-05:00',
  proposalTitle: 'DataFlow Systems — Customer Success Platform Proposal',
  dealName: 'DataFlow Systems',
  dealValue: 180000,
  sections: [
    { name: 'Cover Page', status: 'auto_approved' },
    { name: 'Executive Summary', status: 'needs_review' },
    { name: 'The Challenge', status: 'auto_approved' },
    { name: 'Our Solution', status: 'auto_approved' },
    { name: 'Implementation Approach', status: 'auto_approved' },
    { name: 'Project Timeline', status: 'needs_review' },
    { name: 'Investment', status: 'needs_review' },
    { name: 'Terms & Conditions', status: 'auto_approved' },
  ],
  reviewerNotes: 'I\'ve auto-approved standard sections. The Executive Summary, Timeline, and Pricing sections need your review — they contain deal-specific customizations and commercial terms. The exec summary references Jake\'s "no-brainer" quote — confirm you want to include this.',
  actions: [
    { label: 'Approve & Send', style: 'primary', value: 'approve_send' },
    { label: 'Edit in App', style: 'default', value: 'edit_in_app' },
    { label: 'Request Changes', style: 'danger', value: 'request_changes' },
  ],
};
