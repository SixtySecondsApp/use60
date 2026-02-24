/**
 * Goal Tracking Response Component
 * Displays goal progress with progress bars, status indicators, and projections
 */

import React from 'react';
import { Target, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle, Clock, Award } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { GoalTrackingResponse as GoalTrackingResponseType } from '../types';

interface GoalTrackingResponseProps {
  data: GoalTrackingResponseType;
  onActionClick?: (action: any) => void;
}

const formatValue = (value: number, unit: string, format: 'currency' | 'count' | 'percentage'): string => {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }
  if (format === 'percentage') {
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'on_track':
      return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    case 'at_risk':
      return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    case 'behind':
      return 'text-red-400 border-red-500/30 bg-red-500/10';
    case 'exceeded':
      return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    default:
      return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'on_track':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'at_risk':
      return <AlertTriangle className="w-4 h-4" />;
    case 'behind':
      return <AlertTriangle className="w-4 h-4" />;
    case 'exceeded':
      return <Award className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'increasing':
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    case 'decreasing':
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-gray-400" />;
  }
};

export const GoalTrackingResponse: React.FC<GoalTrackingResponseProps> = ({ data, onActionClick }) => {
  const { goals, overallProgress, period, metrics } = data.data;

  return (
    <div className="space-y-6">
      {/* Overall Progress Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Goal Progress - {period.label}</h3>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-100">{overallProgress.toFixed(0)}%</div>
            <div className="text-sm text-gray-400">Overall Progress</div>
          </div>
        </div>
        
        {/* Overall Progress Bar */}
        <div className="w-full bg-gray-800/50 rounded-full h-3 mb-4">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(overallProgress, 100)}%` }}
          />
        </div>

        {/* Metrics Summary */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{metrics.goalsOnTrack}</div>
            <div className="text-xs text-gray-400">On Track</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{metrics.goalsAtRisk}</div>
            <div className="text-xs text-gray-400">At Risk</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{metrics.goalsBehind}</div>
            <div className="text-xs text-gray-400">Behind</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-300">{metrics.totalGoals}</div>
            <div className="text-xs text-gray-400">Total Goals</div>
          </div>
        </div>
      </div>

      {/* Individual Goals */}
      <div className="space-y-4">
        {goals.map((goal) => {
          const progressPercentage = Math.min(goal.progress, 100);
          const format = goal.unit === 'currency' ? 'currency' : goal.unit === 'percentage' ? 'percentage' : 'count';
          
          return (
            <div
              key={goal.id}
              className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-base font-semibold text-gray-100">{goal.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border flex items-center gap-1 ${getStatusColor(goal.status)}`}>
                      {getStatusIcon(goal.status)}
                      {goal.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>
                      Current: <span className="text-gray-200 font-medium">{formatValue(goal.current, goal.unit, format)}</span>
                    </span>
                    <span>
                      Target: <span className="text-gray-200 font-medium">{formatValue(goal.target, goal.unit, format)}</span>
                    </span>
                    <span>
                      Remaining: <span className="text-gray-200 font-medium">{formatValue(goal.remaining, goal.unit, format)}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-emerald-400">
                  {getTrendIcon(goal.trend)}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-800/50 rounded-full h-2.5 mb-3">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    goal.status === 'on_track' || goal.status === 'exceeded'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : goal.status === 'at_risk'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-red-500 to-red-400'
                  }`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-4">
                  <span>{progressPercentage.toFixed(0)}% Complete</span>
                  {goal.projectedCompletion && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Projected: {new Date(goal.projectedCompletion).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <span>Deadline: {new Date(goal.deadline).toLocaleDateString()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      {data.actions && data.actions.length > 0 && (
        <ActionButtons actions={data.actions} onActionClick={onActionClick} />
      )}
    </div>
  );
};







