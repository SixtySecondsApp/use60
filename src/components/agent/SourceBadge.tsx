/**
 * SourceBadge
 *
 * Shows the provenance layer of a config key: default / org / user.
 */

import { cn } from '@/lib/utils';
import type { ConfigSource } from '@/lib/services/agentConfigService';

interface SourceBadgeProps {
  source: ConfigSource;
  className?: string;
}

const LABELS: Record<ConfigSource, string> = {
  default: 'Default',
  org: 'Org',
  user: 'User',
};

const STYLES: Record<ConfigSource, string> = {
  default: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  org: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  user: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
};

export function SourceBadge({ source, className }: SourceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        STYLES[source],
        className
      )}
    >
      {LABELS[source]}
    </span>
  );
}
