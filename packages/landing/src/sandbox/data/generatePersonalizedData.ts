/**
 * generatePersonalizedData
 *
 * Transforms ResearchData (from useDemoResearch or /t/{code} enrichment)
 * into a complete SandboxData object. The visitor's company becomes the
 * primary deal, their contacts become stakeholders, and AI-generated
 * content populates meeting prep and email drafts.
 */

import type { SandboxData, SandboxCompany, SandboxContact, SandboxDeal, DealStage, SandboxMeeting, SandboxActivity, SandboxEmailDraft, SandboxSlackMessage, SandboxMeetingPrep, SandboxKPIs } from './sandboxTypes';
import { getDefaultSandboxData } from './defaultMockData';

/** Shape of research data from useDemoResearch or enrichment */
export interface ResearchInput {
  company?: {
    name?: string;
    domain?: string;
    vertical?: string;
    product_summary?: string;
    value_props?: string[];
    employee_range?: string;
    competitors?: string[];
  };
  demo_actions?: {
    cold_outreach?: {
      target_name?: string;
      target_title?: string;
      target_company?: string;
      personalised_hook?: string;
      email_preview?: string;
    };
    meeting_prep?: {
      attendee_name?: string;
      attendee_company?: string;
      context?: string;
      talking_points?: string[];
    };
    pipeline_action?: {
      deal_name?: string;
      deal_value?: string;
      health_score?: number;
      risk_signal?: string;
      suggested_action?: string;
      signals?: { label: string; type: string }[];
    };
  };
  stats?: {
    signals_found?: number;
    contacts_identified?: number;
  };
}

/** Optional visitor info from /t/{code} campaign link */
export interface VisitorInfo {
  first_name?: string;
  last_name?: string;
  email?: string;
  title?: string;
  company_name?: string;
  domain?: string;
}

/** AI-generated content from sandbox-personalize edge function */
export interface PersonalizedContent {
  email_draft?: {
    subject?: string;
    body?: string;
  };
  meeting_prep?: {
    company_overview?: string;
    talking_points?: string[];
    risk_signals?: string[];
    questions_to_ask?: string[];
    deal_context?: string;
  };
}

