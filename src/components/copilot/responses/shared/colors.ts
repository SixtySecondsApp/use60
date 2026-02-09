/**
 * Semantic color system for copilot response components.
 * Ensures consistent color usage across all response types.
 *
 * Each status maps to a set of Tailwind classes for text, background,
 * border, dot indicators, and icons.
 */

export const STATUS_COLORS = {
  critical: {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-500',
    icon: 'text-red-400',
  },
  warning: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-500',
    icon: 'text-amber-400',
  },
  success: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-400',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-500',
    icon: 'text-blue-400',
  },
  neutral: {
    text: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/20',
    dot: 'bg-gray-500',
    icon: 'text-gray-400',
  },
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

/**
 * Map a health/status string to the appropriate color set.
 *
 * Handles common CRM status terms across deals, contacts, and pipeline views.
 *
 * @example
 * getStatusColors('at risk')  // STATUS_COLORS.warning
 * getStatusColors('on track') // STATUS_COLORS.success
 * getStatusColors('unknown')  // STATUS_COLORS.neutral (default)
 */
export function getStatusColors(status: string): (typeof STATUS_COLORS)[StatusColorKey] {
  const lower = status.toLowerCase();

  if (
    ['critical', 'off track', 'overdue', 'high risk', 'lost', 'churned'].includes(lower)
  ) {
    return STATUS_COLORS.critical;
  }

  if (['warning', 'at risk', 'stale', 'slipping'].includes(lower)) {
    return STATUS_COLORS.warning;
  }

  if (['success', 'on track', 'won', 'complete', 'completed', 'healthy'].includes(lower)) {
    return STATUS_COLORS.success;
  }

  if (['info', 'new', 'pending', 'in progress'].includes(lower)) {
    return STATUS_COLORS.info;
  }

  return STATUS_COLORS.neutral;
}
