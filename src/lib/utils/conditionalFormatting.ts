// ---------------------------------------------------------------------------
// Conditional Formatting — evaluate rules and return cell styles
// ---------------------------------------------------------------------------

export interface FormattingRule {
  id: string;
  column_key: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than' | 'starts_with';
  value: string;
  style: FormattingStyle;
  scope?: 'row' | 'cell'; // 'row' = highlight entire row, 'cell' = only the matched column
}

export interface FormattingStyle {
  backgroundColor?: string;
  textColor?: string;
  bold?: boolean;
  strikethrough?: boolean;
}

// Preset styles
export const STYLE_PRESETS = [
  { label: 'Green background', style: { backgroundColor: 'rgba(34,197,94,0.15)', textColor: '#4ade80' } },
  { label: 'Red background', style: { backgroundColor: 'rgba(239,68,68,0.15)', textColor: '#f87171' } },
  { label: 'Yellow background', style: { backgroundColor: 'rgba(234,179,8,0.15)', textColor: '#facc15' } },
  { label: 'Blue background', style: { backgroundColor: 'rgba(59,130,246,0.15)', textColor: '#60a5fa' } },
  { label: 'Bold text', style: { bold: true } },
  { label: 'Strikethrough', style: { strikethrough: true, textColor: '#6b7280' } },
] as const;

// Tailwind color name → CSS mapping for AI-generated formatting rules
const TAILWIND_COLOR_MAP: Record<string, string> = {
  // Backgrounds (with opacity)
  'green-900/20': 'rgba(34,197,94,0.15)',
  'green-800/20': 'rgba(34,197,94,0.15)',
  'red-900/20': 'rgba(239,68,68,0.15)',
  'red-800/20': 'rgba(239,68,68,0.15)',
  'amber-900/20': 'rgba(245,158,11,0.15)',
  'amber-800/20': 'rgba(245,158,11,0.15)',
  'yellow-900/20': 'rgba(234,179,8,0.15)',
  'yellow-800/20': 'rgba(234,179,8,0.15)',
  'blue-900/20': 'rgba(59,130,246,0.15)',
  'blue-800/20': 'rgba(59,130,246,0.15)',
  'purple-900/20': 'rgba(168,85,247,0.15)',
  'purple-800/20': 'rgba(168,85,247,0.15)',
  'orange-900/20': 'rgba(249,115,22,0.15)',
  'orange-800/20': 'rgba(249,115,22,0.15)',
  // Text colors
  'green-300': '#86efac',
  'green-400': '#4ade80',
  'red-300': '#fca5a5',
  'red-400': '#f87171',
  'amber-300': '#fcd34d',
  'yellow-300': '#fde047',
  'blue-300': '#93c5fd',
  'blue-400': '#60a5fa',
  'purple-300': '#d8b4fe',
  'orange-300': '#fdba74',
};

// Simple color name → CSS style mapping for AI formatting
const SIMPLE_COLOR_MAP: Record<string, { backgroundColor: string; textColor: string }> = {
  green:  { backgroundColor: 'rgba(34,197,94,0.15)',  textColor: '#4ade80' },
  red:    { backgroundColor: 'rgba(239,68,68,0.15)',  textColor: '#f87171' },
  amber:  { backgroundColor: 'rgba(245,158,11,0.15)', textColor: '#fcd34d' },
  yellow: { backgroundColor: 'rgba(234,179,8,0.15)',  textColor: '#facc15' },
  blue:   { backgroundColor: 'rgba(59,130,246,0.15)', textColor: '#60a5fa' },
  purple: { backgroundColor: 'rgba(168,85,247,0.15)', textColor: '#d8b4fe' },
  orange: { backgroundColor: 'rgba(249,115,22,0.15)', textColor: '#fdba74' },
  gold:   { backgroundColor: 'rgba(234,179,8,0.15)',  textColor: '#facc15' },
};

