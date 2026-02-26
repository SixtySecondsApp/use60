/**
 * Demo Experience — Mock Data
 *
 * Pre-built research data for example.com (Velocity CRM) and a
 * generator that creates plausible data from any URL domain.
 */

import type { ResearchData } from './demo-types';

// ============================================================================
// Example.com Fallback — "Velocity CRM"
// ============================================================================

export const EXAMPLE_RESEARCH: ResearchData = {
  company: {
    name: 'Velocity CRM',
    domain: 'velocitycrm.io',
    vertical: 'B2B SaaS',
    product_summary:
      'Sales acceleration platform for mid-market SaaS teams. Combines pipeline management, conversation intelligence, and automated outreach in one workspace.',
    value_props: [
      'AI-powered deal scoring',
      'Automated follow-up sequences',
      'Real-time pipeline analytics',
    ],
    icp: {
      title: 'VP Sales / Head of Revenue',
      company_size: '50\u2013200 employees',
      industry: 'SaaS / Technology',
    },
  },
  demo_actions: {
    cold_outreach: {
      target_name: 'Sarah Chen',
      target_title: 'VP Operations',
      target_company: 'BuildRight Solutions',
      personalised_hook:
        'Noticed BuildRight expanded to 3 new regions this quarter \u2014 that kind of growth usually breaks sales processes before anyone notices.',
      email_preview:
        "Hi Sarah,\n\nI saw BuildRight's expansion into the Southeast \u2014 congrats. When teams scale that fast, the pipeline usually outgrows the process.\n\nVelocity CRM helps mid-market teams keep close rates steady during rapid growth. We automated deal scoring and follow-ups for Pinnacle Group and they maintained 62% close rate through a 3x pipeline increase.\n\nWorth a 15-minute look?\n\nBest,\nAlex",
    },
    proposal_draft: {
      prospect_name: 'James Wright',
      prospect_company: 'TechFlow Engineering',
      proposal_title:
        'How Velocity CRM accelerates pipeline velocity for TechFlow Engineering',
      key_sections: [
        'Current pipeline challenges at TechFlow',
        'Proposed solution & integration plan',
        'Projected ROI \u2014 40% faster deal cycles',
        '90-day implementation timeline',
      ],
    },
    meeting_prep: {
      attendee_name: 'David Park',
      attendee_company: 'Zenith Digital',
      context:
        'Follow-up from initial demo. David was interested in the deal scoring module but asked about CRM migration from HubSpot.',
      talking_points: [
        'HubSpot migration takes 48 hours, not weeks \u2014 zero data loss',
        "Deal scoring reduced Zenith-sized teams' lost deals by 28%",
        'Integration with their existing Slack + Notion workflow',
        'Pricing: Growth plan at $89/seat fits their 35-person sales team',
      ],
    },
    pipeline_action: {
      deal_name: 'Meridian Group \u2014 Enterprise',
      deal_value: '$42,000',
      days_stale: 18,
      health_score: 34,
      risk_signal:
        "Champion hasn't opened last 3 emails. Last meeting was 22 days ago.",
      suggested_action:
        'Re-engage via LinkedIn. Reference their Q2 expansion plans and offer a custom ROI analysis for their new APAC team.',
      signals: [
        { label: 'Champion disengaged', type: 'warning' },
        { label: 'Competitor evaluated', type: 'warning' },
        { label: 'Budget approved', type: 'positive' },
        { label: 'Technical review passed', type: 'positive' },
        { label: 'No activity 18 days', type: 'warning' },
      ],
    },
  },
  stats: {
    signals_found: 47,
    actions_queued: 12,
    contacts_identified: 8,
    opportunities_mapped: 4,
  },
};

// ============================================================================
// Dynamic Data Generator
// ============================================================================

/** Extract a plausible company name from a domain string. */
function domainToName(domain: string): string {
  const cleaned = domain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\.(com|io|co|ai|dev|org|net|app)(\/.*)?$/, '')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Generate plausible research data from a URL.
 * In production this calls the real backend; here it templates from the domain.
 */
export function generateResearchFromUrl(rawUrl: string): ResearchData {
  const domain = rawUrl
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  if (domain === 'example.com' || domain === 'velocitycrm.io') {
    return EXAMPLE_RESEARCH;
  }

  const name = domainToName(domain);

  return {
    company: {
      name,
      domain,
      vertical: 'Technology',
      product_summary: `${name} provides solutions that help organisations work smarter and achieve better outcomes.`,
      value_props: [
        'Streamlined workflows for growing teams',
        'Real-time analytics and reporting',
        'Seamless integrations with existing tools',
      ],
      icp: {
        title: 'VP / Head of Operations',
        company_size: '50\u2013500 employees',
        industry: 'Technology',
      },
    },
    demo_actions: {
      cold_outreach: {
        target_name: 'Sarah Chen',
        target_title: 'VP Operations',
        target_company: 'NovaTech Solutions',
        personalised_hook: `Noticed NovaTech just closed their Series B \u2014 teams at that stage are exactly who ${name} was built for.`,
        email_preview: `Hi Sarah,\n\nCongrats on the Series B \u2014 exciting times at NovaTech.\n\nWhen teams scale post-funding, the sales process usually breaks first. ${name} helps mid-market teams maintain pipeline velocity through rapid growth.\n\nWe helped a similar-stage company cut their deal cycle by 35% last quarter.\n\nWorth a quick look?\n\nBest,\nAlex`,
      },
      proposal_draft: {
        prospect_name: 'James Wright',
        prospect_company: 'Apex Digital',
        proposal_title: `How ${name} transforms pipeline efficiency for Apex Digital`,
        key_sections: [
          "Current challenges in Apex Digital's sales workflow",
          `Proposed ${name} implementation plan`,
          'ROI projection \u2014 40% efficiency gains in 90 days',
          'Integration timeline & dedicated onboarding support',
        ],
      },
      meeting_prep: {
        attendee_name: 'David Park',
        attendee_company: 'Zenith Corp',
        context:
          'Follow-up from initial demo. David was impressed by the automation features but wants to understand migration from their current tooling.',
        talking_points: [
          'Migration from existing CRM takes < 48 hours',
          'Automation reduced manual work by 60% for similar teams',
          'Native integrations with Slack, Notion, and Google Workspace',
          'Flexible pricing at $79/seat for their 40-person team',
        ],
      },
      pipeline_action: {
        deal_name: 'Meridian Group \u2014 Enterprise',
        deal_value: '$38,000',
        days_stale: 16,
        health_score: 38,
        risk_signal:
          'Champion went silent after proposal. Last email opened 12 days ago.',
        suggested_action:
          'Try a LinkedIn touchpoint referencing their upcoming board meeting. Offer a condensed exec summary instead of the full proposal.',
        signals: [
          { label: 'Champion engaged', type: 'positive' },
          { label: 'NPS declining', type: 'warning' },
          { label: 'Usage up 18%', type: 'positive' },
          { label: 'Competitor mentioned', type: 'warning' },
          { label: 'Budget approved', type: 'positive' },
        ],
      },
    },
    stats: {
      signals_found: 47,
      actions_queued: 12,
      contacts_identified: 8,
      opportunities_mapped: 4,
    },
  };
}
