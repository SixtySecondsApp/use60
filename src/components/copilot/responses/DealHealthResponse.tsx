import React from 'react';
import type { DealHealthResponse as DealHealthResponseType, QuickActionResponse } from '../types';
import { AlertTriangle, Clock, TrendingUp, CheckCircle2, BarChart3, Inbox } from 'lucide-react';
import { MetricCard, getStatusColors } from './shared';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

interface DealHealthResponseProps {
  data: DealHealthResponseType;
  onActionClick?: (action: QuickActionResponse) => void;
}

export const DealHealthResponse: React.FC<DealHealthResponseProps> = ({ data, onActionClick }) => {
  const { atRiskDeals, staleDeals, highValueDeals, likelyToClose, metrics } = data.data;

  const getHealthScoreColor = (score: number) => {
    if (score >= 70) return getStatusColors('healthy').text;
    if (score >= 40) return getStatusColors('at risk').text;
    return getStatusColors('critical').text;
  };

  const handleDealClick = (dealId: string) => {
    onActionClick?.({
      id: `view-deal-${dealId}`,
      label: 'View Deal',
      type: 'primary',
      callback: 'open_deal',
      params: { dealId },
    });
  };

  // Empty state
  const hasDeals = atRiskDeals.length > 0 || staleDeals.length > 0 || highValueDeals.length > 0 || likelyToClose.length > 0;
  if (!hasDeals) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Inbox className="w-8 h-8 text-gray-500 mb-2" />
        <p className="text-sm text-gray-400">No deal health data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="At Risk"
          value={metrics.totalAtRisk}
          variant="critical"
          icon={AlertTriangle}
          size="lg"
        />
        <MetricCard
          label="Stale"
          value={metrics.totalStale}
          variant="warning"
          icon={Clock}
          size="lg"
        />
        <MetricCard
          label="High Value"
          value={metrics.totalHighValue}
          variant="info"
          icon={TrendingUp}
          size="lg"
        />
        <MetricCard
          label="Likely to Close"
          value={metrics.totalLikelyToClose}
          variant="success"
          icon={CheckCircle2}
          size="lg"
        />
      </div>

      {/* Average Health Score */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-400">Average Health Score</span>
          </div>
          <div className={`text-2xl font-bold ${getHealthScoreColor(metrics.averageHealthScore)}`}>
            {metrics.averageHealthScore}
          </div>
        </div>
      </div>

      {/* At Risk Deals */}
      {atRiskDeals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${getStatusColors('critical').icon}`} />
            At Risk Deals ({atRiskDeals.length})
          </h3>
          <div className="space-y-3">
            {atRiskDeals.map((deal) => {
              const colors = getStatusColors('critical');
              return (
                <div
                  key={deal.id}
                  className={`${colors.bg} border ${colors.border} rounded-lg p-4 cursor-pointer hover:brightness-110 transition-all`}
                  onClick={() => handleDealClick(deal.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-white hover:text-blue-400 transition-colors">{deal.name}</h4>
                      <p className="text-sm text-gray-400">{deal.stage}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">{formatCurrency(deal.value)}</div>
                      <div className={`text-sm ${getHealthScoreColor(deal.healthScore)}`}>
                        Score: {deal.healthScore}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-gray-400">
                      {deal.daysSinceActivity > 0 ? `${deal.daysSinceActivity} days since last activity` : 'No recent activity'}
                    </div>
                    {deal.riskFactors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {deal.riskFactors.map((factor, idx) => (
                          <span key={idx} className={`text-xs ${colors.bg} ${colors.text} px-2 py-1 rounded`}>
                            {factor}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-sm text-gray-300">{deal.recommendation}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stale Deals */}
      {staleDeals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Clock className={`w-5 h-5 ${getStatusColors('stale').icon}`} />
            Stale Deals ({staleDeals.length})
          </h3>
          <div className="space-y-3">
            {staleDeals.map((deal) => {
              const colors = getStatusColors('stale');
              return (
                <div
                  key={deal.id}
                  className={`${colors.bg} border ${colors.border} rounded-lg p-4 cursor-pointer hover:brightness-110 transition-all`}
                  onClick={() => handleDealClick(deal.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-white hover:text-blue-400 transition-colors">{deal.name}</h4>
                      <p className="text-sm text-gray-400">{deal.stage}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">{formatCurrency(deal.value)}</div>
                      <div className={`text-sm ${colors.text}`}>{deal.daysInStage} days in stage</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-300">{deal.recommendation}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* High Value Deals */}
      {highValueDeals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className={`w-5 h-5 ${getStatusColors('info').icon}`} />
            High Value Deals ({highValueDeals.length})
          </h3>
          <div className="space-y-3">
            {highValueDeals.map((deal) => {
              const colors = getStatusColors('info');
              return (
                <div
                  key={deal.id}
                  className={`${colors.bg} border ${colors.border} rounded-lg p-4 cursor-pointer hover:brightness-110 transition-all`}
                  onClick={() => handleDealClick(deal.id)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-white hover:text-blue-400 transition-colors">{deal.name}</h4>
                      <p className="text-sm text-gray-400">{deal.stage}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">{formatCurrency(deal.value)}</div>
                      <div className={`text-sm ${getHealthScoreColor(deal.healthScore)}`}>
                        Score: {deal.healthScore}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Likely to Close */}
      {likelyToClose.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <CheckCircle2 className={`w-5 h-5 ${getStatusColors('healthy').icon}`} />
            Likely to Close ({likelyToClose.length})
          </h3>
          <div className="space-y-3">
            {likelyToClose.map((deal) => {
              const colors = getStatusColors('healthy');
              return (
                <div
                  key={deal.id}
                  className={`${colors.bg} border ${colors.border} rounded-lg p-4 cursor-pointer hover:brightness-110 transition-all`}
                  onClick={() => handleDealClick(deal.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-white hover:text-blue-400 transition-colors">{deal.name}</h4>
                      <p className="text-sm text-gray-400">{deal.stage}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">{formatCurrency(deal.value)}</div>
                      <div className={`text-sm ${colors.text}`}>
                        {deal.probability}% probability
                      </div>
                    </div>
                  </div>
                  {deal.closeDate && (
                    <div className="text-sm text-gray-400 mt-2">
                      Expected close: {formatDate(deal.closeDate)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