/**
 * Convert a Tailwind color class suffix or simple color name to a CSS value.
 * Falls back to the input string if no mapping found (allows raw CSS).
 */
export function tailwindColorToCSS(twColor: string | undefined): string | undefined {
  if (!twColor) return undefined;
  return TAILWIND_COLOR_MAP[twColor] || twColor;
}

/**
 * Convert an AI formatting rule's style to a proper FormattingStyle.
 * Handles Tailwind class suffixes, simple color names, and raw CSS values.
 */
export function convertAIStyleToCSS(aiStyle: { bg_color?: string; text_color?: string }): FormattingStyle {
  const bgColor = aiStyle.bg_color ?? '';
  const textColor = aiStyle.text_color ?? '';

  // Check if it's a simple color name (e.g., "green", "red")
  const simpleMatch = SIMPLE_COLOR_MAP[bgColor.toLowerCase()];
  if (simpleMatch) {
    return {
      backgroundColor: simpleMatch.backgroundColor,
      textColor: textColor ? (tailwindColorToCSS(textColor) || simpleMatch.textColor) : simpleMatch.textColor,
    };
  }

  return {
    backgroundColor: tailwindColorToCSS(bgColor) || undefined,
    textColor: tailwindColorToCSS(textColor) || undefined,
  };
}

/**
 * Evaluate a single formatting rule against a cell value.
 */
function evaluateCondition(cellValue: string | null, operator: string, ruleValue: string): boolean {
  const val = cellValue ?? '';

  switch (operator) {
    case 'equals':
      return val === ruleValue;
    case 'not_equals':
      return val !== ruleValue;
    case 'contains':
      return val.toLowerCase().includes(ruleValue.toLowerCase());
    case 'is_empty':
      return !val || val.trim() === '';
    case 'is_not_empty':
      return !!val && val.trim() !== '';
    case 'greater_than':
      return parseFloat(val) > parseFloat(ruleValue);
    case 'less_than':
      return parseFloat(val) < parseFloat(ruleValue);
    case 'starts_with':
      return val.toLowerCase().startsWith(ruleValue.toLowerCase());
    default:
      return false;
  }
}

/**
 * Given an array of formatting rules and a row's cell data,
 * return a map of column_key → FormattingStyle for matching cells.
 * First matching rule per column wins.
 * Only evaluates cell-scoped rules (or rules without scope).
 */
export function evaluateFormattingRules(
  rules: FormattingRule[],
  cells: Record<string, { value: string | null }>,
): Record<string, FormattingStyle> {
  const result: Record<string, FormattingStyle> = {};

  for (const rule of rules) {
    // Skip row-scoped rules (handled by evaluateRowFormatting)
    if (rule.scope === 'row') continue;

    // Skip if we already matched a rule for this column
    if (result[rule.column_key]) continue;

    const cell = cells[rule.column_key];
    const cellValue = cell?.value ?? null;

    if (evaluateCondition(cellValue, rule.operator, rule.value)) {
      result[rule.column_key] = rule.style;
    }
  }

  return result;
}

/**
 * Evaluate row-scoped formatting rules against a row's cell data.
 * Returns the first matching row style, or null if no match.
 */
export function evaluateRowFormatting(
  rules: FormattingRule[],
  cells: Record<string, { value: string | null }>,
): FormattingStyle | null {
  for (const rule of rules) {
    if (rule.scope !== 'row') continue;

    const cell = cells[rule.column_key];
    const cellValue = cell?.value ?? null;

    if (evaluateCondition(cellValue, rule.operator, rule.value)) {
      return rule.style;
    }
  }

  return null;
}

/**
 * Convert a FormattingStyle to inline CSS properties.
 */
export function formattingStyleToCSS(style: FormattingStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.textColor) css.color = style.textColor;
  if (style.bold) css.fontWeight = 600;
  if (style.strikethrough) css.textDecoration = 'line-through';
  return css;
}
