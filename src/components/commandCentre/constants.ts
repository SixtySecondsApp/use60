/**
 * Command Centre shared constants
 *
 * Extracted from CCItemCard, CCDetailPanel, and CommandCentre page to eliminate duplication.
 */

import { AlertTriangle, ArrowUp, Bell, ChevronDown } from 'lucide-react';

export const URGENCY_CONFIG = {
  critical: {
    label: 'Critical',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    icon: ArrowUp,
  },
  normal: {
    label: 'Normal',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    icon: Bell,
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    icon: ChevronDown,
  },
} as const;

export const URGENCY_OPTIONS = ['critical', 'high', 'normal', 'low'] as const;
export type UrgencyKey = keyof typeof URGENCY_CONFIG;
