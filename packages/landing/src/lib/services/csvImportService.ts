/**
 * CSV Import Service
 * Handles CSV parsing, column auto-detection, validation, and transformation
 */

import * as Papa from 'papaparse';
import { supabase } from '@/lib/supabase/clientV2';
import {
  AUTO_DETECT_PATTERNS,
  ValidationResult,
  ValidationIssue,
  ImportOptions,
  ImportResult,
  ColumnMapping,
} from '@/lib/types/csvImport';

// ============================================================================
// CSV PARSING
// ============================================================================

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

/**
 * Parse a CSV file and return headers and rows
 */
export function parseCSVFile(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          // Log errors but continue if we have some data
          console.warn('CSV parsing warnings:', results.errors);
        }

        const headers = results.meta.fields || [];
        const rows = (results.data as Record<string, string>[]).filter(
          (row) => Object.values(row).some((val) => val && val.trim())
        );

        resolve({
          headers,
          rows,
          totalRows: rows.length,
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}

// ============================================================================
// COLUMN AUTO-DETECTION
// ============================================================================

/**
 * Auto-detect column mappings based on header names
 * Returns a mapping of CSV column -> lead field
 */
export function autoDetectMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {};
  const usedLeadFields = new Set<string>();

  for (const header of headers) {
    const normalizedHeader = normalizeColumnName(header);

    for (const [leadField, patterns] of Object.entries(AUTO_DETECT_PATTERNS)) {
      // Skip if this lead field is already mapped
      if (usedLeadFields.has(leadField)) continue;

      const isMatch = patterns.some((pattern) => {
        const normalizedPattern = pattern.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          normalizedHeader === normalizedPattern ||
          normalizedHeader.includes(normalizedPattern) ||
          normalizedPattern.includes(normalizedHeader)
        );
      });

      if (isMatch) {
        mappings[header] = leadField;
        usedLeadFields.add(leadField);
        break;
      }
    }
  }

  return mappings;
}

/**
 * Normalize a column name for comparison
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Get sample values for a column (first 3 non-empty values)
 */
export function getSampleValues(
  rows: Record<string, string>[],
  columnName: string,
  maxSamples = 3
): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row[columnName]?.trim();
    if (value && !samples.includes(value)) {
      samples.push(value);
      if (samples.length >= maxSamples) break;
    }
  }
  return samples;
}

/**
 * Create column mappings with sample values
 */
export function createColumnMappings(
  headers: string[],
  rows: Record<string, string>[],
  autoMappings: Record<string, string>
): ColumnMapping[] {
  return headers.map((header) => ({
    csvColumn: header,
    leadField: autoMappings[header] || null,
    sampleValues: getSampleValues(rows, header),
    isAutoDetected: header in autoMappings,
  }));
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate the data before import
 */
export function validateImportData(
  rows: Record<string, string>[],
  mappings: Record<string, string>
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const emailSet = new Set<string>();
  const duplicateEmails: number[] = [];
  const invalidEmails: number[] = [];
  const missingRequired: number[] = [];

  // Check if email is mapped
  const emailColumn = Object.entries(mappings).find(
    ([, field]) => field === 'contact_email'
  )?.[0];
  const nameColumn = Object.entries(mappings).find(
    ([, field]) => field === 'contact_name'
  )?.[0];

  // Must have at least email or name mapped
  if (!emailColumn && !nameColumn) {
    errors.push({
      type: 'error',
      code: 'MISSING_EMAIL_MAPPING',
      message: 'You must map at least an Email or Full Name column',
      rowNumbers: [],
      count: 0,
    });
  }

  // Validate each row
  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 for 1-based index and header row

    // Check email if mapped
    if (emailColumn) {
      const email = row[emailColumn]?.trim().toLowerCase();
      if (email) {
        // Check for valid email format
        if (!isValidEmail(email)) {
          invalidEmails.push(rowNum);
        }
        // Check for duplicates within file
        else if (emailSet.has(email)) {
          duplicateEmails.push(rowNum);
        } else {
          emailSet.add(email);
        }
      } else if (!nameColumn || !row[nameColumn]?.trim()) {
        // Missing both email and name
        missingRequired.push(rowNum);
      }
    }
  });

  // Add validation issues
  if (invalidEmails.length > 0) {
    warnings.push({
      type: 'warning',
      code: 'INVALID_EMAIL_FORMAT',
      message: `${invalidEmails.length} row(s) have invalid email format - will be skipped`,
      rowNumbers: invalidEmails.slice(0, 10), // First 10 for display
      count: invalidEmails.length,
    });
  }

  if (duplicateEmails.length > 0) {
    warnings.push({
      type: 'warning',
      code: 'DUPLICATE_EMAIL',
      message: `${duplicateEmails.length} duplicate email(s) found - only first will be imported`,
      rowNumbers: duplicateEmails.slice(0, 10),
      count: duplicateEmails.length,
    });
  }

  if (missingRequired.length > 0) {
    warnings.push({
      type: 'warning',
      code: 'MISSING_REQUIRED_FIELD',
      message: `${missingRequired.length} row(s) missing email/name - will be skipped`,
      rowNumbers: missingRequired.slice(0, 10),
      count: missingRequired.length,
    });
  }

  const errorCount = invalidEmails.length + missingRequired.length;
  const validRows = rows.length - errorCount - duplicateEmails.length;

  return {
    isValid: errors.length === 0,
    totalRows: rows.length,
    validRows: Math.max(0, validRows),
    errors,
    warnings,
  };
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform a row using the column mappings
 */
