import { User, Building2, Briefcase, AlertTriangle, Ghost } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EntityChipProps {
  entity: {
    id: string;
    type: 'contact' | 'company' | 'deal';
    name: string;
  };
  /** ISO timestamp of when CRM was last synced for this org */
  lastSyncAt?: string;
  /** Whether this entity still exists in the CRM */
  isDeleted?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Size variant */
  size?: 'sm' | 'md';
}

const TYPE_STYLES = {
  contact: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  company: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  deal: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
} as const;

const TYPE_ICONS = {
  contact: User,
  company: Building2,
  deal: Briefcase,
} as const;

/**
 * Returns true if the last sync timestamp is older than the given threshold.
 */
export function isStaleSync(lastSyncAt?: string, thresholdHours = 24): boolean {
  if (!lastSyncAt) return false;
  const syncTime = new Date(lastSyncAt).getTime();
  if (isNaN(syncTime)) return false;
  const now = Date.now();
  const diffMs = now - syncTime;
  return diffMs > thresholdHours * 60 * 60 * 1000;
}

/**
 * Returns a human-readable string like "2 hours ago", "3 days ago".
 */
function getTimeSinceSync(lastSyncAt: string): string {
  const syncTime = new Date(lastSyncAt).getTime();
  if (isNaN(syncTime)) return 'unknown';

  const diffMs = Date.now() - syncTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export default function EntityChip({
  entity,
  lastSyncAt,
  isDeleted = false,
  onClick,
  size = 'sm',
}: EntityChipProps) {
  const stale = !isDeleted && isStaleSync(lastSyncAt);
  const TypeIcon = TYPE_ICONS[entity.type];

  const title = isDeleted
    ? 'This record has been deleted from the CRM'
    : stale && lastSyncAt
      ? `CRM data last synced ${getTimeSinceSync(lastSyncAt)}`
      : undefined;

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        // Base state styles
        isDeleted
          ? 'bg-gray-500/10 text-gray-500 border-gray-500/20'
          : stale
            ? cn(TYPE_STYLES[entity.type], 'border-yellow-500/30')
            : TYPE_STYLES[entity.type],
        // Clickable styles
        onClick && !isDeleted && 'cursor-pointer hover:brightness-125 transition-[filter]',
        onClick && isDeleted && 'cursor-pointer hover:bg-gray-500/20 transition-colors',
      )}
    >
      {/* Type icon — only shown at md size */}
      {size === 'md' && (
        <TypeIcon className={cn(
          'w-3.5 h-3.5 shrink-0',
          isDeleted && 'text-gray-500',
        )} />
      )}

      {/* Entity name */}
      <span className={cn(isDeleted && 'line-through')}>
        {entity.name}
      </span>

      {/* Stale warning icon */}
      {stale && (
        <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
      )}

      {/* Ghost/deleted icon */}
      {isDeleted && (
        <Ghost className="w-3 h-3 text-gray-500 shrink-0" />
      )}
    </span>
  );
}
