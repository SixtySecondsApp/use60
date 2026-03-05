/**
 * InternalMeetingTypeBadge
 *
 * IMP-UI-001: Badge for internal meeting types (1:1, Pipeline Review, QBR, Standup).
 * Used on calendar events and the meetings list to make internal meetings visually distinct.
 *
 * External meetings use CallTypeBadge — this component is only for internal types.
 */

import { Users, BarChart2, TrendingUp, Radio, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InternalMeetingType } from '@/lib/hooks/useMeetingPrepBrief';

// ============================================================================
// Config
// ============================================================================

export const INTERNAL_TYPE_CONFIG: Record<
  InternalMeetingType,
  { label: string; Icon: React.ElementType; cls: string }
> = {
  one_on_one: {
    label: '1:1',
    Icon: Users,
    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  pipeline_review: {
    label: 'Pipeline Review',
    Icon: BarChart2,
    cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  qbr: {
    label: 'QBR',
    Icon: TrendingUp,
    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  standup: {
    label: 'Standup',
    Icon: Radio,
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  general: {
    label: 'Internal',
    Icon: Building2,
    cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  },
};

// ============================================================================
// Component
// ============================================================================

interface InternalMeetingTypeBadgeProps {
  meetingType: string | null | undefined;
  isInternal?: boolean;
  className?: string;
  size?: 'sm' | 'default';
}

export function InternalMeetingTypeBadge({
  meetingType,
  isInternal,
  className,
  size = 'default',
}: InternalMeetingTypeBadgeProps) {
  // Only render for explicitly internal meetings or known internal types
  const internalTypes = new Set<string>(['one_on_one', 'pipeline_review', 'qbr', 'standup']);
  const isKnownInternal = meetingType ? internalTypes.has(meetingType) : false;

  if (!isKnownInternal && !isInternal) return null;

  const type = (meetingType as InternalMeetingType) || 'general';
  const config = INTERNAL_TYPE_CONFIG[type] ?? INTERNAL_TYPE_CONFIG.general;
  const { label, Icon, cls } = config;

  return (
    <Badge
      variant="outline"
      className={cn(
        'border flex items-center gap-1',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs',
        cls,
        className,
      )}
    >
      <Icon className={cn('flex-shrink-0', size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
      {label}
    </Badge>
  );
}
