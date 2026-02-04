// Re-export parseCSVFile from existing service
export { parseCSVFile } from './csvImportService';

// Column type auto-detection
export type OpsColumnType = 'text' | 'email' | 'url' | 'number' | 'boolean' | 'person' | 'company' | 'linkedin' | 'date';

export interface DetectedColumn {
  key: string;           // sanitized key (lowercase, underscored)
  label: string;         // original header name
  type: OpsColumnType;
  included: boolean;     // default true
  sampleValues: string[]; // first 3 non-empty values
}

/**
 * Auto-detect column type from header name and sample values
 */
export function autoDetectColumnType(header: string, sampleValues: string[]): OpsColumnType {
  const h = header.toLowerCase().trim();
  const samples = sampleValues.filter(v => v?.trim());

  // Email patterns
  if (h.includes('email') || h.includes('e-mail') || h === 'mail') return 'email';
  if (samples.length > 0 && samples.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return 'email';

  // LinkedIn patterns
  if (h.includes('linkedin') || h.includes('li_url') || h.includes('li url')) return 'linkedin';
  if (samples.length > 0 && samples.every(v => v.includes('linkedin.com'))) return 'linkedin';

  // URL patterns (after linkedin check)
  if (h.includes('url') || h.includes('website') || h.includes('link') || h === 'domain') return 'url';
  if (samples.length > 0 && samples.every(v => /^https?:\/\//.test(v))) return 'url';

  // Person name patterns
  if (h.includes('name') && !h.includes('company') && !h.includes('org')) return 'person';
  if (h === 'first_name' || h === 'last_name' || h === 'full_name' || h === 'firstname' || h === 'lastname') return 'person';
  if (h === 'contact' || h === 'person') return 'person';

  // Company patterns
  if (h.includes('company') || h.includes('organization') || h.includes('org_name') || h === 'employer' || h === 'business') return 'company';

  // Number patterns
  if (h.includes('count') || h.includes('amount') || h.includes('revenue') || h.includes('size') || h.includes('employees') || h.includes('headcount') || h === 'age' || h === 'score') return 'number';
  if (samples.length > 0 && samples.every(v => /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, '')))) return 'number';

  // Date patterns
  if (h.includes('date') || h.includes('created') || h.includes('updated') || h === 'timestamp' || h === 'time') return 'date';
  if (samples.length > 0 && samples.every(v => !isNaN(Date.parse(v)) && v.length > 4)) return 'date';

  // Boolean patterns
  if (h.includes('is_') || h.includes('has_') || h.includes('verified') || h.includes('active') || h.includes('enabled')) return 'boolean';
  if (samples.length > 0 && samples.every(v => ['true', 'false', 'yes', 'no', '0', '1'].includes(v.toLowerCase()))) return 'boolean';

  return 'text';
}

/**
 * Sanitize header into a valid column key
 */
export function sanitizeColumnKey(header: string, existingKeys: Set<string>): string {
  let key = header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_+|_+$/g, '')       // Trim leading/trailing underscores
    .replace(/_+/g, '_');           // Collapse multiple underscores

  if (!key) key = 'column';

  // Deduplicate
  let finalKey = key;
  let counter = 1;
  while (existingKeys.has(finalKey)) {
    finalKey = `${key}_${counter}`;
    counter++;
  }

  return finalKey;
}

/**
 * Detect columns from CSV headers and sample data
 */
export function detectColumns(headers: string[], rows: Record<string, string>[]): DetectedColumn[] {
  const existingKeys = new Set<string>();

  return headers.map(header => {
    // Get sample values (first 3 non-empty)
    const sampleValues: string[] = [];
    for (const row of rows) {
      const val = row[header]?.trim();
      if (val && sampleValues.length < 3) {
        sampleValues.push(val);
      }
      if (sampleValues.length >= 3) break;
    }

    const key = sanitizeColumnKey(header, existingKeys);
    existingKeys.add(key);

    return {
      key,
      label: header,
      type: autoDetectColumnType(header, sampleValues),
      included: true,
      sampleValues,
    };
  });
}

/**
 * Transform parsed CSV rows into OpsTableService.addRows() format
 *
 * @param rows - Raw CSV rows (header -> value)
 * @param columns - Column definitions with key mapping
 * @returns Array of { cells: Record<string, string> } for addRows()
 */
export function transformRowsForOpsTable(
  rows: Record<string, string>[],
  columns: DetectedColumn[]
): { cells: Record<string, string> }[] {
  const includedColumns = columns.filter(c => c.included);

  // Map: original header -> column key
  const headerToKey = new Map<string, string>();
  for (const col of includedColumns) {
    headerToKey.set(col.label, col.key);
  }

  return rows.map(row => {
    const cells: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = headerToKey.get(header);
      if (key && value != null) {
        cells[key] = String(value).trim();
      }
    }
    return { cells };
  });
}
