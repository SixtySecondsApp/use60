import { AlertTriangle, ArrowUp, Minus, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const COMMAND_CENTRE_CONSTANTS = {};

export const URGENCY_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon; badgeClass: string }> = {
  critical: {
    label: 'Critical',
    color: '#EF4444',
    icon: AlertTriangle,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  high: {
    label: 'High',
    color: '#F59E0B',
    icon: ArrowUp,
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  normal: {
    label: 'Normal',
    color: '#3B82F6',
    icon: Minus,
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  low: {
    label: 'Low',
    color: '#6B7280',
    icon: ArrowDown,
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
};

export const URGENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];
