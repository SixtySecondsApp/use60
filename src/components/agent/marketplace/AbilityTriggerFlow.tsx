/**
 * AbilityTriggerFlow Component (US-018)
 *
 * Mini vertical timeline/flow diagram showing how an ability works.
 * Three sections: Trigger -> Processing -> Delivery
 * Uses data from abilityRegistry.ts (triggerType, stepCount, eventType, defaultChannels).
 */

import { cn } from '@/lib/utils';
import {
  Clock, Zap, Link2, Cpu, MessageSquare, Mail, Bell, Play,
  ArrowDown,
} from 'lucide-react';
import type { AbilityDefinition, DeliveryChannel } from '@/lib/agent/abilityRegistry';

// =============================================================================
// Types
// =============================================================================

interface AbilityTriggerFlowProps {
  ability: AbilityDefinition;
}

// =============================================================================
// Helpers
// =============================================================================

/** Human-readable trigger description based on trigger type and event type */
function getTriggerLabel(triggerType: string, eventType: string): string {
  switch (triggerType) {
    case 'cron':
      return getCronDescription(eventType);
    case 'event':
      return getEventDescription(eventType);
    case 'chain':
      return getChainDescription(eventType);
    case 'manual':
      return 'When you click run';
    default:
      return 'Custom trigger';
  }
}

function getCronDescription(eventType: string): string {
  switch (eventType) {
    case 'pre_meeting_90min':
      return '90 minutes before each meeting';
    case 'morning_brief':
      return 'Every morning at 9am';
    case 'pre_meeting_nudge':
      return '30 minutes before your next call';
    case 'sales_assistant_digest':
      return 'Every morning at 8:30am';
    case 'deal_risk_scan':
      return 'Daily pipeline scan at 8am';
    case 'stale_deal_revival':
      return 'Weekly on Mondays at 9am';
    case 'stale_deal_alert':
      return 'Daily at 9am for inactive deals';
    case 'overdue_deal_scan':
      return 'Daily scan for overdue deals';
    case 'ghost_deal_scan':
      return 'Daily scan for ghosted deals';
    case 'campaign_daily_check':
      return 'Daily at 10am for campaign metrics';
    case 'coaching_weekly':
      return 'Weekly on Fridays at 5pm';
    case 'ai_smart_suggestion':
      return 'Periodically throughout the day';
    default:
      return 'On a scheduled basis';
  }
}

function getEventDescription(eventType: string): string {
  switch (eventType) {
    case 'meeting_ended':
      return 'When a meeting recording completes';
    case 'email_received':
      return 'When an inbound email is received';
    case 'post_call_summary':
      return 'After your most recent call ends';
    case 'hitl_followup_email':
      return 'When a follow-up email is needed';
    case 'email_reply_alert':
      return 'When a high-priority reply arrives';
    default:
      return 'When a specific event occurs';
  }
}

function getChainDescription(eventType: string): string {
  switch (eventType) {
    case 'calendar_find_times':
      return 'Triggered by a scheduling request';
    case 'proposal_generation':
      return 'Triggered after deal context is ready';
    default:
      return 'Triggered by another ability';
  }
}

function getTriggerIcon(triggerType: string) {
  switch (triggerType) {
    case 'cron':
      return Clock;
    case 'event':
      return Zap;
    case 'chain':
      return Link2;
    case 'manual':
      return Play;
    default:
      return Zap;
  }
}

function getTriggerColor(triggerType: string): string {
  switch (triggerType) {
    case 'cron':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'event':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'chain':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    case 'manual':
      return 'text-green-400 bg-green-500/10 border-green-500/20';
    default:
      return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
  }
}

const CHANNEL_CONFIG: Record<DeliveryChannel, { icon: typeof MessageSquare; label: string; color: string }> = {
  slack: { icon: MessageSquare, label: 'Slack DM', color: 'text-purple-400' },
  email: { icon: Mail, label: 'Email', color: 'text-blue-400' },
  'in-app': { icon: Bell, label: 'In-App', color: 'text-green-400' },
};

// =============================================================================
// Sub-components
// =============================================================================

function FlowConnector() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="w-3.5 h-3.5 text-gray-600" />
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AbilityTriggerFlow({ ability }: AbilityTriggerFlowProps) {
  const TriggerIcon = getTriggerIcon(ability.triggerType);
  const triggerLabel = getTriggerLabel(ability.triggerType, ability.eventType);
  const triggerColor = getTriggerColor(ability.triggerType);

  return (
    <div className="space-y-1">
      {/* Trigger Section */}
      <div className={cn('rounded-lg border p-3', triggerColor)}>
        <div className="flex items-center gap-2 mb-1">
          <TriggerIcon className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide">Trigger</span>
        </div>
        <p className="text-sm text-gray-300 pl-6">{triggerLabel}</p>
      </div>

      <FlowConnector />

      {/* Processing Section */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Processing</span>
        </div>
        <p className="text-sm text-gray-300 pl-6">
          {ability.stepCount} step{ability.stepCount !== 1 ? 's' : ''} in sequence
          {ability.hasApproval && (
            <span className="ml-2 text-xs text-amber-400 font-medium">
              (requires approval)
            </span>
          )}
        </p>
      </div>

      <FlowConnector />

      {/* Delivery Section */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Delivery</span>
        </div>
        <div className="flex flex-wrap gap-2 pl-6">
          {ability.defaultChannels.map((channel) => {
            const config = CHANNEL_CONFIG[channel];
            if (!config) return null;
            const ChannelIcon = config.icon;
            return (
              <div
                key={channel}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs"
              >
                <ChannelIcon className={cn('w-3 h-3', config.color)} />
                <span className="text-gray-300">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
