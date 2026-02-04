/**
 * Stage Analysis Response Component
 * Displays pipeline stage metrics, conversion rates, time in stage, and bottlenecks
 */

import React from 'react';
import { BarChart3, Clock, TrendingUp, TrendingDown, AlertTriangle, ArrowRight } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { StageAnalysisResponse as StageAnalysisResponseType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface StageAnalysisResponseProps {
  data: StageAnalysisResponseType;
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const getHealthColor = (score: number) => {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
};

export const StageAnalysisResponse: React.FC<StageAnalysisResponseProps> = ({ data, onActionClick }) => {
  const { stages, conversionRates, timeInStage, distribution, bottlenecks } = data.data;

  const stageChartData = stages.map(stage => ({
    stage: stage.stage,
    deals: stage.dealCount,
    value: stage.totalValue
  }));

  const distributionChartData = distribution.byStage.map(item => ({
    stage: item.stage,
    count: item.count,
    percentage: item.percentage,
    value: item.value
  }));

  return (
    <div className="space-y-6">
      {/* Distribution Overview */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pipeline Distribution</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">Total Deals</div>
            <div className="text-2xl font-bold text-gray-100">{distribution.totalDeals}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Total Value</div>
            <div className="text-2xl font-bold text-blue-400">{formatCurrency(distribution.totalValue)}</div>
          </div>
        </div>

        {/* Distribution Chart */}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={distributionChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="stage" 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#9ca3af"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#f3f4f6'
              }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
              {distributionChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stage Metrics */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
        <h4 className="text-sm font-medium text-gray-300 mb-4">Stage Metrics</h4>
        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div key={index} className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="text-sm font-semibold text-gray-100 mb-1">{stage.stage}</h5>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{stage.dealCount} deals</span>
                    <span>{formatCurrency(stage.totalValue)} total value</span>
                    <span>Avg: {formatCurrency(stage.averageValue)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${getHealthColor(stage.healthScore)}`}>
                    {stage.healthScore}
                  </div>
                  <div className="text-xs text-gray-400">Health Score</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>Average age: {stage.averageAge} days</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion Rates */}
      {conversionRates && conversionRates.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4">Conversion Rates</h4>
          <div className="space-y-3">
            {conversionRates.map((rate, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{rate.fromStage}</span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-200">{rate.toStage}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rate.trend === 'improving' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                    {rate.trend === 'declining' && <TrendingDown className="w-4 h-4 text-red-400" />}
                    <span className="text-lg font-bold text-gray-100">{rate.rate.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Avg time: {rate.averageTime} days</span>
                  <span className={`${
                    rate.trend === 'improving' ? 'text-emerald-400' :
                    rate.trend === 'declining' ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {rate.trend.charAt(0).toUpperCase() + rate.trend.slice(1)}
                  </span>
                </div>
                {/* Conversion Rate Bar */}
                <div className="w-full bg-gray-700/50 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      rate.trend === 'improving' ? 'bg-emerald-500' :
                      rate.trend === 'declining' ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(rate.rate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time in Stage */}
      {timeInStage && timeInStage.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Time in Stage
          </h4>
          <div className="space-y-3">
            {timeInStage.map((time, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-gray-100">{time.stage}</h5>
                  <div className="text-sm font-semibold text-gray-100">{time.averageDays} days avg</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-gray-400">
                  <div>
                    <div className="text-gray-500">Median</div>
                    <div className="text-gray-200 font-medium">{time.medianDays} days</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Longest</div>
                    <div className="text-red-400 font-medium">{time.longestDeal} days</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Shortest</div>
                    <div className="text-emerald-400 font-medium">{time.shortestDeal} days</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottlenecks */}
      {bottlenecks && bottlenecks.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            <h3 className="text-lg font-semibold text-gray-100">Bottlenecks</h3>
          </div>
          <div className="space-y-3">
            {bottlenecks.map((bottleneck, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4 border border-amber-500/30">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="text-sm font-semibold text-gray-100">{bottleneck.stage}</h5>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        bottleneck.impact === 'high' ? 'bg-red-500/20 text-red-400' :
                        bottleneck.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {bottleneck.impact.toUpperCase()} IMPACT
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mb-2">{bottleneck.issue}</p>
                    <p className="text-xs text-emerald-400">
                      <span className="font-medium">Recommendation:</span> {bottleneck.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {data.actions && data.actions.length > 0 && (
        <ActionButtons actions={data.actions} onActionClick={onActionClick} />
      )}
    </div>
  );
};







