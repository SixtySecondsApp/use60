/**
 * DealCardSkeleton Component
 *
 * Animated loading skeleton matching DealCard layout.
 */

import React from 'react';

export function DealCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 animate-pulse">
      {/* Header */}
      <div className="p-3 pb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24" />
        </div>
        <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-16" />
      </div>

      {/* Deal name */}
      <div className="px-3 pb-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-32" />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* Metrics row */}
      <div className="p-3 grid grid-cols-4 gap-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* Footer */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
        </div>
        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}