export function generatePersonalizedData(
  research: ResearchInput,
  visitor?: VisitorInfo,
  aiContent?: PersonalizedContent
): SandboxData {
  const defaults = getDefaultSandboxData();
  const companyName = visitor?.company_name ?? research.company?.name ?? 'Acme Corp';
  const companyDomain = visitor?.domain ?? research.company?.domain ?? 'acme.com';
  const visitorName = visitor?.first_name
    ? `${visitor.first_name} ${visitor.last_name ?? ''}`
    : research.demo_actions?.cold_outreach?.target_name ?? 'Sarah Chen';
  const visitorTitle = visitor?.title ?? research.demo_actions?.cold_outreach?.target_title ?? 'VP of Sales';
  const visitorEmail = visitor?.email ?? `${(visitor?.first_name ?? 'sarah').toLowerCase()}@${companyDomain}`;
  const industry = research.company?.vertical ?? 'Technology';
  const employeeRange = research.company?.employee_range ?? '51-200';

  // Estimate deal value from company size
  const dealValue = estimateDealValue(employeeRange);

  // ── Visitor Company ──────────────────────────────────────────
  const visitorCompany: SandboxCompany = {
    id: 'company-visitor',
    name: companyName,
    domain: companyDomain,
    industry,
    size: employeeRange,
    isVisitorCompany: true,
  };

  // Replace the first company with visitor company
  const companies: SandboxCompany[] = [
    visitorCompany,
    ...defaults.companies.filter((c) => !c.isVisitorCompany),
  ];

  // ── Visitor Contact ──────────────────────────────────────────
  const visitorContact: SandboxContact = {
    id: 'contact-001',
    first_name: visitorName.split(' ')[0] ?? 'Sarah',
    last_name: visitorName.split(' ').slice(1).join(' ') || 'Chen',
    email: visitorEmail,
    title: visitorTitle,
    company_id: 'company-visitor',
    company_name: companyName,
    engagement_level: 'hot',
    last_interaction_at: new Date(Date.now() - 86400000).toISOString(),
    isVisitor: true,
  };

  // Build additional contacts for visitor's company
  const additionalContacts = buildCompanyContacts(companyName, companyDomain, research);

  const contacts: SandboxContact[] = [
    visitorContact,
    ...additionalContacts,
    ...defaults.contacts.filter(
      (c) => c.company_id !== 'company-visitor'
    ),
  ];

  // ── Visitor Deal ─────────────────────────────────────────────
  const visitorDeal: SandboxDeal = {
    id: 'deal-visitor',
    name: `${companyName} — Platform License`,
    company_id: 'company-visitor',
    company_name: companyName,
    company_domain: companyDomain,
    value: dealValue,
    stage: 'proposal',
    stage_color: '#8b5cf6',
    health_score: research.demo_actions?.pipeline_action?.health_score ?? 72,
    health_status: 'warning',
    momentum_score: 15,
    probability: 65,
    owner_id: 'user-demo-001',
    owner_initials: 'AM',
    primary_contact_id: 'contact-001',
    primary_contact_name: visitorName,
    expected_close_date: new Date(Date.now() + 21 * 86400000).toISOString(),
    days_in_stage: 4,
    risk_level: 'medium',
    risk_factors: [
      research.demo_actions?.pipeline_action?.risk_signal ?? 'Decision maker not yet engaged',
      'Budget approval timeline unclear',
    ],
    next_steps: research.demo_actions?.pipeline_action?.suggested_action ?? 'Send revised proposal with enterprise pricing tier',
    next_actions: [
      'Send revised proposal',
      'Schedule technical deep-dive',
      'Connect with procurement team',
    ],
    relationship_health_status: 'at_risk',
    contact_count: 3,
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    isVisitorDeal: true,
  };

  // ── Competitor Deals (from research signals) ────────────────────
  const competitorDeals: SandboxDeal[] = (research.company?.competitors ?? []).slice(0, 2).map((comp, i) => {
    const compDomain = comp.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
    return {
      id: `deal-comp-${i}`,
      name: `${comp} — Evaluation`,
      company_id: `company-comp-${i}`,
      company_name: comp,
      company_domain: compDomain,
      value: dealValue * (0.6 + Math.random() * 0.4),
      stage: i === 0 ? 'qualified' as DealStage : 'lead' as DealStage,
      stage_color: i === 0 ? '#3b82f6' : '#6366f1',
      health_score: 45 + i * 20,
      health_status: i === 0 ? 'warning' as const : 'healthy' as const,
      momentum_score: 5 + i * 8,
      probability: 30 + i * 15,
      owner_id: 'user-demo-001',
      owner_initials: 'AM',
      expected_close_date: new Date(Date.now() + (35 + i * 14) * 86400000).toISOString(),
      days_in_stage: 6 + i * 3,
      risk_level: 'medium' as const,
      created_at: new Date(Date.now() - (14 + i * 7) * 86400000).toISOString(),
    };
  });

  const deals: SandboxDeal[] = [
    visitorDeal,
    ...competitorDeals,
    ...defaults.deals.filter((d) => !d.isVisitorDeal),
  ];

  // ── Meeting Prep ─────────────────────────────────────────────
  const meetingPrep: SandboxMeetingPrep = aiContent?.meeting_prep ?? {
    company_overview: research.company?.product_summary
      ? `${companyName} is a ${employeeRange} employee ${industry.toLowerCase()} company. ${research.company.product_summary}`
      : `${companyName} is a mid-market ${industry.toLowerCase()} company with ${employeeRange} employees. They currently use a fragmented sales stack and are looking to consolidate.`,
    talking_points: research.demo_actions?.meeting_prep?.talking_points ?? [
      `Their sales team spends significant time on admin — position 60 as the fix`,
      `${companyName} is in a competitive market — emphasize speed-to-value`,
      `${visitorName} is the key stakeholder — tailor the demo to their priorities`,
      `They have a decision timeline — create natural urgency`,
      `Address technical concerns proactively with a security review doc`,
    ],
    risk_signals: [
      `Budget approval may need additional sign-off for deals over $${(dealValue / 2000).toFixed(0)}K`,
      `Evaluate whether ${visitorName} has final decision authority`,
      `Ask what previous solutions they've evaluated and why they paused`,
    ],
    questions_to_ask: [
      'What does your current follow-up process look like after a sales call?',
      'How are you tracking deal health and pipeline accuracy today?',
      'Who else needs to be involved in the decision before we can move forward?',
    ],
    deal_context: `$${(dealValue / 1000).toFixed(0)}K proposal stage, 65% probability. 4 days in current stage. Medium risk — needs revised pricing proposal.`,
  };

  const meetings: SandboxMeeting[] = [
    {
      ...defaults.meetings[0],
      title: `${companyName} — Platform Demo & Pricing Review`,
      company_name: companyName,
      company_id: 'company-visitor',
      attendees: [
        { name: visitorName, title: visitorTitle, company: companyName },
        ...additionalContacts.slice(0, 1).map((c) => ({
          name: `${c.first_name} ${c.last_name}`,
          title: c.title,
          company: companyName,
        })),
      ],
      prep: meetingPrep,
      talking_points: meetingPrep.talking_points,
      risk_signals: meetingPrep.risk_signals,
    },
    ...defaults.meetings.slice(1),
  ];

  // ── Email Draft ──────────────────────────────────────────────
  const emailDraft: SandboxEmailDraft = {
    to_name: visitorName,
    to_email: visitorEmail,
    to_title: visitorTitle,
    to_company: companyName,
    subject: aiContent?.email_draft?.subject ?? `Re: Platform demo — revised proposal attached`,
    body: aiContent?.email_draft?.body ?? buildEmailBody(visitorName, companyName, dealValue),
    reasoning: `Generated based on meeting context with ${companyName}. ${visitorName}'s role as ${visitorTitle} and their company's ${industry.toLowerCase()} focus informed the messaging. Deal value of $${(dealValue / 1000).toFixed(0)}K and proposal stage context included.`,
  };

  // ── Activities (personalized first 3) ────────────────────────
  const activities: SandboxActivity[] = [
    {
      id: 'act-001',
      type: 'email',
      subject: `Follow-up: Platform demo recap`,
      details: `AI-drafted follow-up sent to ${visitorName} with pricing attachment`,
      contact_name: visitorName,
      company_name: companyName,
      deal_name: `${companyName} — Platform License`,
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 'act-005',
      type: 'task',
      subject: `Send revised proposal to ${companyName}`,
      details: 'Include enterprise pricing tier and implementation timeline',
      company_name: companyName,
      deal_name: `${companyName} — Platform License`,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'act-009',
      type: 'email',
      subject: `Case study shared with ${companyName}`,
      details: 'Sent case study showing 41% improvement in follow-up rates',
      contact_name: visitorName,
      company_name: companyName,
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      id: 'act-012',
      type: 'note',
      subject: `Reviewed ${industry.toLowerCase()} case study for ${companyName}`,
      details: `Shared relevant ${industry.toLowerCase()} customer win showing 41% improvement in follow-up rates`,
      company_name: companyName,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    ...(research.company?.value_props ?? []).slice(0, 1).map((vp, i) => ({
      id: `act-vp-${i}`,
      type: 'email' as const,
      subject: `Value prop alignment: ${vp.slice(0, 50)}`,
      details: `Personalized messaging based on ${companyName}'s positioning`,
      contact_name: visitorName,
      company_name: companyName,
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    })),
    ...defaults.activities.filter(
      (a) => a.company_name !== 'Acme Corp'
    ),
  ];

  // ── Slack Messages ───────────────────────────────────────────
  const slackMessages: SandboxSlackMessage[] = [
    {
      channel: '#deals',
      title: `Meeting Prep Ready — ${companyName}`,
      body: `Your meeting with ${visitorName} (${companyName}) is tomorrow at 2pm. Prep doc is ready with ${meetingPrep.talking_points.length} talking points and ${meetingPrep.risk_signals.length} risk signals.`,
      accent_color: '#6C5CE7',
      fields: [
        { label: 'Deal Value', value: `$${(dealValue / 1000).toFixed(0)},000` },
        { label: 'Health Score', value: `${visitorDeal.health_score}/100` },
        { label: 'Stage', value: 'Proposal' },
        { label: 'Days in Stage', value: '4' },
      ],
      actions: ['View Prep Doc', 'Open Deal'],
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      channel: '#deals',
      title: 'Follow-up Email Ready for Approval',
      body: `AI drafted a follow-up to ${visitorName} based on yesterday's demo. Ready for your review.`,
      accent_color: '#06b6d4',
      fields: [
        { label: 'To', value: visitorEmail },
        { label: 'Subject', value: emailDraft.subject },
      ],
      actions: ['Approve & Send', 'Edit Draft'],
      timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    ...defaults.slackMessages.slice(2),
  ];

  // ── KPIs ─────────────────────────────────────────────────────
  const totalPipeline = deals.reduce((s, d) => s + d.value, 0);
  const activeDeals = deals.filter((d) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length;
  const kpis: SandboxKPIs = {
    metrics: [
      { title: 'New Business', value: totalPipeline, target: totalPipeline * 1.4, trend: 12, previousPeriodTotal: totalPipeline * 1.15, totalTrend: -13, icon: 'revenue', color: 'emerald' },
      { title: 'Outbound', value: 42 + (activeDeals * 2), target: 60, trend: 8, previousPeriodTotal: 55, totalTrend: -24, icon: 'outbound', color: 'blue' },
      { title: 'Meetings', value: meetings.length + 3, target: 25, trend: 15, previousPeriodTotal: 22, totalTrend: -18, icon: 'meetings', color: 'violet' },
      { title: 'Proposals', value: deals.filter((d) => d.stage === 'proposal').length + 2, target: 8, trend: 25, previousPeriodTotal: 6, totalTrend: -17, icon: 'proposals', color: 'orange' },
    ],
  };

  return {
    user: defaults.user,
    org: defaults.org,
    companies,
    contacts,
    deals,
    meetings,
    activities,
    kpis,
    emailDraft,
    slackMessages,
    visitorCompany,
    visitorDeal,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function estimateDealValue(employeeRange: string): number {
  const ranges: Record<string, number> = {
    '1-10': 24000,
    '11-50': 48000,
    '51-200': 95000,
    '201-1000': 180000,
    '1000+': 350000,
  };
  return ranges[employeeRange] ?? 95000;
}

function buildCompanyContacts(
  companyName: string,
  domain: string,
  research: ResearchInput
): SandboxContact[] {
  // Generate 2 additional contacts for the visitor's company
  return [
    {
      id: 'contact-002',
      first_name: 'James',
      last_name: 'Park',
      email: `james.park@${domain}`,
      title: 'Head of Revenue Operations',
      company_id: 'company-visitor',
      company_name: companyName,
      engagement_level: 'warm',
      last_interaction_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: 'contact-003',
      first_name: 'Maria',
      last_name: 'Rodriguez',
      email: `maria@${domain}`,
      title: 'CEO',
      company_id: 'company-visitor',
      company_name: companyName,
      engagement_level: 'warm',
      last_interaction_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
  ];
}

function buildEmailBody(visitorName: string, companyName: string, dealValue: number): string {
  const firstName = visitorName.split(' ')[0] ?? 'there';
  return `Hi ${firstName},

Great speaking with you yesterday. I could tell from the conversation that pipeline visibility and follow-up automation are exactly the pain points we can solve for your team at ${companyName}.

As promised, I've put together a revised proposal with the enterprise tier pricing we discussed. The key highlights:

- Full platform access for your team
- Dedicated onboarding and CRM migration support
- Meeting intelligence + AI follow-ups from day one
- 90-day pilot option if you'd prefer to start smaller

I've also included a technical spec sheet that covers the full bidirectional CRM sync capabilities, since that came up in our conversation.

Given your timeline, I'd suggest we aim to have a decision by the end of this month so your team can show early results. Happy to jump on a quick call to walk through the proposal if that's helpful.

Looking forward to your thoughts.

Best,
Alex`;
}
