/**
 * EntityBadge Component
 *
 * Displays a related entity (contact, deal, company) with icon and styling.
 */

import { User, DollarSign, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { entityConfig } from './config';
import type { ActionEntity } from './types';

interface EntityBadgeProps {
  entity: ActionEntity;
  onClick?: () => void;
  className?: string;
}

const entityIcons = {
  contact: User,
  deal: DollarSign,
  company: Building2,
};

export function EntityBadge({ entity, onClick, className }: EntityBadgeProps) {
  const config = entityConfig[entity.type];
  const Icon = entityIcons[entity.type];

  const content = (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
        config.bg,
        config.border,
        onClick && 'cursor-pointer hover:bg-opacity-20',
        className
      )}
    >
      <div className={cn('p-1 rounded-md', config.bg)}>
        <Icon className={cn('w-3.5 h-3.5', config.text)} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-200">{entity.name}</span>
        {entity.value && <span className="text-xs text-gray-500">{entity.value}</span>}
        {entity.avatar && !entity.value && (
          <span className="text-xs text-gray-500 capitalize">{entity.type}</span>
        )}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return content;
}

/**
 * Compact entity preview for list items
 */
interface EntityPreviewProps {
  entity: ActionEntity;
  className?: string;
}

export function EntityPreview({ entity, className }: EntityPreviewProps) {
  const Icon = entityIcons[entity.type];

  return (
    <span className={cn('text-xs text-gray-500 flex items-center gap-1', className)}>
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-20">{entity.name}</span>
    </span>
  );
}
