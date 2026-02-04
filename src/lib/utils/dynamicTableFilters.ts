import type {
  DynamicTableRow,
  DynamicTableColumn,
  FilterCondition,
  FilterOperator,
} from '@/lib/services/dynamicTableService';

// ---------------------------------------------------------------------------
// Operator metadata for dropdown UIs
// ---------------------------------------------------------------------------

export const FILTER_OPERATORS: {
  value: FilterOperator;
  label: string;
  description: string;
}[] = [
  { value: 'equals', label: 'Equals', description: 'Exact match (case-insensitive)' },
  { value: 'not_equals', label: 'Does not equal', description: 'Not an exact match' },
  { value: 'contains', label: 'Contains', description: 'Value contains the search text' },
  { value: 'not_contains', label: 'Does not contain', description: 'Value does not contain the search text' },
  { value: 'starts_with', label: 'Starts with', description: 'Value begins with the search text' },
  { value: 'ends_with', label: 'Ends with', description: 'Value ends with the search text' },
  { value: 'greater_than', label: 'Greater than', description: 'Value is greater than the given value' },
  { value: 'less_than', label: 'Less than', description: 'Value is less than the given value' },
  { value: 'is_empty', label: 'Is empty', description: 'Value is blank or missing' },
  { value: 'is_not_empty', label: 'Is not empty', description: 'Value is present' },
];

// ---------------------------------------------------------------------------
// Operators available per column type
// ---------------------------------------------------------------------------

const TEXT_OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
];

const NUMBER_OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
];

const DATE_OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
];

const BOOLEAN_OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'is_empty',
  'is_not_empty',
];

const COLUMN_TYPE_OPERATORS: Record<DynamicTableColumn['column_type'], FilterOperator[]> = {
  text: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  url: TEXT_OPERATORS,
  person: TEXT_OPERATORS,
  company: TEXT_OPERATORS,
  linkedin: TEXT_OPERATORS,
  enrichment: TEXT_OPERATORS,
  status: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
};

/**
 * Returns the filter operators that are applicable to the given column type.
 */
export function getOperatorsForColumnType(
  columnType: DynamicTableColumn['column_type'],
): FilterOperator[] {
  return COLUMN_TYPE_OPERATORS[columnType] ?? TEXT_OPERATORS;
}

// ---------------------------------------------------------------------------
// Cell value helpers
// ---------------------------------------------------------------------------

function getCellValue(row: DynamicTableRow, columnKey: string): string | null {
  return row.cells[columnKey]?.value ?? null;
}

function isEmpty(value: string | null): boolean {
  return value === null || value === undefined || value === '';
}

// ---------------------------------------------------------------------------
// Operator evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(
  cellValue: string | null,
  condition: FilterCondition,
  column: DynamicTableColumn | undefined,
): boolean {
  const { operator, value: conditionValue } = condition;
  const columnType = column?.column_type ?? 'text';

  // is_empty / is_not_empty don't need a comparison value
  if (operator === 'is_empty') {
    return isEmpty(cellValue);
  }
  if (operator === 'is_not_empty') {
    return !isEmpty(cellValue);
  }

  // For all other operators, a null/empty cell value means no match
  // (except equals with an empty condition value, handled by normal flow)
  const normalizedCell = (cellValue ?? '').toLowerCase();
  const normalizedCondition = conditionValue.toLowerCase();

  switch (operator) {
    case 'equals':
      return normalizedCell === normalizedCondition;

    case 'not_equals':
      return normalizedCell !== normalizedCondition;

    case 'contains':
      return normalizedCell.includes(normalizedCondition);

    case 'not_contains':
      return !normalizedCell.includes(normalizedCondition);

    case 'starts_with':
      return normalizedCell.startsWith(normalizedCondition);

    case 'ends_with':
      return normalizedCell.endsWith(normalizedCondition);

    case 'greater_than':
      return compareValues(cellValue, conditionValue, columnType) > 0;

    case 'less_than':
      return compareValues(cellValue, conditionValue, columnType) < 0;

    default:
      return false;
  }
}

/**
 * Compare two values with awareness of column type.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareValues(
  a: string | null,
  b: string,
  columnType: DynamicTableColumn['column_type'],
): number {
  if (a === null || a === '') return -1;

  if (columnType === 'number') {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    // Fall through to string comparison if parsing fails
  }

  if (columnType === 'date') {
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      return dateA.getTime() - dateB.getTime();
    }
    // Fall through to string comparison if parsing fails
  }

  // Default: lexicographic string comparison
  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------

/**
 * Applies an array of filter conditions to the given rows using AND logic.
 * Returns only the rows that satisfy every condition.
 *
 * An empty conditions array returns all rows unchanged.
 */
export function applyFilters(
  rows: DynamicTableRow[],
  conditions: FilterCondition[],
  columns: DynamicTableColumn[],
): DynamicTableRow[] {
  if (conditions.length === 0) {
    return rows;
  }

  // Build a quick lookup map for columns by key
  const columnMap = new Map<string, DynamicTableColumn>();
  for (const col of columns) {
    columnMap.set(col.key, col);
  }

  return rows.filter((row) =>
    conditions.every((condition) => {
      const cellValue = getCellValue(row, condition.column_key);
      const column = columnMap.get(condition.column_key);
      return evaluateCondition(cellValue, condition, column);
    }),
  );
}
