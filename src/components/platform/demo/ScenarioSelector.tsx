/**
 * ScenarioSelector
 *
 * Grid of scenario cards for the multi-agent demo page.
 * Each card shows an icon, title, description, and expected agent badges.
 */

import { BarChart3, Mail, Search, Zap, Calendar, Database, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Scenario } from './types';

// =============================================================================
// Scenarios — SMB sales workflows (longer, high-volume processes)
// =============================================================================

export const SCENARIOS: Scenario[] = [
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

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Mail,
  Search,
  Zap,
  Calendar,
  Database,
  Target,
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
  selectedId: string | null;
  onSelect: (scenario: Scenario) => void;
  disabled?: boolean;
}

export function ScenarioSelector({ selectedId, onSelect, disabled }: ScenarioSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {SCENARIOS.map((scenario) => {
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
