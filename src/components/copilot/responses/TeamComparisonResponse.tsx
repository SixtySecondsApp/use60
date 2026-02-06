/**
 * Team Comparison Response Component
 * Displays user performance vs team average with rankings and comparisons
 */

import React from 'react';
import { Users, Trophy, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { TeamComparisonResponse as TeamComparisonResponseType } from '../types';

interface TeamComparisonResponseProps {
  data: TeamComparisonResponseType;
  onActionClick?: (action: any) => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const getRankingColor = (category: string) => {
  switch (category) {
    case 'top_performer':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'above_average':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'average':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'below_average':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const getComparisonIcon = (userValue: number, teamValue: number) => {
  if (userValue > teamValue) {
    return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
  } else if (userValue < teamValue) {
    return <ArrowDownRight className="w-4 h-4 text-red-400" />;
  }
  return <Minus className="w-4 h-4 text-gray-400" />;
};

const getComparisonColor = (userValue: number, teamValue: number) => {
  if (userValue > teamValue) return 'text-emerald-400';
  if (userValue < teamValue) return 'text-red-400';
  return 'text-gray-400';
};

export const TeamComparisonResponse: React.FC<TeamComparisonResponseProps> = ({ data, onActionClick }) => {
  const { userMetrics, teamAverage, ranking, comparisons, period } = data.data;

  const calculateDifference = (user: number, team: number, format: 'currency' | 'percentage' | 'number' = 'number') => {
    const diff = user - team;
    const percentDiff = team !== 0 ? (diff / team) * 100 : 0;
    
    if (format === 'currency') {
      return { value: formatCurrency(diff), percent: percentDiff };
    }
    if (format === 'percentage') {
      return { value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, percent: percentDiff };
    }
    return { value: `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}`, percent: percentDiff };
  };

  return (
    <div className="space-y-6">
      {/* Ranking Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userMetrics.userName}'s Performance</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{period.startDate} to {period.endDate}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-2xl font-bold text-gray-100">#{ranking.position}</span>
            </div>
            <div className="text-xs text-gray-400">of {ranking.totalMembers} team members</div>
            <div className={`mt-2 px-2 py-1 rounded text-xs font-medium border ${getRankingColor(ranking.category)}`}>
              {ranking.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          </div>
        </div>

        {/* Percentile */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Percentile Rank</span>
            <span className="text-sm font-semibold text-gray-100">{ranking.percentile.toFixed(0)}th percentile</span>
          </div>
          <div className="w-full bg-gray-800/50 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${ranking.percentile}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metric Comparisons */}
      <div className="space-y-3">
        {/* Revenue */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">Revenue</h4>
            {getComparisonIcon(userMetrics.revenue, teamAverage.averageRevenue)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">You</div>
              <div className="text-lg font-semibold text-gray-100">{formatCurrency(userMetrics.revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Team Average</div>
              <div className="text-lg font-semibold text-gray-300">{formatCurrency(teamAverage.averageRevenue)}</div>
            </div>
          </div>
          <div className={`mt-2 text-sm font-medium ${getComparisonColor(userMetrics.revenue, teamAverage.averageRevenue)}`}>
            {calculateDifference(userMetrics.revenue, teamAverage.averageRevenue, 'currency').value} 
            ({calculateDifference(userMetrics.revenue, teamAverage.averageRevenue).percent >= 0 ? '+' : ''}
            {calculateDifference(userMetrics.revenue, teamAverage.averageRevenue).percent.toFixed(1)}%)
          </div>
        </div>

        {/* Deals Closed */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">Deals Closed</h4>
            {getComparisonIcon(userMetrics.dealsClosed, teamAverage.averageDealsClosed)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">You</div>
              <div className="text-lg font-semibold text-gray-100">{userMetrics.dealsClosed}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Team Average</div>
              <div className="text-lg font-semibold text-gray-300">{teamAverage.averageDealsClosed.toFixed(1)}</div>
            </div>
          </div>
          <div className={`mt-2 text-sm font-medium ${getComparisonColor(userMetrics.dealsClosed, teamAverage.averageDealsClosed)}`}>
            {calculateDifference(userMetrics.dealsClosed, teamAverage.averageDealsClosed).value} 
            ({calculateDifference(userMetrics.dealsClosed, teamAverage.averageDealsClosed).percent >= 0 ? '+' : ''}
            {calculateDifference(userMetrics.dealsClosed, teamAverage.averageDealsClosed).percent.toFixed(1)}%)
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">Win Rate</h4>
            {getComparisonIcon(userMetrics.winRate, teamAverage.averageWinRate)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">You</div>
              <div className="text-lg font-semibold text-gray-100">{formatPercentage(userMetrics.winRate)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Team Average</div>
              <div className="text-lg font-semibold text-gray-300">{formatPercentage(teamAverage.averageWinRate)}</div>
            </div>
          </div>
          <div className={`mt-2 text-sm font-medium ${getComparisonColor(userMetrics.winRate, teamAverage.averageWinRate)}`}>
            {calculateDifference(userMetrics.winRate, teamAverage.averageWinRate, 'percentage').value}
          </div>
        </div>

        {/* Activities */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">Activities</h4>
            {getComparisonIcon(userMetrics.activities, teamAverage.averageActivities)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">You</div>
              <div className="text-lg font-semibold text-gray-100">{userMetrics.activities}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Team Average</div>
              <div className="text-lg font-semibold text-gray-300">{teamAverage.averageActivities.toFixed(0)}</div>
            </div>
          </div>
          <div className={`mt-2 text-sm font-medium ${getComparisonColor(userMetrics.activities, teamAverage.averageActivities)}`}>
            {calculateDifference(userMetrics.activities, teamAverage.averageActivities).value} 
            ({calculateDifference(userMetrics.activities, teamAverage.averageActivities).percent >= 0 ? '+' : ''}
            {calculateDifference(userMetrics.activities, teamAverage.averageActivities).percent.toFixed(1)}%)
          </div>
        </div>

        {/* Average Deal Size */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-200">Average Deal Size</h4>
            {getComparisonIcon(userMetrics.averageDealSize, teamAverage.averageDealSize)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">You</div>
              <div className="text-lg font-semibold text-gray-100">{formatCurrency(userMetrics.averageDealSize)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Team Average</div>
              <div className="text-lg font-semibold text-gray-300">{formatCurrency(teamAverage.averageDealSize)}</div>
            </div>
          </div>
          <div className={`mt-2 text-sm font-medium ${getComparisonColor(userMetrics.averageDealSize, teamAverage.averageDealSize)}`}>
            {calculateDifference(userMetrics.averageDealSize, teamAverage.averageDealSize, 'currency').value} 
            ({calculateDifference(userMetrics.averageDealSize, teamAverage.averageDealSize).percent >= 0 ? '+' : ''}
            {calculateDifference(userMetrics.averageDealSize, teamAverage.averageDealSize).percent.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {data.actions && data.actions.length > 0 && (
        <ActionButtons actions={data.actions} onActionClick={onActionClick} />
      )}
    </div>
  );
};







