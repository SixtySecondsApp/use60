/**
 * DealIntelligenceResponse Component (PIPE-030)
 *
 * Unified structured response for deal intelligence queries.
 * Replaces separate DealHealthResponse and PipelineResponse components.
 *
 * Shows:
 * - Deal health score + relationship health
 * - Risk signals (deal and relationship)
 * - Suggested actions
 * - Quick action buttons
 */

import React from 'react';
import { Heart, Shield, Ghost, AlertTriangle, Mail, Calendar, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CopilotResponse, QuickActionResponse } from '../types';

// =============================================================================
// Type Definitions
// =============================================================================

export interface DealIntelligenceData {
  deals: DealIntelligenceDeal[];
  summary: string;
  suggestedActions?: string[];
}

export interface DealIntelligenceDeal {
  id: string;
  name: string;
  company: string | null;
  value: number | null;
  stage_name: string | null;
  stage_color: string | null;

  // Health scores
  health_score: number | null;
  health_status: 'healthy' | 'warning' | 'critical' | 'stalled' | null;
  relationship_health_score: number | null;
  relationship_health_status: 'healthy' | 'at_risk' | 'critical' | 'ghost' | null;
  ghost_probability: number | null;

  // Risk factors
  risk_factors: string[];
  relationship_risk_factors: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;

  // Context
  days_in_current_stage: number | null;
  pending_actions_count: number;
  high_urgency_actions_count: number;
}

interface DealIntelligenceResponseProps {
  data: CopilotResponse & { data: DealIntelligenceData };
  onActionClick?: (action: QuickActionResponse) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getHealthBadgeClasses(status: string | null): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    case 'warning':
    case 'at_risk':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    case 'stalled':
    case 'ghost':
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

function getRiskBadgeClasses(level: string | null): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'low':
      return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

// =============================================================================
// Deal Card Component
// =============================================================================

interface DealCardProps {
  deal: DealIntelligenceDeal;
  onActionClick?: (action: QuickActionResponse) => void;
}

function DealCard({ deal, onActionClick }: DealCardProps) {
  const allRiskFactors = [
    ...deal.risk_factors.map((f) => ({ text: f, type: 'deal' as const })),
    ...deal.relationship_risk_factors.map((f) => ({ text: f, type: 'relationship' as const })),
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{deal.company || 'Unknown Company'}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{deal.name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(deal.value)}</div>
          {deal.stage_name && (
            <Badge className="mt-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
              {deal.stage_name}
            </Badge>
          )}
        </div>
      </div>

      {/* Health Scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Deal Health */}
        <div className={`flex items-center justify-between p-3 rounded-lg border ${getHealthBadgeClasses(deal.health_status)}`}>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            <div>
              <div className="text-xs font-medium opacity-75">Deal Health</div>
              <div className="text-sm font-semibold">{deal.health_status || 'Unknown'}</div>
            </div>
          </div>
          <div className="text-2xl font-bold">{deal.health_score || '--'}</div>
        </div>

        {/* Relationship Health */}
        <div className={`flex items-center justify-between p-3 rounded-lg border ${getHealthBadgeClasses(deal.relationship_health_status)}`}>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <div>
              <div className="text-xs font-medium opacity-75">Relationship</div>
              <div className="text-sm font-semibold">{deal.relationship_health_status || 'Unknown'}</div>
            </div>
          </div>
          <div className="text-2xl font-bold">{deal.relationship_health_score || '--'}</div>
        </div>
      </div>

      {/* Ghost Risk (if present) */}
      {deal.ghost_probability !== null && deal.ghost_probability > 0 && (
        <div
          className={`flex items-center justify-between p-3 rounded-lg border ${getHealthBadgeClasses(
            deal.ghost_probability > 50 ? 'critical' : 'warning'
          )}`}
        >
          <div className="flex items-center gap-2">
            <Ghost className="w-4 h-4" />
            <div>
              <div className="text-xs font-medium opacity-75">Ghost Risk</div>
              <div className="text-sm font-semibold">
                {deal.ghost_probability > 70 ? 'High' : deal.ghost_probability > 40 ? 'Medium' : 'Low'}
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold">{deal.ghost_probability}%</div>
        </div>
      )}

      {/* Risk Factors */}
      {allRiskFactors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Risk Signals</h4>
          {allRiskFactors.map((factor, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 p-2 rounded text-xs ${getRiskBadgeClasses(deal.risk_level)}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">{factor.text}</div>
                <div className="opacity-75 mt-0.5">{factor.type === 'deal' ? 'Deal Risk' : 'Relationship Risk'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Context Info */}
      <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
        {deal.days_in_current_stage !== null && (
          <span>
            <strong>{deal.days_in_current_stage}</strong> days in stage
          </span>
        )}
        {deal.pending_actions_count > 0 && (
          <span>
            <strong>{deal.pending_actions_count}</strong> pending action{deal.pending_actions_count !== 1 ? 's' : ''}
            {deal.high_urgency_actions_count > 0 && <span className="text-red-600 dark:text-red-400"> ({deal.high_urgency_actions_count} urgent)</span>}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() =>
            onActionClick?.({
              id: `open-deal-${deal.id}`,
              label: 'Open Deal',
              type: 'primary',
              callback: 'open_deal',
              params: { dealId: deal.id },
            })
          }
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open Deal
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onActionClick?.({
              id: `draft-email-${deal.id}`,
              label: 'Draft Email',
              type: 'secondary',
              callback: 'draft_email',
              params: { dealId: deal.id },
            })
          }
        >
          <Mail className="w-4 h-4 mr-2" />
          Draft Email
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onActionClick?.({
              id: `schedule-meeting-${deal.id}`,
              label: 'Schedule Meeting',
              type: 'secondary',
              callback: 'schedule_meeting',
              params: { dealId: deal.id },
            })
          }
        >
          <Calendar className="w-4 h-4 mr-2" />
          Schedule
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function DealIntelligenceResponse({ data, onActionClick }: DealIntelligenceResponseProps) {
  const responseData = data.data;

  if (responseData.deals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p className="text-sm">No deals found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {responseData.summary && <p className="text-sm text-gray-700 dark:text-gray-300">{responseData.summary}</p>}

      {/* Deal Cards */}
      <div className="space-y-4">
        {responseData.deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onActionClick={onActionClick} />
        ))}
      </div>

      {/* Suggested Actions */}
      {responseData.suggestedActions && responseData.suggestedActions.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Suggested Actions</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            {responseData.suggestedActions.map((action, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions from response */}
      {data.actions && data.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {data.actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.type === 'primary' ? 'default' : 'outline'}
              onClick={() => onActionClick?.(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
