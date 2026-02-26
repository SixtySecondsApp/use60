/**
 * ScenarioSelector
 *
 * Grid of scenario cards for multi-agent demo pages.
 * Accepts scenarios as a prop so different pages can use different sets.
 */

import { BarChart3, Mail, Search, Zap, Calendar, Database, Target, Globe, Building2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Scenario } from './types';

// =============================================================================
// Sales Scenarios — SMB sales workflows (longer, high-volume processes)
// =============================================================================

export const SALES_SCENARIOS: Scenario[] = [
  {
    id: 'weekly-pipeline-cleanup',
    title: 'Weekly Pipeline Cleanup',
    description: 'Audit every deal in your pipeline. Check last activity on each, flag the stale ones, update stages, draft nudge emails for stuck deals, and create follow-up tasks — the Friday grind, done in seconds.',
    prompt: 'It\'s Friday. Audit my full pipeline — check last activity on every deal, flag anything stale over 2 weeks, update stages that don\'t match reality, draft check-in emails for stuck deals, and create follow-up tasks for next week.',
    icon: 'Database',
    agents: [
      { name: 'Pipeline', color: 'blue' },
      { name: 'Research', color: 'emerald' },
      { name: 'Outreach', color: 'purple' },
      { name: 'CRM Ops', color: 'orange' },
    ],
  },
  {
    id: 'inbound-lead-rush',
    title: 'Inbound Lead Follow-Up',
    description: '14 new leads from Tuesday\'s webinar sitting in your CRM untouched. Research every company, score ICP fit, enrich the decision-makers, draft personalized follow-up emails, and build a task cadence.',
    prompt: 'I have 14 new leads from our product webinar. Research each company, score them against our ICP, enrich the contacts, draft a personalized follow-up email for each one referencing the webinar, and create a 3-touch task cadence for the top leads.',
    icon: 'Target',
    agents: [
      { name: 'Research', color: 'emerald' },
      { name: 'Prospecting', color: 'rose' },
      { name: 'Outreach', color: 'purple' },
      { name: 'CRM Ops', color: 'orange' },
    ],
  },
  {
    id: 'monthly-sales-review',
    title: 'Monthly Sales Review',
    description: 'Prep for your monthly 1:1 with your manager. Pull close rates, pipeline velocity, meeting activity, deal status on your top accounts, and draft talking points with wins, risks, and asks.',
    prompt: 'My monthly sales review is tomorrow. Pull my close rate and pipeline numbers, get my meeting activity for the month, check status on my top 5 deals, research any changes at those accounts, and draft talking points covering my wins, at-risk deals, and what I need help with.',
    icon: 'BarChart3',
    agents: [
      { name: 'Pipeline', color: 'blue' },
      { name: 'Meetings', color: 'amber' },
      { name: 'Research', color: 'emerald' },
      { name: 'Outreach', color: 'purple' },
    ],
  },
  {
    id: 'cold-outbound-sprint',
    title: 'Cold Outbound Sprint',
    description: 'Build a fresh outbound list from scratch. Find 25 target companies in your niche, enrich the decision-makers, write personalized cold emails referencing their business, and set up a follow-up task sequence.',
    prompt: 'I need to fill my top-of-funnel. Find 25 marketing agencies with 20-100 employees, enrich the founder or VP at each, write a personalized cold email for the top 8 referencing something specific about their business, and create follow-up tasks for all 25.',
    icon: 'Mail',
    agents: [
      { name: 'Prospecting', color: 'rose' },
      { name: 'Research', color: 'emerald' },
      { name: 'Outreach', color: 'purple' },
      { name: 'CRM Ops', color: 'orange' },
    ],
  },
  {
    id: 'stalled-deal-recovery',
    title: 'Stalled Deal Recovery',
    description: '7 deals stuck in negotiation for 3+ weeks. Figure out what\'s blocking each one, check if your contacts are still engaged, draft re-engagement emails, log notes, and create action items.',
    prompt: 'I have 7 deals that haven\'t moved in over 3 weeks. Pull each deal, check last email and meeting activity, research if anything changed at those companies, draft a re-engagement email for each contact, log notes about the status, and create next-step tasks.',
    icon: 'Search',
    agents: [
      { name: 'Pipeline', color: 'blue' },
      { name: 'Research', color: 'emerald' },
      { name: 'Outreach', color: 'purple' },
      { name: 'CRM Ops', color: 'orange' },
    ],
  },
  {
    id: 'end-of-day-wrap',
    title: 'End-of-Day Wrap-Up',
    description: 'Close out your day properly. Log notes from today\'s 5 meetings, update deal stages from what you learned, draft follow-ups for every conversation, create tomorrow\'s task list, and clean up any overdue items.',
    prompt: 'Wrap up my day. Pull my 5 meetings from today, log notes for each one, update the deal stages based on what we discussed, draft follow-up emails for every meeting, create tasks for tomorrow\'s priorities, and clean up anything overdue.',
    icon: 'Calendar',
    agents: [
      { name: 'Meetings', color: 'amber' },
      { name: 'Pipeline', color: 'blue' },
      { name: 'Outreach', color: 'purple' },
      { name: 'CRM Ops', color: 'orange' },
    ],
  },
];

// =============================================================================
// Research Scenarios — Fast, parallel agent execution
// =============================================================================

