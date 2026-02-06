/**
 * Metric Focus Response Component
 * Displays deep dive into a specific metric with trends and breakdowns
 */

import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus, PieChart } from 'lucide-react';
import { ActionButtons } from '../ActionButtons';
import type { MetricFocusResponse as MetricFocusResponseType } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

interface MetricFocusResponseProps {
  data: MetricFocusResponseType;
  onActionClick?: (action: any) => void;
}

const formatValue = (value: number, format: string, unit: string): string => {
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
  if (format === 'duration') {
    return `${value} ${unit}`;
  }
  return value.toLocaleString();
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const MetricFocusResponse: React.FC<MetricFocusResponseProps> = ({ data, onActionClick }) => {
  const { metric, current, previous, trend, breakdown, insights } = data.data;

  const chartData = trend.map(point => ({
    date: new Date(point.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    value: point.value,
    label: point.label
  }));

  const pieData = breakdown?.map(item => ({
    name: item.category,
    value: item.value,
    percentage: item.percentage
  })) || [];

  return (
    <div className="space-y-6">
      {/* Metric Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{metric.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{current.period}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-100">
              {formatValue(current.value, metric.format, metric.unit)}
            </div>
            {previous && current.change !== undefined && (
              <div className={`flex items-center gap-1 justify-end mt-1 ${
                current.changeType === 'increase' ? 'text-emerald-400' :
                current.changeType === 'decrease' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {current.changeType === 'increase' && <TrendingUp className="w-4 h-4" />}
                {current.changeType === 'decrease' && <TrendingDown className="w-4 h-4" />}
                {current.changeType === 'neutral' && <Minus className="w-4 h-4" />}
                <span className="text-sm font-medium">
                  {current.change >= 0 ? '+' : ''}{current.change.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400 ml-1">vs {previous.period}</span>
              </div>
            )}
          </div>
        </div>

        {/* Previous Comparison */}
        {previous && (
          <div className="mt-4 pt-4 border-t border-gray-800/50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-1">Current Period</div>
                <div className="text-lg font-semibold text-gray-100">
                  {formatValue(current.value, metric.format, metric.unit)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Previous Period</div>
                <div className="text-lg font-semibold text-gray-300">
                  {formatValue(previous.value, metric.format, metric.unit)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trend Chart */}
      {trend.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4">Trend Over Time</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#9ca3af"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatValue(value, metric.format, metric.unit)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f3f4f6'
                }}
                formatter={(value: number) => formatValue(value, metric.format, metric.unit)}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Breakdown by Category
          </h4>
          <div className="grid grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div>
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage.toFixed(0)}%`}
                    outerRadius={80}
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
                    formatter={(value: number) => formatValue(value, metric.format, metric.unit)}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>

            {/* Breakdown List */}
            <div className="space-y-3">
              {breakdown.map((item, index) => (
                <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-200">{item.category}</span>
                    <div className="flex items-center gap-2">
                      {item.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                      {item.trend === 'down' && <TrendingDown className="w-3 h-3 text-red-400" />}
                      {item.trend === 'stable' && <Minus className="w-3 h-3 text-gray-400" />}
                      <span className="text-sm font-semibold text-gray-100">
                        {formatValue(item.value, metric.format, metric.unit)}
                      </span>
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
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
          <h4 className="text-sm font-medium text-gray-300 mb-4">Key Insights</h4>
          <ul className="space-y-2">
            {insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                <span>{insight}</span>
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







