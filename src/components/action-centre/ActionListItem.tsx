/**
 * ActionListItem Component
 *
 * List item for the Action Centre left panel with gradient icons,
 * priority indicators, and entity previews.
 */

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { typeConfig, riskConfig } from './config';
import { formatTimeAgo } from './utils';
import { EntityPreview } from './EntityBadge';
import type { DisplayAction } from './types';

interface ActionListItemProps {
  action: DisplayAction;
  isSelected: boolean;
  onClick: () => void;
}

export function ActionListItem({ action, isSelected, onClick }: ActionListItemProps) {
  const config = typeConfig[action.action_type];
  const risk = riskConfig[action.risk_level];
  const Icon = config.icon;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.995 }}
      role="option"
      aria-selected={isSelected}
      aria-label={`${config.label}: ${action.title}`}
      className={cn(
        'w-full text-left p-4 rounded-xl transition-all duration-200 group relative',
        isSelected
          ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/30'
          : 'bg-gray-900/40 hover:bg-gray-800/60 border border-gray-800/50 hover:border-gray-700/50'
      )}
    >
      {/* Priority indicator */}
      {action.priority === 'urgent' && (
        <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full m-2 animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        {/* Glassmorphic icon - dark background with colored icon */}
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            config.iconBg
          )}
        >
          <Icon className={cn('w-5 h-5', config.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', risk.bg, risk.text)}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500">{formatTimeAgo(action.created_at)}</span>
          </div>

          {/* Title */}
          <h3
            className={cn(
              'font-medium text-sm leading-snug mb-1 line-clamp-2',
              isSelected ? 'text-white' : 'text-gray-200 group-hover:text-white'
            )}
          >
            {action.title}
          </h3>

          {/* Entities preview */}
          {action.entities && action.entities.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {action.entities.slice(0, 2).map((entity) => (
                <EntityPreview key={`${entity.type}-${entity.id || entity.name}`} entity={entity} />
              ))}
              {action.entities.length > 2 && (
                <span className="text-xs text-gray-600">+{action.entities.length - 2}</span>
              )}
            </div>
          )}
        </div>

        {/* Selection indicator */}
        <ChevronRight
          className={cn(
            'w-4 h-4 flex-shrink-0 transition-all duration-200',
            isSelected ? 'text-emerald-400 opacity-100' : 'text-gray-600 opacity-0 group-hover:opacity-100'
          )}
        />
      </div>
    </motion.button>
  );
}