export const RESEARCH_SCENARIOS: Scenario[] = [
  {
    id: 'company-deep-dive',
    title: 'Company Deep Dive',
    description: 'Full company intelligence report: overview, tech stack, funding history, key people, competitive landscape, and recent news — all in parallel.',
    prompt: 'Research Stripe.com — get me a full company profile: overview, tech stack, recent funding, leadership team, competitors, and any recent news or product launches.',
    icon: 'Building2',
    agents: [
      { name: 'Overview', color: 'blue' },
      { name: 'Tech Stack', color: 'emerald' },
      { name: 'People', color: 'purple' },
      { name: 'News', color: 'amber' },
    ],
  },
  {
    id: 'prospect-list-enrich',
    title: 'Prospect List Enrichment',
    description: 'Take 10 company domains and enrich each with firmographics, decision-maker contacts, tech stack signals, and ICP scoring — single agent does them one by one, multi-agent does all at once.',
    prompt: 'Enrich these 10 companies: notion.so, linear.app, vercel.com, supabase.com, resend.com, cal.com, dub.co, trigger.dev, inngest.com, neon.tech — get employee count, funding, key contacts, and tech stack for each.',
    icon: 'Database',
    agents: [
      { name: 'Firmographics', color: 'blue' },
      { name: 'Contacts', color: 'rose' },
      { name: 'Tech Intel', color: 'emerald' },
      { name: 'Scoring', color: 'orange' },
    ],
  },
  {
    id: 'competitive-intel',
    title: 'Competitive Intelligence',
    description: 'Build a competitive battlecard: product comparison, pricing analysis, market positioning, customer reviews, and win/loss patterns across 4 competitors.',
    prompt: 'Build a competitive battlecard for us vs HubSpot, Salesforce, Pipedrive, and Close. Compare features, pricing, positioning, G2 reviews, and common win/loss reasons.',
    icon: 'Target',
    agents: [
      { name: 'Features', color: 'blue' },
      { name: 'Pricing', color: 'emerald' },
      { name: 'Reviews', color: 'amber' },
      { name: 'Positioning', color: 'purple' },
    ],
  },
  {
    id: 'account-mapping',
    title: 'Account Mapping',
    description: 'Map an entire target account: org chart, decision-makers, budget holders, champions, and recent hiring signals to find the best path in.',
    prompt: 'Map the buying committee at Datadog — find the VP Sales, Head of RevOps, CRO, and any recent hires. Get LinkedIn profiles, reporting lines, and any mutual connections.',
    icon: 'Users',
    agents: [
      { name: 'Org Chart', color: 'blue' },
      { name: 'LinkedIn', color: 'purple' },
      { name: 'Hiring', color: 'rose' },
      { name: 'Signals', color: 'emerald' },
    ],
  },
  {
    id: 'market-scan',
    title: 'Market Landscape Scan',
    description: 'Scan an entire market segment: identify 20 companies, categorize by stage, pull funding data, and surface the fastest-growing targets.',
    prompt: 'Scan the AI sales tools market — find 20 companies, categorize by stage (seed to series C+), pull their latest funding rounds, employee growth, and rank by growth rate.',
    icon: 'Globe',
    agents: [
      { name: 'Discovery', color: 'blue' },
      { name: 'Funding', color: 'emerald' },
      { name: 'Growth', color: 'amber' },
      { name: 'Ranking', color: 'orange' },
    ],
  },
  {
    id: 'pre-call-research',
    title: 'Pre-Call Research',
    description: 'Prep for a sales call in seconds: company overview, contact background, mutual connections, recent activity, talking points, and potential objections.',
    prompt: 'I have a call with Sarah Chen, VP Marketing at Notion, in 30 minutes. Get me everything: her background, Notion\'s recent news, their current stack, what they care about, and 3 talking points.',
    icon: 'Search',
    agents: [
      { name: 'Company', color: 'blue' },
      { name: 'Contact', color: 'purple' },
      { name: 'Signals', color: 'emerald' },
      { name: 'Prep', color: 'amber' },
    ],
  },
];

/** @deprecated Use SALES_SCENARIOS or RESEARCH_SCENARIOS directly */
export const SCENARIOS = SALES_SCENARIOS;

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Building2,
  Calendar,
  Database,
  Globe,
  Mail,
  Search,
  Target,
  Users,
  Zap,
};

const BADGE_COLORS: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

// =============================================================================
// Component
// =============================================================================

interface ScenarioSelectorProps {
  scenarios?: Scenario[];
  selectedId: string | null;
  onSelect: (scenario: Scenario) => void;
  disabled?: boolean;
}

export function ScenarioSelector({ scenarios = SALES_SCENARIOS, selectedId, onSelect, disabled }: ScenarioSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scenarios.map((scenario) => {
        const Icon = ICON_MAP[scenario.icon] || Zap;
        const isSelected = selectedId === scenario.id;

        return (
          <button
            key={scenario.id}
            onClick={() => onSelect(scenario)}
            disabled={disabled}
            className={cn(
              'text-left rounded-lg border p-4 transition-all',
              isSelected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex-shrink-0 rounded-md p-2',
                isSelected ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{scenario.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {scenario.description}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {scenario.agents.map((agent) => (
                    <Badge
                      key={agent.name}
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0', BADGE_COLORS[agent.color])}
                    >
                      {agent.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
