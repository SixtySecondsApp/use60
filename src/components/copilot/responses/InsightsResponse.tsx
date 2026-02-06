/**
 * Insights Response Component
 * Displays prioritized insights, quick wins, focus areas, risks, and opportunities
 */

import React from 'react';
import { Lightbulb, Zap, Target, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { InsightsResponse as InsightsResponseType } from '../types';

interface InsightsResponseProps {
  data: InsightsResponseType;
  onActionClick?: (action: any) => void;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'medium':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'low':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const getImpactColor = (impact: string) => {
  switch (impact) {
    case 'high':
      return 'text-emerald-400';
    case 'medium':
      return 'text-amber-400';
    case 'low':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'medium':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'low':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export const InsightsResponse: React.FC<InsightsResponseProps> = ({ data, onActionClick }) => {
  const { priorityInsights, quickWins, focusAreas, risks, opportunities } = data.data;

  return (
    <div className="space-y-6">
      {/* Priority Insights */}
      {priorityInsights && priorityInsights.length > 0 && (
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Priority Insights</h3>
          </div>
          <div className="space-y-4">
            {priorityInsights.map((insight) => (
              <div
                key={insight.id}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-100">{insight.title}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(insight.priority)}`}>
                        {insight.priority.toUpperCase()}
                      </span>
                      <span className={`text-xs font-medium ${getImpactColor(insight.impact)}`}>
                        {insight.impact.toUpperCase()} IMPACT
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{insight.description}</p>
                    {insight.estimatedImpact && (
                      <p className="text-xs text-gray-400 mb-3">
                        Estimated Impact: <span className="text-emerald-400 font-medium">{insight.estimatedImpact}</span>
                      </p>
                    )}
                    {insight.actionItems && insight.actionItems.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-400 mb-2">Action Items:</div>
                        <ul className="space-y-1">
                          {insight.actionItems.map((item, index) => (
                            <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {quickWins && quickWins.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-6 h-6 text-amber-400" />
            <h3 className="text-lg font-semibold text-gray-100">Quick Wins</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickWins.map((win) => (
              <div
                key={win.id}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-100">{win.title}</h4>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      win.effort === 'low' ? 'bg-emerald-500/20 text-emerald-400' :
                      win.effort === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {win.effort.toUpperCase()} EFFORT
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      win.impact === 'high' ? 'bg-blue-500/20 text-blue-400' :
                      win.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {win.impact.toUpperCase()} IMPACT
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-300 mb-2">{win.description}</p>
                <p className="text-xs text-gray-400 mb-2">
                  <span className="font-medium">Action:</span> {win.action}
                </p>
                {win.estimatedResult && (
                  <p className="text-xs text-emerald-400 font-medium">
                    Expected: {win.estimatedResult}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focus Areas */}
      {focusAreas && focusAreas.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-6 h-6 text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-100">Focus Areas</h3>
          </div>
          <div className="space-y-4">
            {focusAreas.map((area) => (
              <div
                key={area.id}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <h4 className="text-sm font-semibold text-gray-100 mb-2">{area.title}</h4>
                <p className="text-sm text-gray-300 mb-3">{area.description}</p>
                {area.metrics && area.metrics.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-400 mb-1">Key Metrics:</div>
                    <div className="flex flex-wrap gap-2">
                      {area.metrics.map((metric, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                          {metric}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {area.recommendations && area.recommendations.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">Recommendations:</div>
                    <ul className="space-y-1">
                      {area.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {risks && risks.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <h3 className="text-lg font-semibold text-gray-100">Risks</h3>
          </div>
          <div className="space-y-3">
            {risks.map((risk) => (
              <div
                key={risk.id}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-100">{risk.title}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(risk.severity)}`}>
                    {risk.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-300 mb-3">{risk.description}</p>
                {risk.mitigation && risk.mitigation.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">Mitigation Strategies:</div>
                    <ul className="space-y-1">
                      {risk.mitigation.map((mitigation, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                          <CheckCircle2 className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                          <span>{mitigation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {opportunities && opportunities.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <h3 className="text-lg font-semibold text-gray-100">Opportunities</h3>
          </div>
          <div className="space-y-3">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-100 mb-1">{opp.title}</h4>
                    <p className="text-sm text-gray-300 mb-3">{opp.description}</p>
                    <div className="flex items-center gap-4 mb-3">
                      <div>
                        <div className="text-xs text-gray-400">Potential Value</div>
                        <div className="text-sm font-semibold text-emerald-400">{formatCurrency(opp.potentialValue)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Probability</div>
                        <div className="text-sm font-semibold text-blue-400">{opp.probability}%</div>
                      </div>
                    </div>
                    {opp.actionItems && opp.actionItems.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">Action Items:</div>
                        <ul className="space-y-1">
                          {opp.actionItems.map((item, index) => (
                            <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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







