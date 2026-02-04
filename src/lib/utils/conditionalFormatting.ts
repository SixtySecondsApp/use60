// ---------------------------------------------------------------------------
// Conditional Formatting — evaluate rules and return cell styles
// ---------------------------------------------------------------------------

export interface FormattingRule {
  id: string;
  column_key: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty' | 'greater_than' | 'less_than' | 'starts_with';
  value: string;
  style: FormattingStyle;
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
 */
export function evaluateFormattingRules(
  rules: FormattingRule[],
  cells: Record<string, { value: string | null }>,
): Record<string, FormattingStyle> {
  const result: Record<string, FormattingStyle> = {};

  for (const rule of rules) {
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
