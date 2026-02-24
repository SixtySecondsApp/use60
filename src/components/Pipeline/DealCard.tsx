/**
 * DealCard Component (PIPE-008)
 *
 * Premium glass-morphism pipeline card with health indicators
 * and company logos. Pure presentational — DnD is handled by
 * @hello-pangea/dnd Draggable wrapper in PipelineColumn.
 */

import React, { useState } from 'react';
import { CircleDot, Users, Clock, TrendingUp, TrendingDown, Minus, AlertTriangle, ListTodo, Calendar } from 'lucide-react';
import type { PipelineDeal } from './hooks/usePipelineData';
import { DealTemperatureGauge } from '@/components/signals/DealTemperatureGauge';

export interface DealTemperatureData {
  temperature: number; // 0.0–1.0 (multiply ×100 for display)
  trend: 'rising' | 'falling' | 'stable';
}

interface DealCardProps {
  deal: PipelineDeal;
  logoUrl?: string;
  onClick?: (dealId: string) => void;
  isDragging?: boolean;
  isDragOverlay?: boolean;
  index?: number;
  onConvertToSubscription?: (deal: any) => void;
  nextActionsPendingCount?: number;
  highUrgencyCount?: number;
  healthScore?: any;
  sentimentData?: any;
  wasDragRecent?: () => boolean;
  /** Optional pre-fetched temperature data — only rendered if present */
  temperatureData?: DealTemperatureData | null;
}

/**
 * Format currency value (e.g., $50K, $1.2M)
 */
function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '$0';

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Get initials from company name
 */
function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

/**
 * Get a deterministic gradient for company avatar based on name
 */
function getAvatarGradient(name: string | null): string {
  const gradients = [
    'from-violet-600 to-violet-400',
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-amber-600 to-amber-400',
    'from-pink-600 to-pink-400',
    'from-cyan-600 to-cyan-400',
    'from-red-600 to-red-400',
    'from-indigo-600 to-indigo-400',
  ];

  if (!name) return gradients[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

/**
 * Get health bar width and color classes
 */
function getHealthBarStyles(status: string | null): { width: string; colorClass: string } {
  switch (status) {
    case 'healthy':
      return { width: '100%', colorClass: 'bg-gradient-to-r from-emerald-500 to-emerald-400/40' };
    case 'warning':
      return { width: '60%', colorClass: 'bg-gradient-to-r from-amber-500 to-amber-400/40' };
    case 'critical':
      return { width: '30%', colorClass: 'bg-gradient-to-r from-red-500 to-red-400/40' };
    case 'stalled':
      return { width: '15%', colorClass: 'bg-gray-400/25' };
    default:
      return { width: '15%', colorClass: 'bg-gray-400/25' };
  }
}

/**
 * Get days-in-stage urgency
 */
function getDaysUrgency(days: number | null): string {
  if (!days) return 'text-gray-500 dark:text-gray-400';
  if (days > 14) return 'text-red-500 dark:text-red-400';
  if (days > 7) return 'text-amber-500 dark:text-amber-400';
  return 'text-gray-500 dark:text-gray-400';
}

/**
 * Get owner initials from split_users or fallback
 */
function getOwnerInitials(deal: PipelineDeal): string {
  if (deal.split_users && deal.split_users.length > 0) {
    const name = deal.split_users[0].full_name;
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return parts[0][0].toUpperCase();
    }
  }
  return '?';
}

export const DealCard = React.memo<DealCardProps>(({
  deal,
  logoUrl,
  onClick,
  isDragging = false,
  temperatureData,
}) => {
  const [logoError, setLogoError] = useState(false);
  const healthBar = getHealthBarStyles(deal.health_status);
  const avatarGradient = getAvatarGradient(deal.company);
  const showLogo = logoUrl && !logoError;
  const daysUrgency = getDaysUrgency(deal.days_in_current_stage);

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl cursor-pointer
        bg-white dark:bg-white/[0.03]
        backdrop-blur-xl
        border border-gray-200/80 dark:border-white/[0.06]
        hover:bg-gray-50 dark:hover:bg-white/[0.05]
        hover:border-gray-300 dark:hover:border-white/[0.1]
        hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-[0_8px_25px_rgba(0,0,0,0.25)]
        transition-all duration-200
        ${isDragging ? 'opacity-50' : ''}
      `}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

      {/* Header: Avatar + Company + Value */}
      <div className="relative z-[1] p-3 pb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Company avatar/logo */}
          {showLogo ? (
            <img
              src={logoUrl}
              alt={deal.company || 'Company'}
              className="w-[34px] h-[34px] rounded-lg flex-shrink-0 object-cover shadow-sm"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className={`
              w-[34px] h-[34px] rounded-lg flex items-center justify-center
              text-[13px] font-bold text-white flex-shrink-0
              bg-gradient-to-br ${avatarGradient}
              shadow-[0_2px_8px_rgba(0,0,0,0.2)]
            `}>
              {getInitials(deal.company)}
            </div>
          )}

          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
              {deal.company || 'Unknown Company'}
            </div>
            <div className="text-[11.5px] text-gray-500 dark:text-gray-500 truncate mt-0.5">
              {deal.name}
            </div>
          </div>
        </div>

        <span className="text-[13.5px] font-bold text-gray-900 dark:text-gray-100 flex-shrink-0 tracking-tight">
          {formatCurrency(deal.value)}
        </span>
      </div>

      {/* Health progress bar */}
      <div className="relative z-[1] mx-3 mb-2">
        <div className="w-full h-[2.5px] bg-gray-100 dark:bg-white/[0.03] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${healthBar.colorClass}`}
            style={{ width: healthBar.width }}
          />
        </div>
      </div>

      {/* Tags */}
      {(deal.risk_factors?.length || deal.pending_actions_count > 0 || deal.health_status || temperatureData) && (
        <div className="relative z-[1] px-3 pb-2 flex flex-wrap gap-1">
          {deal.risk_factors && deal.risk_factors.length > 0 && (
            <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/10">
              At Risk
            </span>
          )}
          {deal.value && deal.value >= 50000 && (
            <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10">
              High Value
            </span>
          )}
          {deal.pending_actions_count > 0 && (
            <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10">
              {deal.pending_actions_count} Action{deal.pending_actions_count !== 1 ? 's' : ''}
            </span>
          )}
          {/* Deal temperature gauge — only shown when data is available */}
          {temperatureData && (
            <DealTemperatureGauge
              temperature={Math.round(temperatureData.temperature * 100)}
              trend={temperatureData.trend}
              size="sm"
            />
          )}
        </div>
      )}

      {/* Footer: Metadata + Owner */}
      <div className="relative z-[1] px-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Days in stage */}
          <div className={`flex items-center gap-1 text-[11px] ${daysUrgency}`}>
            <Clock className="w-3 h-3 opacity-60" />
            <span className="font-medium">{deal.days_in_current_stage || 0}d</span>
          </div>

          {/* Contacts/stakeholders */}
          <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <Users className="w-3 h-3 opacity-50" />
            <span>{deal.split_users?.length || 0}</span>
          </div>
        </div>

        {/* Owner avatar */}
        <div className="w-[22px] h-[22px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[9px] font-bold text-white">
          {getOwnerInitials(deal)}
        </div>
      </div>
    </div>
  );
});

DealCard.displayName = 'DealCard';
