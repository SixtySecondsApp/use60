import React from 'react';

interface BetterContactStatusCellProps {
  value: string | null | undefined;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  deliverable: {
    label: 'Deliverable',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  catch_all: {
    label: 'Catch-all',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  catch_all_safe: {
    label: 'Catch-all (safe)',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
  catch_all_not_safe: {
    label: 'Catch-all (risky)',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
  undeliverable: {
    label: 'Undeliverable',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  not_found: {
    label: 'Not found',
    className: 'bg-gray-100 text-gray-500 dark:bg-zinc-800/50 dark:text-zinc-500',
  },
};

export function BetterContactStatusCell({ value }: BetterContactStatusCellProps) {
  if (!value) return null;

  const config = STATUS_CONFIG[value.toLowerCase()] || {
    label: value,
    className: 'bg-gray-100 text-gray-500 dark:bg-zinc-800/50 dark:text-zinc-500',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