export function transformRow(
  row: Record<string, string>,
  mappings: Record<string, string>
): Record<string, unknown> {
  const lead: Record<string, unknown> = {};
  const metadata: Record<string, string> = {};

  for (const [csvColumn, leadField] of Object.entries(mappings)) {
    const value = row[csvColumn]?.trim();
    if (!value) continue;

    if (leadField === '__skip__') {
      continue;
    } else if (leadField === '__metadata__') {
      metadata[csvColumn] = value;
    } else if (leadField === 'tags') {
      // Split comma-separated tags
      lead.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (leadField === 'contact_email') {
      lead.contact_email = value.toLowerCase();
    } else {
      lead[leadField] = value;
    }
  }

  // Store unmapped data in metadata
  if (Object.keys(metadata).length > 0) {
    lead.metadata = metadata;
  }

  return lead;
}

/**
 * Apply automatic transformations to a lead
 */
export function applyAutoTransformations(
  lead: Record<string, unknown>
): Record<string, unknown> {
  const transformed = { ...lead };

  // Auto-compute domain from email if not set
  if (transformed.contact_email && !transformed.domain) {
    transformed.domain = extractDomain(transformed.contact_email as string);
  }

  // Auto-split full name into first/last if not set
  if (
    transformed.contact_name &&
    !transformed.contact_first_name &&
    !transformed.contact_last_name
  ) {
    const { firstName, lastName } = splitName(transformed.contact_name as string);
    if (firstName) transformed.contact_first_name = firstName;
    if (lastName) transformed.contact_last_name = lastName;
  }

  // Auto-compute full name from first/last if not set
  if (
    !transformed.contact_name &&
    (transformed.contact_first_name || transformed.contact_last_name)
  ) {
    transformed.contact_name = [
      transformed.contact_first_name,
      transformed.contact_last_name,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // Normalize phone number
  if (transformed.contact_phone) {
    transformed.contact_phone = normalizePhone(transformed.contact_phone as string);
  }

  // Parse date fields
  const dateFields = ['meeting_start', 'meeting_end'];
  for (const field of dateFields) {
    if (transformed[field]) {
      const parsed = parseDate(transformed[field] as string);
      if (parsed) {
        transformed[field] = parsed;
      }
    }
  }

  return transformed;
}

/**
 * Extract domain from email
 */
function extractDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

/**
 * Split full name into first and last name
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Normalize phone number (remove non-digits except leading +)
 */
function normalizePhone(phone: string): string {
  // Preserve leading + for international numbers
  const hasPlus = phone.startsWith('+');
  const digits = phone.replace(/[^\d]/g, '');
  return hasPlus ? '+' + digits : digits;
}

/**
 * Parse date string into ISO format
 */
function parseDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// ============================================================================
// IMPORT EXECUTION
// ============================================================================

/**
 * Execute the import via edge function
 */
export async function executeImport(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  options: ImportOptions
): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke('import-router', {
    body: {
      action: 'leads_generic',
      rows,
      mappings,
      options,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to import leads');
  }

  return data as ImportResult;
}

/**
 * Transform all rows for preview
 */
export function transformRowsForPreview(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  maxRows = 5
): Record<string, unknown>[] {
  return rows.slice(0, maxRows).map((row) => {
    const transformed = transformRow(row, mappings);
    return applyAutoTransformations(transformed);
  });
}
