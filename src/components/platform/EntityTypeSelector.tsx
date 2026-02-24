/**
 * EntityTypeSelector
 *
 * Tab-style selector for choosing entity type in skill testing.
 * Supports: Contact, Deal, Email, Activity
 */

import { User, Briefcase, Mail, Calendar, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type EntityType, ENTITY_TYPE_CONFIG } from '@/lib/utils/entityTestTypes';

interface EntityTypeSelectorProps {
  type: EntityType;
  onChange: (type: EntityType) => void;
  disabled?: boolean;
}

const ICON_MAP: Record<EntityType, React.ElementType> = {
  contact: User,
  deal: Briefcase,
  email: Mail,
  activity: Calendar,
  meeting: Video,
};

const ENTITY_ORDER: EntityType[] = ['contact', 'deal', 'email', 'activity', 'meeting'];

export function EntityTypeSelector({
  type,
  onChange,
  disabled = false,
}: EntityTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Entity Type
      </label>
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
        {ENTITY_ORDER.map((entityType) => {
          const config = ENTITY_TYPE_CONFIG[entityType];
          const Icon = ICON_MAP[entityType];
          const isActive = type === entityType;

          return (
            <button
              key={entityType}
              type="button"
              onClick={() => onChange(entityType)}
              disabled={disabled}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all',
                'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700/50'
              )}
              title={config.description}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
