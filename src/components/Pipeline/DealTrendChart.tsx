/**
 * DealTrendChart Component (PIPE-014)
 *
 * Lightweight SVG sparkline showing health score trend over time.
 */

import React from 'react';

interface DealTrendChartProps {
  dataPoints: number[]; // Health scores over time
  size?: 'inline' | 'expanded';
  healthStatus?: 'healthy' | 'warning' | 'critical' | 'stalled';
}

/**
 * Get color from health status
 */
function getHealthColor(status: string | undefined): string {
  switch (status) {
    case 'healthy':
      return '#22c55e'; // green-500
    case 'warning':
      return '#eab308'; // yellow-500
    case 'critical':
      return '#ef4444'; // red-500
    case 'stalled':
      return '#64748b'; // gray-500
    default:
      return '#94a3b8'; // gray-400
  }
}

/**
 * Generate SVG path for sparkline
 */
function generateSparklinePath(
  dataPoints: number[],
  width: number,
  height: number,
  padding: number = 2
): string {
  if (dataPoints.length === 0) return '';
  if (dataPoints.length === 1) {
    const y = height / 2;
    return `M 0,${y} L ${width},${y}`;
  }

  const maxValue = Math.max(...dataPoints, 100);
  const minValue = Math.min(...dataPoints, 0);
  const range = maxValue - minValue || 1;

  const stepX = width / (dataPoints.length - 1);

  const points = dataPoints.map((value, index) => {
    const x = index * stepX;
    const y = height - padding - ((value - minValue) / range) * (height - 2 * padding);
    return { x, y };
  });

  // Start path
  let path = `M ${points[0].x},${points[0].y}`;

  // Create smooth curve using quadratic bezier
  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i - 1];
    const currentPoint = points[i];
    const midX = (prevPoint.x + currentPoint.x) / 2;

    path += ` Q ${prevPoint.x},${prevPoint.y} ${midX},${(prevPoint.y + currentPoint.y) / 2}`;
    path += ` Q ${currentPoint.x},${currentPoint.y} ${currentPoint.x},${currentPoint.y}`;
  }

  return path;
}

/**
 * Generate area path (fill under curve)
 */
function generateAreaPath(
  dataPoints: number[],
  width: number,
  height: number,
  padding: number = 2
): string {
  if (dataPoints.length === 0) return '';

  const linePath = generateSparklinePath(dataPoints, width, height, padding);
  if (!linePath) return '';

  // Close the path by going to bottom-right, then bottom-left, then back to start
  const lastX = width;
  const firstX = 0;
  const bottomY = height;

  return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
}

export function DealTrendChart({
  dataPoints,
  size = 'inline',
  healthStatus,
}: DealTrendChartProps) {
  const isInline = size === 'inline';
  const width = isInline ? 60 : 200;
  const height = isInline ? 20 : 80;
  const strokeWidth = isInline ? 1.5 : 2;
  const color = getHealthColor(healthStatus);

  // If no data, show flat line
  const displayPoints = dataPoints.length > 0 ? dataPoints : [50, 50];

  const linePath = generateSparklinePath(displayPoints, width, height);
  const areaPath = generateAreaPath(displayPoints, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {/* Area fill (10% opacity) */}
      <path
        d={areaPath}
        fill={color}
        fillOpacity={0.1}
      />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Expanded: Show axis labels */}
      {!isInline && (
        <>
          {/* Y-axis labels */}
          <text
            x="2"
            y="10"
            fontSize="8"
            fill="currentColor"
            className="text-gray-500 dark:text-gray-400"
          >
            100
          </text>
          <text
            x="2"
            y={height - 2}
            fontSize="8"
            fill="currentColor"
            className="text-gray-500 dark:text-gray-400"
          >
            0
          </text>
        </>
      )}
    </svg>
  );
}
