/**
 * WhatCanSixtyDoCard
 *
 * Summary card listing current autonomous capabilities,
 * grouped by category: emails, tasks, CRM updates.
 * Shown on the dashboard — especially useful for new users.
 *
 * Story: AUT-006
 */

import {
  Zap,
  CheckCircle2,
  Edit3,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { AutonomyDashboardRow } from '@/lib/services/autonomyService';

// ============================================================================
// Types
// ============================================================================

interface Capability {
  label: string;
  tier: 'auto' | 'approve' | 'suggest' | 'disabled';
}

interface CapabilityGroup {
  label: string;
  icon: React.ElementType;
  capabilities: Capability[];
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_LABELS: Record<string, string> = {
  'crm.note_add': 'Add meeting notes to CRM',
  'crm.activity_log': 'Log calls and activities',
  'crm.contact_enrich': 'Enrich contact profiles',
  'crm.next_steps_update': 'Update deal next steps',
  'crm.deal_field_update': 'Update deal fields',
  'crm.deal_stage_change': 'Move deals between stages',
  'crm.deal_amount_change': 'Update deal amounts',
  'crm.deal_close_date_change': 'Update close dates',
  'email.draft_save': 'Draft follow-up emails',
  'email.send': 'Send emails automatically',
  'email.follow_up_send': 'Send follow-up emails',
  'email.check_in_send': 'Send check-in emails',
  'task.create': 'Create follow-up tasks',
  'task.assign': 'Assign tasks to team members',
  'calendar.create_event': 'Schedule meetings',
  'calendar.reschedule': 'Reschedule meetings',
  'analysis.risk_assessment': 'Flag at-risk deals',
  'analysis.coaching_feedback': 'Generate coaching feedback',
  // Legacy
  crm_field_update: 'Update CRM fields',
  crm_stage_change: 'Move deals between stages',
  crm_note_add: 'Add CRM notes',
  email_draft: 'Draft emails',
  email_send: 'Send emails',
  task_create: 'Create tasks',
  meeting_prep: 'Prepare meeting briefs',
  slack_post: 'Post to Slack',
};

const CATEGORY_MAP: Record<string, string> = {
  'crm.note_add': 'crm',
  'crm.activity_log': 'crm',
  'crm.contact_enrich': 'crm',
  'crm.next_steps_update': 'crm',
  'crm.deal_field_update': 'crm',
  'crm.deal_stage_change': 'crm',
  'crm.deal_amount_change': 'crm',
  'crm.deal_close_date_change': 'crm',
  'email.draft_save': 'email',
  'email.send': 'email',
  'email.follow_up_send': 'email',
  'email.check_in_send': 'email',
  'task.create': 'tasks',
  'task.assign': 'tasks',
  'calendar.create_event': 'tasks',
  'calendar.reschedule': 'tasks',
  'analysis.risk_assessment': 'analysis',
  'analysis.coaching_feedback': 'analysis',
  crm_field_update: 'crm',
  crm_stage_change: 'crm',
  crm_note_add: 'crm',
  email_draft: 'email',
  email_send: 'email',
  task_create: 'tasks',
  meeting_prep: 'analysis',
  slack_post: 'tasks',
};

const CATEGORY_CONFIG: Array<{
  key: string;
  label: string;
  icon: React.ElementType;
}> = [
  { key: 'crm', label: 'CRM Updates', icon: Edit3 },
  { key: 'email', label: 'Emails', icon: Zap },
  { key: 'tasks', label: 'Tasks & Calendar', icon: CheckCircle2 },
  { key: 'analysis', label: 'Analysis', icon: BarChart3 },
];

const TIER_LABEL: Record<string, string> = {
  auto: 'Auto',
  approve: 'With approval',
  suggest: 'Suggests only',
  disabled: 'Disabled',
};

const TIER_CLS: Record<string, string> = {
  auto: 'text-emerald-400',
  approve: 'text-amber-400',
  suggest: 'text-blue-400',
  disabled: 'text-gray-600',
};

// ============================================================================
// Helpers
// ============================================================================

function buildGroups(rows: AutonomyDashboardRow[]): CapabilityGroup[] {
  const byCategory: Record<string, Capability[]> = {};

  for (const row of rows) {
    if (row.current_tier === 'disabled') continue;
    const cat = CATEGORY_MAP[row.action_type] ?? 'crm';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      label: ACTION_LABELS[row.action_type] ?? row.action_type.replace(/[._]/g, ' '),
      tier: row.current_tier,
    });
  }

  return CATEGORY_CONFIG.flatMap((cfg) => {
    const capabilities = byCategory[cfg.key] ?? [];
    if (capabilities.length === 0) return [];
    return [{ label: cfg.label, icon: cfg.icon, capabilities }];
  });
}

// ============================================================================
// Component
// ============================================================================

interface WhatCanSixtyDoCardProps {
  rows: AutonomyDashboardRow[];
}

export function WhatCanSixtyDoCard({ rows }: WhatCanSixtyDoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const groups = buildGroups(rows);

  const autoCount = rows.filter((r) => r.current_tier === 'auto').length;
  const activeCount = rows.filter((r) => r.current_tier !== 'disabled').length;

  return (
    <Card className="border border-gray-800 bg-gray-900/60">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-100">
              What can 60 do for you?
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {autoCount} on auto &bull; {activeCount} active
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            No active capabilities yet. Start approving agent proposals to
            build your autonomy profile.
          </p>
        ) : (
          <div className="space-y-4">
            {(expanded ? groups : groups.slice(0, 2)).map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <GroupIcon className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.capabilities.map((cap) => (
                      <div
                        key={cap.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-gray-300">
                          {cap.label}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            TIER_CLS[cap.tier] ?? 'text-gray-500'
                          )}
                        >
                          {TIER_LABEL[cap.tier] ?? cap.tier}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {groups.length > 2 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className={cn(
                  'w-full flex items-center justify-center',
                  'rounded-md px-3 py-1.5 text-xs font-medium',
                  'bg-gray-800/60 hover:bg-gray-800 transition-colors',
                  'text-gray-400 hover:text-gray-300'
                )}
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="h-3.5 w-3.5 ml-1" />
                  </>
                ) : (
                  <>
                    Show {groups.length - 2} more{' '}
                    {groups.length - 2 === 1 ? 'category' : 'categories'}{' '}
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WhatCanSixtyDoCard;
