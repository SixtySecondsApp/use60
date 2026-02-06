/**
 * Template variable utilities
 * Handles cleanup of unresolved template variables in display text
 */

/**
 * Clean unresolved template variables from text
 * Handles legacy data that may have ${...} patterns stored in the database
 *
 * @param text - Text that may contain unresolved template variables
 * @param fallback - What to replace unresolved variables with (default: '[Unknown]')
 * @returns Cleaned text with template variables replaced
 */
export function cleanUnresolvedVariables(
  text: string | undefined | null,
  fallback: string = '[Unknown]'
): string {
  if (!text) return '';
  // Replace any ${...} patterns with a user-friendly fallback
  return text.replace(/\$\{[^}]+\}/g, fallback);
}

/**
 * Check if text contains unresolved template variables
 *
 * @param text - Text to check
 * @returns true if text contains ${...} patterns
 */
export function hasUnresolvedVariables(text: string | undefined | null): boolean {
  if (!text) return false;
  return /\$\{[^}]+\}/.test(text);
}
