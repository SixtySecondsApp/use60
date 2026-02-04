/**
 * Activity Breakdown Response Component
 * Displays activity type breakdown, trends, and effectiveness metrics
 */

import React from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, PieChart, BarChart3 } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { ActivityBreakdownResponse as ActivityBreakdownResponseType } from '../types';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

interface ActivityBreakdownResponseProps {
  data: ActivityBreakdownResponseType;
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const getActivityTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    call: 'Calls',
    email: 'Emails',
    meeting: 'Meetings',
    outbound: 'Outbound',
    proposal: 'Proposals',
    other: 'Other'
  };
  return labels[type] || type;
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    case 'down':
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-gray-400" />;
  }
};

export const ActivityBreakdownResponse: React.FC<ActivityBreakdownResponseProps> = ({ data, onActionClick }) => {
  const { period, breakdown, trends, effectiveness, recommendations } = data.data;

  const pieData = breakdown.map(item => ({
    name: getActivityTypeLabel(item.type),
    value: item.count,
    percentage: item.percentage
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Activity Breakdown</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{period.startDate} to {period.endDate}</p>
          </div>
        </div>

        {/* Total Activities */}
        <div className="grid grid-cols-4 gap-4">
          {breakdown.map((item, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl font-bold text-gray-100">{item.count}</div>
              <div className="text-xs text-gray-400">{getActivityTypeLabel(item.type)}</div>
              <div className="text-xs text-gray-500 mt-1">{item.percentage.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown Chart */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <PieChart className="w-4 h-4" />
          Activity Distribution
        </h4>
        <div className="grid grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <ResponsiveContainer width="100%" height={250}>
              <RechartsPieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f3f4f6'
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown List */}
          <div className="space-y-3">
            {breakdown.map((item, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{getActivityTypeLabel(item.type)}</span>
                    {getTrendIcon(item.trend)}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-100">{item.count}</div>
                    <div className="text-xs text-gray-400">{item.averagePerDay.toFixed(1)}/day</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-700/50 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ 
                        width: `${item.percentage}%`,
                        backgroundColor: COLORS[index % COLORS.length]
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{item.percentage.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trends */}
      {trends && trends.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Activity Trends
          </h4>
          <div className="space-y-4">
            {trends.map((trend, index) => {
              const chartData = trend.dataPoints.map(point => ({
                date: new Date(point.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
                value: point.value
              }));

              return (
                <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-sm font-semibold text-gray-100">{trend.type}</h5>
                    <div className="flex items-center gap-1">
                      {trend.overallTrend === 'increasing' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                      {trend.overallTrend === 'decreasing' && <TrendingDown className="w-4 h-4 text-red-400" />}
                      {trend.overallTrend === 'stable' && <Minus className="w-4 h-4 text-gray-400" />}
                      <span className="text-xs text-gray-400 capitalize">{trend.overallTrend}</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#9ca3af"
                        style={{ fontSize: '10px' }}
                      />
                      <YAxis 
                        stroke="#9ca3af"
                        style={{ fontSize: '10px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6',
                          fontSize: '12px'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Effectiveness */}
      {effectiveness && effectiveness.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4">Activity Effectiveness</h4>
          <div className="space-y-3">
            {effectiveness.map((eff, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h5 className="text-sm font-semibold text-gray-100 mb-1">{eff.type}</h5>
                    <div className="text-xs text-gray-400">{eff.count} activities</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-400">{eff.conversionRate.toFixed(1)}%</div>
                    <div className="text-xs text-gray-400">Conversion</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-700/50">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Deals Generated</div>
                    <div className="text-sm font-semibold text-gray-100">{eff.dealsGenerated}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Revenue Generated</div>
                    <div className="text-sm font-semibold text-emerald-400">{formatCurrency(eff.revenueGenerated)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">ROI</div>
                    <div className="text-sm font-semibold text-blue-400">{eff.roi.toFixed(1)}x</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4">Recommendations</h4>
          <ul className="space-y-2">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>{rec}</span>
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







