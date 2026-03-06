/**
 * generatePersonalizedData
 *
 * Transforms ResearchData (from useDemoResearch or /t/{code} enrichment)
 * into a complete SandboxData object. The visitor IS the logged-in user/rep.
 * Their company becomes the org, and the demo shows industry-relevant
 * prospects they're selling to. Email drafts are FROM the visitor TO prospects.
 */

import type { SandboxData, SandboxUser, SandboxOrg, SandboxCompany, SandboxContact, SandboxDeal, DealStage, SandboxMeeting, SandboxActivity, SandboxEmailDraft, SandboxSlackMessage, SandboxMeetingPrep, SandboxKPIs, SandboxProposal } from './sandboxTypes';
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
    ? `${visitor.first_name} ${visitor.last_name ?? ''}`.trim()
    : 'You';
  const visitorFirstName = visitor?.first_name ?? 'You';
  const visitorTitle = visitor?.title ?? 'Founder';
  const visitorEmail = visitor?.email ?? `hello@${companyDomain}`;
  const industry = research.company?.vertical ?? 'Technology';
  const employeeRange = research.company?.employee_range ?? '51-200';

  // ── The visitor IS the logged-in user ──────────────────────────
  const visitorInitials = visitor?.first_name
    ? `${visitor.first_name[0]}${(visitor.last_name ?? '')[0] ?? ''}`.toUpperCase()
    : companyName.slice(0, 2).toUpperCase();

  const user: SandboxUser = {
    id: 'user-demo-001',
    full_name: visitorName === 'You' ? companyName : visitorName,
    email: visitorEmail,
    initials: visitorInitials,
  };

  const org: SandboxOrg = {
    id: 'org-demo-001',
    name: companyName,
    currency_symbol: '$',
  };

  // ── Build prospect companies relevant to the visitor's industry ──
  const prospectCompanies = buildProspectCompanies(companyName, companyDomain, industry, research);
  const companies: SandboxCompany[] = prospectCompanies;

  // ── Build prospect contacts (people at those companies) ──────
  const prospectContacts = buildProspectContacts(prospectCompanies, industry);
  const contacts: SandboxContact[] = prospectContacts;

  // The primary prospect (featured in email, meeting prep)
  const primaryProspect = prospectContacts[0];
  const primaryCompany = prospectCompanies[0];

  // Use deal value from research if available, otherwise estimate from company size
  const researchDealValue = research.demo_actions?.pipeline_action?.deal_value;
  const primaryDealValue = researchDealValue
    ? parseInt(researchDealValue.replace(/[^0-9]/g, ''), 10) || estimateDealValue(primaryCompany.size ?? '51-200')
    : estimateDealValue(primaryCompany.size ?? '51-200');

  // ── Visitor's Company (the org, shown in sidebar) ──────────────
  const visitorCompany: SandboxCompany = {
    id: 'company-visitor',
    name: companyName,
    domain: companyDomain,
    industry,
    size: employeeRange,
    isVisitorCompany: true,
  };

  // ── Deals: prospects the visitor is selling to ─────────────────
  const pipelineAction = research.demo_actions?.pipeline_action;
  const primaryDeal: SandboxDeal = {
    id: 'deal-visitor',
    name: pipelineAction?.deal_name ?? `${primaryCompany.name} — ${industry} Solution`,
    company_id: primaryCompany.id,
    company_name: primaryCompany.name,
    company_domain: primaryCompany.domain,
    value: primaryDealValue,
    stage: 'proposal',
    stage_color: '#8b5cf6',
    health_score: pipelineAction?.health_score ?? 72,
    health_status: (pipelineAction?.health_score ?? 72) < 50 ? 'critical' : 'warning',
    momentum_score: 15,
    probability: 65,
    owner_id: 'user-demo-001',
    owner_initials: visitorInitials,
    primary_contact_id: primaryProspect.id,
    primary_contact_name: `${primaryProspect.first_name} ${primaryProspect.last_name}`,
    expected_close_date: new Date(Date.now() + 21 * 86400000).toISOString(),
    days_in_stage: pipelineAction?.days_stale ?? 4,
    risk_level: 'medium',
    risk_factors: [
      research.demo_actions?.pipeline_action?.risk_signal ?? 'Decision maker not yet engaged',
      'Budget approval timeline unclear',
    ],
    next_steps: research.demo_actions?.pipeline_action?.suggested_action ?? 'Send revised proposal with pricing options',
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

  // Additional deals from other prospect companies
  const additionalDeals: SandboxDeal[] = prospectCompanies.slice(1).map((comp, i) => {
    const contact = prospectContacts.find((c) => c.company_id === comp.id);
    const stages: DealStage[] = ['negotiation', 'qualified', 'lead', 'closed_won'];
    const stageColors = ['#f59e0b', '#3b82f6', '#6366f1', '#10b981'];
    const healthScores = [85, 58, 45, 95];
    const healthStatuses: Array<'healthy' | 'warning' | 'critical'> = ['healthy', 'warning', 'critical', 'healthy'];
    const riskLevels: Array<'low' | 'medium' | 'high'> = ['low', 'high', 'medium', 'low'];
    const probabilities = [80, 40, 20, 100];
    const values = [48000, 120000, 210000, 35000];

    return {
      id: `deal-${i + 2}`,
      name: `${comp.name} — ${i === 3 ? 'Pilot Program' : i === 0 ? 'Annual Plan' : 'Evaluation'}`,
      company_id: comp.id,
      company_name: comp.name,
      company_domain: comp.domain,
      value: values[i] ?? 60000,
      stage: stages[i] ?? 'qualified' as DealStage,
      stage_color: stageColors[i] ?? '#3b82f6',
      health_score: healthScores[i] ?? 60,
      health_status: healthStatuses[i] ?? 'warning' as const,
      momentum_score: i === 0 ? 30 : i === 3 ? 50 : -5 + i * 8,
      probability: probabilities[i] ?? 50,
      owner_id: 'user-demo-001',
      owner_initials: visitorInitials,
      primary_contact_id: contact?.id,
      primary_contact_name: contact ? `${contact.first_name} ${contact.last_name}` : undefined,
      expected_close_date: new Date(Date.now() + (10 + i * 14) * 86400000).toISOString(),
      days_in_stage: 3 + i * 3,
      risk_level: riskLevels[i] ?? 'medium' as const,
      risk_factors: i === 1 ? ['Stalled 12 days in qualified', 'Previously evaluated competitor'] : [],
      next_steps: i === 0 ? 'Final contract review with legal' : i === 3 ? 'Onboarding kickoff next Monday' : 'Schedule follow-up',
      next_actions: i === 0 ? ['Send updated MSA', 'Schedule onboarding kickoff'] : ['Follow up', 'Share case study'],
      relationship_health_status: i === 1 ? 'at_risk' as const : 'healthy' as const,
      contact_count: 2,
      created_at: new Date(Date.now() - (14 + i * 7) * 86400000).toISOString(),
    };
  });

  // Add competitor deals if research has competitors
  const competitorDeals: SandboxDeal[] = (research.company?.competitors ?? []).slice(0, 2).map((comp, i) => {
    const compDomain = comp.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
    return {
      id: `deal-comp-${i}`,
      name: `${comp} — Evaluation`,
      company_id: `company-comp-${i}`,
      company_name: comp,
      company_domain: compDomain,
      value: primaryDealValue * (0.6 + Math.random() * 0.4),
      stage: i === 0 ? 'qualified' as DealStage : 'lead' as DealStage,
      stage_color: i === 0 ? '#3b82f6' : '#6366f1',
      health_score: 45 + i * 20,
      health_status: i === 0 ? 'warning' as const : 'healthy' as const,
      momentum_score: 5 + i * 8,
      probability: 30 + i * 15,
      owner_id: 'user-demo-001',
      owner_initials: visitorInitials,
      expected_close_date: new Date(Date.now() + (35 + i * 14) * 86400000).toISOString(),
      days_in_stage: 6 + i * 3,
      risk_level: 'medium' as const,
      created_at: new Date(Date.now() - (14 + i * 7) * 86400000).toISOString(),
    };
  });

  const deals: SandboxDeal[] = [
    primaryDeal,
    ...additionalDeals,
    ...competitorDeals,
  ];

  // ── Meeting Prep (for the visitor's meeting with a prospect) ──
  const productDesc = research.company?.product_summary;
  const topValueProps = research.company?.value_props?.slice(0, 2) ?? [];

  const meetingContext = research.demo_actions?.meeting_prep?.context;
  const meetingCompany = research.demo_actions?.meeting_prep?.attendee_company ?? primaryCompany.name;

  const defaultMeetingPrep: SandboxMeetingPrep = {
    company_overview: meetingContext
      ? `${meetingCompany} — ${meetingContext}`
      : productDesc
        ? `${primaryCompany.name} is a ${primaryCompany.size ?? 'mid-market'} employee company. Good fit for ${companyName} — ${productDesc.charAt(0).toLowerCase()}${productDesc.slice(1).replace(/\.$/, '')}.`
        : `${primaryCompany.name} is a mid-market company evaluating ${industry.toLowerCase()} solutions. Strong potential for ${companyName}'s platform.`,
    talking_points: research.demo_actions?.meeting_prep?.talking_points ?? [
      ...(topValueProps.length > 0
        ? topValueProps.map((vp) => `Lead with "${vp}" — directly addresses their pain points`)
        : [`${primaryCompany.name} spends significant time on manual processes — lead with automation value`]),
      productDesc
        ? `Position ${companyName}: ${productDesc.slice(0, 80)}${productDesc.length > 80 ? '...' : ''}`
        : `Reference ${companyName}'s ${industry.toLowerCase()} expertise and similar customer wins`,
      `${primaryProspect.first_name} is the key stakeholder — tailor the conversation to their priorities`,
      `They have a decision timeline — create natural urgency around their pain points`,
      `Address technical concerns proactively — offer a security review doc`,
    ],
    risk_signals: [
      `Budget approval may need additional sign-off for deals over $${(primaryDealValue / 2000).toFixed(0)}K`,
      `Evaluate whether ${primaryProspect.first_name} has final decision authority`,
      `Ask what previous solutions they've evaluated and why they paused`,
    ],
    questions_to_ask: [
      'What does your current process look like and where are the biggest bottlenecks?',
      'How are you measuring ROI on solutions like this today?',
      'Who else needs to be involved in the decision before we can move forward?',
    ],
    deal_context: `$${(primaryDealValue / 1000).toFixed(0)}K proposal stage, 65% probability. 4 days in current stage. Medium risk — needs revised pricing proposal.`,
  };
  const meetingPrep: SandboxMeetingPrep = aiContent?.meeting_prep
    ? { ...defaultMeetingPrep, ...aiContent.meeting_prep }
    : defaultMeetingPrep;

  // Use meeting prep attendee from research if available
  const meetingPrepData = research.demo_actions?.meeting_prep;
  const meetingAttendeeName = meetingPrepData?.attendee_name ?? `${primaryProspect.first_name} ${primaryProspect.last_name}`;
  const meetingAttendeeCompany = meetingPrepData?.attendee_company ?? primaryCompany.name;

  const meetings: SandboxMeeting[] = [
    {
      ...defaults.meetings[0],
      title: `${meetingAttendeeCompany} — Demo & Pricing Review`,
      company_name: meetingAttendeeCompany,
      company_id: primaryCompany.id,
      attendees: [
        { name: meetingAttendeeName, title: primaryProspect.title, company: meetingAttendeeCompany },
        ...prospectContacts.filter((c) => c.company_id === primaryCompany.id).slice(1, 2).map((c) => ({
          name: `${c.first_name} ${c.last_name}`,
          title: c.title,
          company: meetingAttendeeCompany,
        })),
      ],
      prep: meetingPrep,
      talking_points: meetingPrep.talking_points,
      risk_signals: meetingPrep.risk_signals,
    },
    ...defaults.meetings.slice(1).map((m, i) => ({
      ...m,
      company_name: prospectCompanies[i + 1]?.name ?? m.company_name,
      company_id: prospectCompanies[i + 1]?.id ?? m.company_id,
      attendees: m.attendees.map((a, j) => {
        const contact = prospectContacts.find((c) => c.company_id === prospectCompanies[i + 1]?.id);
        if (j === 0 && contact) {
          return { name: `${contact.first_name} ${contact.last_name}`, title: contact.title, company: prospectCompanies[i + 1]?.name };
        }
        return a;
      }),
    })),
  ];

  // ── Email Draft (FROM the visitor TO a prospect) ─────────────
  // Priority: AI content (deep research) > cold_outreach email_preview (initial research) > buildEmailBody fallback
  const coldOutreach = research.demo_actions?.cold_outreach;
  const emailBody = aiContent?.email_draft?.body
    ?? coldOutreach?.email_preview
    ?? buildEmailBody(
      `${primaryProspect.first_name} ${primaryProspect.last_name}`,
      primaryCompany.name,
      primaryDealValue,
      visitorFirstName,
      companyName,
      industry,
      research.company?.product_summary,
      research.company?.value_props
    );
  const emailSubject = aiContent?.email_draft?.subject
    ?? (coldOutreach?.target_company ? `Re: ${coldOutreach.target_company} — next steps` : null)
    ?? `Re: ${primaryCompany.name} — next steps`;

  const emailDraft: SandboxEmailDraft = {
    to_name: coldOutreach?.target_name ?? `${primaryProspect.first_name} ${primaryProspect.last_name}`,
    to_email: coldOutreach?.target_name
      ? `${(coldOutreach.target_name).split(' ')[0]?.toLowerCase()}.${(coldOutreach.target_name).split(' ').pop()?.toLowerCase()}@${primaryCompany.domain}`
      : primaryProspect.email,
    to_title: coldOutreach?.target_title ?? primaryProspect.title,
    to_company: coldOutreach?.target_company ?? primaryCompany.name,
    subject: emailSubject,
    body: emailBody,
    reasoning: `Generated based on your meeting with ${coldOutreach?.target_company ?? primaryCompany.name}. ${(coldOutreach?.target_name ?? primaryProspect.first_name).split(' ')[0]}'s role as ${coldOutreach?.target_title ?? primaryProspect.title} informed the messaging. Deal value of $${(primaryDealValue / 1000).toFixed(0)}K and proposal stage context included. Signed off as ${visitorFirstName} from ${companyName}.`,
  };

  // ── Activities (the visitor's recent sales activity) ──────────
  const activities: SandboxActivity[] = [
    {
      id: 'act-001',
      type: 'email',
      subject: `Follow-up: Demo recap with ${primaryCompany.name}`,
      details: `AI-drafted follow-up sent to ${primaryProspect.first_name} with pricing attachment`,
      contact_name: `${primaryProspect.first_name} ${primaryProspect.last_name}`,
      company_name: primaryCompany.name,
      deal_name: primaryDeal.name,
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 'act-002',
      type: 'meeting',
      subject: `Discovery call completed — ${prospectCompanies[1]?.name ?? 'Prospect'}`,
      details: `Initial discovery with ${prospectContacts.find((c) => c.company_id === prospectCompanies[1]?.id)?.first_name ?? 'contact'}. Strong interest in ${industry.toLowerCase()} capabilities.`,
      contact_name: prospectContacts.find((c) => c.company_id === prospectCompanies[1]?.id) ? `${prospectContacts.find((c) => c.company_id === prospectCompanies[1]?.id)!.first_name} ${prospectContacts.find((c) => c.company_id === prospectCompanies[1]?.id)!.last_name}` : undefined,
      company_name: prospectCompanies[1]?.name,
      created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      id: 'act-003',
      type: 'deal_update',
      subject: `Deal moved to Closed Won — ${prospectCompanies[4]?.name ?? 'Client'}`,
      details: `${prospectCompanies[4]?.name ?? 'Client'} pilot signed. $35K ARR.`,
      company_name: prospectCompanies[4]?.name,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'act-005',
      type: 'task',
      subject: `Send revised proposal to ${primaryCompany.name}`,
      details: 'Include pricing options and implementation timeline',
      company_name: primaryCompany.name,
      deal_name: primaryDeal.name,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'act-009',
      type: 'email',
      subject: `Case study shared with ${primaryCompany.name}`,
      details: `Sent ${industry.toLowerCase()} case study showing 41% improvement in results`,
      contact_name: `${primaryProspect.first_name} ${primaryProspect.last_name}`,
      company_name: primaryCompany.name,
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    ...(research.company?.value_props ?? []).slice(0, 1).map((vp, i) => ({
      id: `act-vp-${i}`,
      type: 'email' as const,
      subject: `Value prop alignment: ${vp.slice(0, 50)}`,
      details: `Personalized messaging based on ${primaryCompany.name}'s needs`,
      contact_name: `${primaryProspect.first_name} ${primaryProspect.last_name}`,
      company_name: primaryCompany.name,
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    })),
  ];

  // ── Slack Messages ───────────────────────────────────────────
  const slackMessages: SandboxSlackMessage[] = [
    {
      channel: '#deals',
      title: `Meeting Prep Ready — ${primaryCompany.name}`,
      body: `Your meeting with ${primaryProspect.first_name} (${primaryCompany.name}) is tomorrow at 2pm. Prep doc is ready with ${meetingPrep.talking_points.length} talking points and ${meetingPrep.risk_signals.length} risk signals.`,
      accent_color: '#6C5CE7',
      fields: [
        { label: 'Deal Value', value: `$${(primaryDealValue / 1000).toFixed(0)},000` },
        { label: 'Health Score', value: `${primaryDeal.health_score}/100` },
        { label: 'Stage', value: 'Proposal' },
        { label: 'Days in Stage', value: '4' },
      ],
      actions: ['View Prep Doc', 'Open Deal'],
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      channel: '#deals',
      title: 'Follow-up Email Ready for Approval',
      body: `AI drafted a follow-up to ${primaryProspect.first_name} at ${primaryCompany.name} based on yesterday's call. Ready for your review.`,
      accent_color: '#06b6d4',
      fields: [
        { label: 'To', value: primaryProspect.email },
        { label: 'Subject', value: emailDraft.subject },
      ],
      actions: ['Approve & Send', 'Edit Draft'],
      timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    {
      channel: '#deals',
      title: `Deal Won — ${prospectCompanies[4]?.name ?? 'Client'}`,
      body: `${prospectCompanies[4]?.name ?? 'Client'} pilot signed! $35K ARR. Onboarding starts Monday.`,
      accent_color: '#22c55e',
      fields: [
        { label: 'Deal Value', value: '$35,000' },
        { label: 'Sales Cycle', value: '47 days' },
        { label: 'Win Rate Impact', value: '+3%' },
      ],
      actions: ['Celebrate', 'Start Onboarding'],
      timestamp: new Date(Date.now() - 86400000).toISOString(),
    },
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

  // ── Proposals (personalized from deals + visitor's product/service) ──
  const productSummary = research.company?.product_summary;
  const valueProps = research.company?.value_props ?? [];
  const proposals: SandboxProposal[] = defaults.proposals.map((p, i) => {
    const deal = deals[i];
    if (!deal) return p;
    const contact = contacts.find((c) => c.company_id === deal.company_id);
    const contactFullName = contact ? `${contact.first_name} ${contact.last_name}` : p.contact_name;
    const contactFirstName = contact?.first_name ?? p.contact_name.split(' ')[0];

    // For the primary proposal, build fully personalized sections
    if (i === 0 && productSummary) {
      return {
        ...p,
        title: `${deal.company_name} — ${companyName} Proposal`,
        deal_name: deal.name,
        company_name: deal.company_name,
        contact_name: contactFullName,
        value: deal.value,
        sections: buildPersonalizedProposalSections(
          companyName,
          deal.company_name,
          contactFullName,
          contactFirstName,
          deal.value,
          productSummary,
          valueProps,
          industry,
          deal.company_domain ?? '',
        ),
      };
    }

    return {
      ...p,
      title: `${deal.company_name} — ${companyName} Proposal`,
      deal_name: deal.name,
      company_name: deal.company_name,
      contact_name: contactFullName,
      value: deal.value,
      // Update exec summary for secondary proposals too
      sections: p.sections.map((sec) => {
        if (sec.type === 'executive_summary' && productSummary) {
          return {
            ...sec,
            content: `<p>This proposal outlines how <strong>${companyName}</strong> can help ${deal.company_name} — ${productSummary.charAt(0).toLowerCase()}${productSummary.slice(1).replace(/\.$/, '')}. Based on our conversations with ${contactFullName}, we've tailored this engagement to address your team's specific needs.</p>`,
          };
        }
        return sec;
      }),
    };
  });

  return {
    user,
    org,
    companies,
    contacts,
    deals,
    meetings,
    activities,
    kpis,
    emailDraft,
    slackMessages,
    proposals,
    visitorCompany,
    visitorDeal: primaryDeal,
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

/** Industry-specific prospect company templates */
const INDUSTRY_PROSPECTS: Record<string, { companies: { name: string; domain: string; size: string; industry: string }[]; titles: string[] }> = {
  'Technology': {
    companies: [
      { name: 'Meridian Systems', domain: 'meridiansystems.io', size: '51-200', industry: 'Enterprise Software' },
      { name: 'Apex Digital', domain: 'apexdigital.com', size: '201-1000', industry: 'Digital Services' },
      { name: 'Cloudbridge Solutions', domain: 'cloudbridge.co', size: '11-50', industry: 'Cloud Infrastructure' },
      { name: 'Nextera Analytics', domain: 'nextera.ai', size: '51-200', industry: 'Data & Analytics' },
      { name: 'Brightpath Health', domain: 'brightpathhealth.com', size: '201-1000', industry: 'HealthTech' },
    ],
    titles: ['VP of Operations', 'Head of Growth', 'CRO', 'Director of Strategy', 'COO'],
  },
  'SaaS': {
    companies: [
      { name: 'ScaleForce', domain: 'scaleforce.io', size: '51-200', industry: 'Revenue Operations' },
      { name: 'Catalyze HQ', domain: 'catalyzehq.com', size: '201-1000', industry: 'Marketing Tech' },
      { name: 'TrueNorth Labs', domain: 'truenorthlabs.com', size: '11-50', industry: 'Product Analytics' },
      { name: 'Flywheel Commerce', domain: 'flywheelcommerce.com', size: '51-200', industry: 'eCommerce' },
      { name: 'Onward Group', domain: 'onwardgroup.co', size: '201-1000', industry: 'Professional Services' },
    ],
    titles: ['Head of Revenue', 'VP of Sales', 'Director of Operations', 'Chief Growth Officer', 'VP of Business Development'],
  },
  'default': {
    companies: [
      { name: 'Sterling & Co', domain: 'sterlingco.com', size: '51-200', industry: 'Professional Services' },
      { name: 'Vanguard Partners', domain: 'vanguardpartners.com', size: '201-1000', industry: 'Consulting' },
      { name: 'Horizon Enterprises', domain: 'horizonenterprises.co', size: '11-50', industry: 'Business Services' },
      { name: 'Summit Group', domain: 'summitgroup.io', size: '51-200', industry: 'Technology' },
      { name: 'Atlas Ventures', domain: 'atlasventures.com', size: '201-1000', industry: 'Venture Capital' },
    ],
    titles: ['Managing Director', 'VP of Operations', 'Head of Partnerships', 'Chief Revenue Officer', 'Director of Business Development'],
  },
};

/** First/last name pools for realistic prospect contacts */
const FIRST_NAMES = ['Sarah', 'James', 'Emily', 'Tom', 'Maria', 'Ryan', 'Lisa', 'David', 'Anna', 'Marcus', 'Rachel', 'Kevin'];
const LAST_NAMES = ['Chen', 'Park', 'Brooks', 'Wilson', 'Rodriguez', 'Patel', 'Nguyen', 'Kim', 'Kowalski', 'Johnson', 'Torres', 'Blake'];

function buildProspectCompanies(
  _visitorCompany: string,
  _visitorDomain: string,
  industry: string,
  research: ResearchInput
): SandboxCompany[] {
  // Use competitors from research as top prospect companies if available
  const competitors = research.company?.competitors ?? [];
  const template = INDUSTRY_PROSPECTS[industry] ?? INDUSTRY_PROSPECTS['default'];
  const companies: SandboxCompany[] = [];

  // First, add competitor companies (these are the most relevant)
  competitors.slice(0, 2).forEach((comp, i) => {
    const compDomain = comp.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
    companies.push({
      id: `company-${companies.length + 1}`,
      name: comp,
      domain: compDomain,
      industry: industry,
      size: template.companies[i]?.size ?? '51-200',
    });
  });

  // Fill remaining with industry-relevant template companies
  const needed = 5 - companies.length;
  const templateCompanies = template.companies.slice(0, needed);
  templateCompanies.forEach((tc) => {
    companies.push({
      id: `company-${companies.length + 1}`,
      name: tc.name,
      domain: tc.domain,
      industry: tc.industry,
      size: tc.size,
    });
  });

  return companies;
}

function buildProspectContacts(
  companies: SandboxCompany[],
  industry: string
): SandboxContact[] {
  const template = INDUSTRY_PROSPECTS[industry] ?? INDUSTRY_PROSPECTS['default'];
  const contacts: SandboxContact[] = [];
  let nameIndex = 0;

  companies.forEach((company, companyIndex) => {
    // 2 contacts per company
    const contactsPerCompany = companyIndex === 0 ? 3 : 2;
    for (let j = 0; j < contactsPerCompany; j++) {
      const firstName = FIRST_NAMES[nameIndex % FIRST_NAMES.length];
      const lastName = LAST_NAMES[nameIndex % LAST_NAMES.length];
      const title = j === 0
        ? template.titles[companyIndex % template.titles.length]
        : j === 1 ? 'Head of Operations' : 'CEO';
      const engagement: 'hot' | 'warm' | 'cold' = companyIndex === 0 ? (j === 0 ? 'hot' : 'warm') : j === 0 ? 'warm' : 'cold';

      contacts.push({
        id: `contact-${contacts.length + 1}`,
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.domain}`,
        title,
        company_id: company.id,
        company_name: company.name,
        engagement_level: engagement,
        last_interaction_at: new Date(Date.now() - (1 + companyIndex * 3 + j * 2) * 86400000).toISOString(),
      });

      nameIndex++;
    }
  });

  return contacts;
}

function buildEmailBody(
  prospectName: string,
  prospectCompany: string,
  _dealValue: number,
  senderFirstName: string,
  senderCompany: string,
  industry: string,
  productSummary?: string,
  valueProps?: string[]
): string {
  const firstName = prospectName.split(' ')[0] ?? 'there';

  // Build bullet points from value props if available, otherwise use generic ones
  const bullets = valueProps && valueProps.length >= 2
    ? valueProps.slice(0, 4).map((vp) => `- ${vp}`)
    : [
        `- Full platform access for your team`,
        `- Dedicated onboarding and migration support`,
        `- Hands-on implementation from day one`,
        `- Flexible pilot option if you'd prefer to start smaller`,
      ];

  // Use product summary to describe what the sender's company does
  const whatWeDo = productSummary
    ? `From our conversation, it's clear that ${prospectCompany} could benefit from what we're building at ${senderCompany} — ${productSummary.charAt(0).toLowerCase()}${productSummary.slice(1).replace(/\.$/, '')}.`
    : `I could tell from the conversation that the challenges your team faces are exactly what we've been helping ${industry.toLowerCase()} companies solve at ${senderCompany}.`;

  return `Hi ${firstName},

Great speaking with you yesterday. ${whatWeDo}

As promised, I've put together a revised proposal with the pricing we discussed. Here's what we'd bring to ${prospectCompany}:

${bullets.join('\n')}

I've also included a spec sheet covering the integration and implementation details we discussed, since I know that was a key concern for your team.

Given your timeline, I'd suggest we aim to have a decision by the end of this month so your team can start seeing results quickly. Happy to jump on a quick call to walk through the proposal.

Looking forward to your thoughts.

Best,
${senderFirstName}`;
}

function buildPersonalizedProposalSections(
  senderCompany: string,
  prospectCompany: string,
  contactName: string,
  contactFirstName: string,
  dealValue: number,
  productSummary: string,
  valueProps: string[],
  industry: string,
  prospectDomain: string,
): SandboxProposal['sections'] {
  const valueK = (dealValue / 1000).toFixed(0);
  const bullets = valueProps.length >= 2
    ? valueProps.slice(0, 4)
    : [
        'Streamline your team\'s workflow and eliminate manual tasks',
        'Get real-time visibility into performance and pipeline',
        'Automate follow-ups and keep deals moving forward',
        'Dedicated onboarding and hands-on implementation support',
      ];

  return [
    {
      id: 'sec-p-cover',
      type: 'cover',
      title: `${senderCompany} — Proposal for ${prospectCompany}`,
      content: '',
      order: 0,
    },
    {
      id: 'sec-p-exec',
      type: 'executive_summary',
      title: 'Executive Summary',
      content: `<p>This proposal outlines how <strong>${senderCompany}</strong> can transform ${prospectCompany}'s operations — ${productSummary.charAt(0).toLowerCase()}${productSummary.slice(1).replace(/\.$/, '')}.</p><p>Based on our conversations with ${contactName}, we've identified key areas where ${senderCompany} delivers immediate value. We project measurable results within the first 90 days, with a full return on investment by quarter two.</p>`,
      order: 1,
    },
    {
      id: 'sec-p-problem',
      type: 'problem',
      title: 'The Challenge',
      content: `<p>${prospectCompany} is facing challenges common to growing ${industry.toLowerCase()} organizations:</p><table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Challenge</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Impact</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Priority</th></tr></thead><tbody><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">Fragmented tools and manual processes</td><td style="padding:10px 16px;">~15 hours/week lost to admin</td><td style="padding:10px 16px;"><span style="color:#ef4444; font-weight:600;">High</span></td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">Limited visibility into performance</td><td style="padding:10px 16px;">Missed opportunities and slow decisions</td><td style="padding:10px 16px;"><span style="color:#ef4444; font-weight:600;">High</span></td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">Inconsistent follow-up and engagement</td><td style="padding:10px 16px;">Deals stalling in pipeline</td><td style="padding:10px 16px;"><span style="color:#f59e0b; font-weight:600;">Medium</span></td></tr></tbody></table><p>${contactFirstName} highlighted these as top priorities in our most recent conversation. Addressing them will have an estimated <strong>$${(dealValue * 1.8 / 1000).toFixed(0)}K annual impact</strong> on ${prospectCompany}'s bottom line.</p>`,
      order: 2,
    },
    {
      id: 'sec-p-solution',
      type: 'solution',
      title: 'Our Solution',
      content: `<p><strong>${senderCompany}</strong> provides a comprehensive solution designed for ${prospectCompany}:</p><table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Capability</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">What You Get</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Expected Outcome</th></tr></thead><tbody>${bullets.map((vp, i) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">${vp.length > 50 ? vp.slice(0, 50) + '...' : vp}</td><td style="padding:10px 16px;">${vp}</td><td style="padding:10px 16px; color:#37bd7e;">+${15 + i * 8}% improvement</td></tr>`).join('')}</tbody></table>`,
      order: 3,
    },
    {
      id: 'sec-p-timeline',
      type: 'timeline',
      title: 'Implementation Timeline',
      content: `<table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Phase</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Timeline</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Activities</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Milestone</th></tr></thead><tbody><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">Onboarding</td><td style="padding:10px 16px;">Week 1-2</td><td style="padding:10px 16px;">Account setup, data migration, team provisioning</td><td style="padding:10px 16px; color:#37bd7e;">Go live</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">Training</td><td style="padding:10px 16px;">Week 3-4</td><td style="padding:10px 16px;">Team training sessions, workflow configuration</td><td style="padding:10px 16px; color:#37bd7e;">Team activated</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">Optimization</td><td style="padding:10px 16px;">Week 5-8</td><td style="padding:10px 16px;">Custom tuning, automation setup, performance review</td><td style="padding:10px 16px; color:#37bd7e;">Full ROI</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">Ongoing</td><td style="padding:10px 16px;">Month 3+</td><td style="padding:10px 16px;">Quarterly reviews, feature roadmap alignment</td><td style="padding:10px 16px; color:#37bd7e;">Scale</td></tr></tbody></table>`,
      order: 4,
    },
    {
      id: 'sec-p-pricing',
      type: 'pricing',
      title: 'Investment',
      content: `<p>Tailored pricing for ${prospectCompany}:</p><table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Item</th><th style="text-align:right; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Annual Cost</th></tr></thead><tbody><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">${senderCompany} Platform License</td><td style="text-align:right; padding:10px 16px;">$${(dealValue * 0.7 / 1000).toFixed(0)},000</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">Implementation & Onboarding</td><td style="text-align:right; padding:10px 16px;">$${(dealValue * 0.15 / 1000).toFixed(0)},000</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px;">Priority Support (Year 1)</td><td style="text-align:right; padding:10px 16px;">$${(dealValue * 0.15 / 1000).toFixed(0)},000</td></tr><tr style="border-top:2px solid rgba(255,255,255,0.15);"><td style="padding:10px 16px; font-weight:700;">Total Investment</td><td style="text-align:right; padding:10px 16px; font-weight:700; color:#37bd7e;">$${valueK},000</td></tr></tbody></table><p style="margin-top:12px; padding:12px 16px; background:rgba(55,189,126,0.08); border:1px solid rgba(55,189,126,0.15); border-radius:8px; font-size:0.875rem;"><strong>90-day pilot available</strong> — $${(dealValue * 0.3 / 1000).toFixed(0)},000 for a 3-month commitment to prove ROI before full engagement.</p>`,
      order: 5,
    },
    {
      id: 'sec-p-terms',
      type: 'terms',
      title: 'Terms & Next Steps',
      content: `<p>This proposal is valid for 30 days. To move forward:</p><table style="width:100%; border-collapse:collapse; margin:16px 0;"><thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Step</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Action</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Owner</th><th style="text-align:left; padding:10px 16px; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(255,255,255,0.03);">Timeline</th></tr></thead><tbody><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">1</td><td style="padding:10px 16px;">Review and approve this proposal</td><td style="padding:10px 16px;">${contactFirstName}</td><td style="padding:10px 16px;">This week</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">2</td><td style="padding:10px 16px;">Align stakeholders on scope and timeline</td><td style="padding:10px 16px;">${contactFirstName} + team</td><td style="padding:10px 16px;">Week 1</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">3</td><td style="padding:10px 16px;">Execute service agreement</td><td style="padding:10px 16px;">Both parties</td><td style="padding:10px 16px;">Week 2</td></tr><tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:10px 16px; font-weight:500;">4</td><td style="padding:10px 16px;">Kick off onboarding</td><td style="padding:10px 16px;">${senderCompany}</td><td style="padding:10px 16px;">Week 2-3</td></tr></tbody></table><p>We're confident this partnership will deliver measurable results for ${prospectCompany}. Let's make it happen.</p>`,
      order: 6,
    },
  ];
}
