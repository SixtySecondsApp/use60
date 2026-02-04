/**
 * Forecast Response Component
 * Displays revenue forecasts, pipeline coverage, and scenario analysis
 */

import React from 'react';
import { TrendingUp, Target, BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { ForecastResponse as ForecastResponseType } from '../types';

interface ForecastResponseProps {
  data: ForecastResponseType;
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

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 80) return 'text-emerald-400';
  if (confidence >= 60) return 'text-amber-400';
  return 'text-red-400';
};

const getConfidenceBadge = (confidence: number) => {
  if (confidence >= 80) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (confidence >= 60) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
};

export const ForecastResponse: React.FC<ForecastResponseProps> = ({ data, onActionClick }) => {
  const { period, forecast, confidence, assumptions, scenarios } = data.data;

  return (
    <div className="space-y-6">
      {/* Forecast Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Revenue Forecast</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{period.label}</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${getConfidenceBadge(confidence)}`}>
            {confidence}% Confidence
          </div>
        </div>

        {/* Main Forecast Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Most Likely</div>
            <div className="text-2xl font-bold text-gray-100">{formatCurrency(forecast.mostLikely)}</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <div className="text-xs text-emerald-400 mb-1">Best Case</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(forecast.bestCase)}</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="text-xs text-red-400 mb-1">Worst Case</div>
            <div className="text-2xl font-bold text-red-400">{formatCurrency(forecast.worstCase)}</div>
          </div>
        </div>

        {/* Pipeline Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">Projected Revenue</div>
            <div className="text-lg font-semibold text-gray-100">{formatCurrency(forecast.projectedRevenue)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Pipeline Coverage</div>
            <div className="text-lg font-semibold text-blue-400">{forecast.pipelineCoverage.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1">Deals to Close</div>
            <div className="text-lg font-semibold text-gray-100">{forecast.dealsToClose}</div>
          </div>
        </div>
      </div>

      {/* Scenarios */}
      {scenarios && scenarios.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Forecast Scenarios
          </h4>
          <div className="space-y-3">
            {scenarios.map((scenario, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="text-sm font-semibold text-gray-100">{scenario.name}</h5>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                        {scenario.probability}% probability
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{scenario.description}</p>
                  </div>
                  <div className="text-lg font-bold text-gray-100 ml-4">
                    {formatCurrency(scenario.revenue)}
                  </div>
                </div>
                {/* Probability Bar */}
                <div className="w-full bg-gray-700/50 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${scenario.probability}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assumptions */}
      {assumptions && assumptions.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Forecast Assumptions
          </h4>
          <ul className="space-y-2">
            {assumptions.map((assumption, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      {data.actions && data.actions.length > 0 && (
        <ActionButtons actions={data.actions} onActionClick={onActionClick} />
      )}
    </div>
  );
};







