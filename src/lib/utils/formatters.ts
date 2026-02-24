/**
 * Shared formatting utilities for copilot response components.
 * Centralizes currency, date, time, and number formatting
 * to ensure consistency across all 48+ response components.
 *
 * All functions default to en-US locale for consistent output.
 */

// =============================================================================
// Currency Formatting
// =============================================================================

/**
 * Format a number as currency. Defaults to USD with no decimals.
 *
 * @example
 * formatCurrency(1500)       // "$1,500"
 * formatCurrency(1500, 'GBP') // "£1,500"
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  if (!isFinite(value)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number as compact currency for large values.
 *
 * @example
 * formatCurrencyCompact(1_200_000) // "$1.2M"
 * formatCurrencyCompact(50_000)    // "$50K"
 * formatCurrencyCompact(999)       // "$999"
 */
export function formatCurrencyCompact(value: number, currency: string = 'USD'): string {
  if (!isFinite(value)) return '$0';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  const symbol = getCurrencySymbol(currency);

  if (abs >= 1_000_000_000) {
    const formatted = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}B`;
  }
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}M`;
  }
  if (abs >= 1_000) {
    const formatted = (abs / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}K`;
  }

  return formatCurrency(value, currency);
}

/** Resolve currency code to its symbol for compact formatting. */
function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const symbolPart = parts.find((p) => p.type === 'currency');
    return symbolPart?.value ?? '$';
  } catch {
    return '$';
  }
}

// =============================================================================
// Date Formatting
// =============================================================================

/**
 * Standard date format: "Jan 15, 2025"
 *
 * Returns empty string for invalid or missing input.
 */
export function formatDate(dateString: string | Date | null | undefined): string {
  const date = toSafeDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Short date format: "Jan 15"
 *
 * Omits the year for a more compact display.
 */
export function formatDateShort(dateString: string | Date | null | undefined): string {
  const date = toSafeDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Long date format: "Monday, January 15, 2025"
 */
export function formatDateLong(dateString: string | Date | null | undefined): string {
  const date = toSafeDate(dateString);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Relative date: "2 days ago", "in 3 hours", "just now"
 *
 * Handles both past and future dates. Falls back to formatDateShort
 * for dates more than 30 days away.
 */
export function formatRelativeDate(dateString: string | Date | null | undefined): string {
  const date = toSafeDate(dateString);
  if (!date) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs > 0;

  const minutes = Math.floor(absDiffMs / (1000 * 60));
  const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);

  // Less than 1 minute
  if (minutes < 1) return 'just now';

  // Less than 1 hour
  if (minutes < 60) {
    const label = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    return isPast ? `${label} ago` : `in ${label}`;
  }

  // Less than 1 day
  if (hours < 24) {
    const label = `${hours} hour${hours !== 1 ? 's' : ''}`;
    return isPast ? `${label} ago` : `in ${label}`;
  }

  // Today / Yesterday / Tomorrow
  if (days === 0) return 'Today';
  if (days === 1 && isPast) return 'Yesterday';
  if (days === 1 && !isPast) return 'Tomorrow';

  // Less than 7 days
  if (days < 7) {
    const label = `${days} day${days !== 1 ? 's' : ''}`;
    return isPast ? `${label} ago` : `in ${label}`;
  }

  // Less than 30 days
  if (days < 30) {
    const label = `${weeks} week${weeks !== 1 ? 's' : ''}`;
    return isPast ? `${label} ago` : `in ${label}`;
  }

  // Beyond 30 days, fall back to short date
  return formatDateShort(date);
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Format time: "2:30 PM"
 *
 * Returns empty string for invalid input.
 */
export function formatTime(dateString: string | Date | null | undefined): string {
  const date = toSafeDate(dateString);
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a duration in minutes to a human-readable string.
 *
 * @example
 * formatDuration(45)   // "45m"
 * formatDuration(90)   // "1h 30m"
 * formatDuration(120)  // "2h"
 * formatDuration(0)    // "0m"
 */
export function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes < 0) return '0m';

  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Format a percentage with optional decimal places.
 *
 * @example
 * formatPercentage(85)      // "85%"
 * formatPercentage(85.5, 1) // "85.5%"
 * formatPercentage(-3.2, 1) // "-3.2%"
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  if (!isFinite(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number with locale-aware separators.
 *
 * @example
 * formatNumber(1234)    // "1,234"
 * formatNumber(1234567) // "1,234,567"
 */
export function formatNumber(value: number): string {
  if (!isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Safely parse a date string or Date object, returning null for invalid input.
 */
function toSafeDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  try {
    const date = input instanceof Date ? input : new Date(input);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}
