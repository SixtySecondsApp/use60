#!/usr/bin/env tsx
/**
 * Enrichment Validation Script
 *
 * Automated validation of the enhanced organization enrichment system.
 * Tests company-research skill integration against baseline expectations.
 *
 * Usage:
 *   npm run validate-enrichment
 *   npm run validate-enrichment -- --case small_startup
 *   npm run validate-enrichment -- --verbose
 *
 * Requires:
 *   - .env.development with FEATURE_ENHANCED_RESEARCH=true
 *   - Development environment running (npm run dev)
 *   - Edge function deployed to development
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Load test cases
const testCasesPath = path.join(__dirname, 'test-enrichment-cases.json');
const testConfig = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));

// Command line arguments
const args = process.argv.slice(2);
const specificCase = args.find(a => a.startsWith('--case='))?.split('=')[1];
const verbose = args.includes('--verbose') || args.includes('-v');

// ============================================================================
// Types
// ============================================================================

interface TestCase {
  id: string;
  name: string;
  domain: string;
  expected_completeness: number;
  expected_source: string;
  expected_status?: string;
  expected_fields?: Record<string, any>;
  allow_failure?: boolean;
  timeout_seconds: number;
}

interface EnrichmentResult {
  enrichment_id: string;
  status: string;
  enrichment_source: string;
  duration_seconds: number;
  completeness: number;
  fields_populated: number;
  total_fields: number;
  context_variables: number;
  new_variables: string[];
  errors: string[];
}

interface ValidationResult {
  test_id: string;
  test_name: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  enrichment: EnrichmentResult | null;
  duration_ms: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function log(message: string, level: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️ '
  };
  console.log(`${icons[level]} ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Execution
// ============================================================================

async function triggerEnrichment(domain: string, testOrgId: string): Promise<string> {
  log(`Triggering enrichment for ${domain}...`, 'info');

  const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
    body: {
      action: 'start',
      organization_id: testOrgId,
      domain: domain
    }
  });

  if (error) {
    throw new Error(`Failed to trigger enrichment: ${error.message}`);
  }

  if (!data || !data.enrichment_id) {
    throw new Error('No enrichment_id returned');
  }

  return data.enrichment_id;
}

async function pollEnrichmentStatus(
  enrichmentId: string,
  timeoutSeconds: number
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const { data: enrichment, error } = await supabase
      .from('organization_enrichment')
      .select('*')
      .eq('id', enrichmentId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch enrichment: ${error.message}`);
    }

    if (enrichment.status === 'completed' || enrichment.status === 'error') {
      // Calculate completeness
      const fields = [
        'company_name', 'tagline', 'description', 'industry', 'employee_count',
        'products', 'value_propositions', 'competitors', 'target_market',
        'key_people', 'founded_year', 'headquarters', 'funding_status',
        'funding_rounds', 'investors', 'review_ratings', 'recent_news',
        'buying_signals_detected', 'company_milestones'
      ];

      const populated = fields.filter(field => {
        const value = enrichment[field];
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
        return value !== null && value !== undefined && value !== '';
      });

      const completeness = Math.round((populated.length / fields.length) * 100);

      // Get context variables
      const { data: contextVars } = await supabase
        .from('organization_context')
        .select('key')
        .eq('organization_id', enrichment.organization_id);

      const newVariables = testConfig.validation_rules.required_new_variables.filter(
        (v: string) => contextVars?.some((cv: any) => cv.key === v)
      );

      const durationSeconds = Math.round(
        (new Date(enrichment.updated_at).getTime() - new Date(enrichment.created_at).getTime()) / 1000
      );

      return {
        enrichment_id: enrichmentId,
        status: enrichment.status,
        enrichment_source: enrichment.enrichment_source || 'unknown',
        duration_seconds: durationSeconds,
        completeness,
        fields_populated: populated.length,
        total_fields: fields.length,
        context_variables: contextVars?.length || 0,
        new_variables: newVariables,
        errors: enrichment.status === 'error' ? [enrichment.error_message || 'Unknown error'] : []
      };
    }

    if (verbose) {
      log(`Status: ${enrichment.status}, waiting...`, 'info');
    }

    await sleep(2000); // Poll every 2 seconds
  }

  throw new Error(`Enrichment timed out after ${timeoutSeconds} seconds`);
}

async function validateTestCase(testCase: TestCase): Promise<ValidationResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    log(`\n${'='.repeat(80)}`, 'info');
    log(`Test Case: ${testCase.name}`, 'info');
    log(`Domain: ${testCase.domain}`, 'info');
    log(`${'='.repeat(80)}`, 'info');

    // Create test organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `Test Org - ${testCase.id}`,
        domain: testCase.domain,
        is_test: true
      })
      .select()
      .single();

    if (orgError || !org) {
      throw new Error(`Failed to create test organization: ${orgError?.message}`);
    }

    log(`Created test organization: ${org.id}`, 'success');

    // Trigger enrichment
    const enrichmentId = await triggerEnrichment(testCase.domain, org.id);
    log(`Enrichment started: ${enrichmentId}`, 'success');

    // Poll for completion
    const result = await pollEnrichmentStatus(enrichmentId, testCase.timeout_seconds);
    log(`Enrichment completed in ${result.duration_seconds}s`, 'success');

    // Validate results
    if (testCase.expected_source && result.enrichment_source !== testCase.expected_source) {
      if (!testCase.allow_failure) {
        errors.push(
          `Expected enrichment_source '${testCase.expected_source}', got '${result.enrichment_source}'`
        );
      } else {
        warnings.push(
          `Enrichment source mismatch (allowed): expected '${testCase.expected_source}', got '${result.enrichment_source}'`
        );
      }
    }

    if (testCase.expected_status && result.status !== testCase.expected_status) {
      if (!testCase.allow_failure) {
        errors.push(`Expected status '${testCase.expected_status}', got '${result.status}'`);
      } else {
        warnings.push(
          `Status mismatch (allowed): expected '${testCase.expected_status}', got '${result.status}'`
        );
      }
    }

    if (result.completeness < testCase.expected_completeness && !testCase.allow_failure) {
      errors.push(
        `Completeness below target: ${result.completeness}% < ${testCase.expected_completeness}%`
      );
    }

    // Validate specific fields
    if (testCase.expected_fields) {
      const { data: enrichment } = await supabase
        .from('organization_enrichment')
        .select('*')
        .eq('id', enrichmentId)
        .single();

      for (const [field, expected] of Object.entries(testCase.expected_fields)) {
        const actual = enrichment?.[field];

        if (expected === true) {
          // Just check presence
          if (!actual || (Array.isArray(actual) && actual.length === 0)) {
            warnings.push(`Field '${field}' not populated`);
          }
        } else if (typeof expected === 'object' && Array.isArray(expected)) {
          // Check array contents
          if (!actual || !Array.isArray(actual)) {
            errors.push(`Field '${field}' should be an array`);
          }
        } else {
          // Check exact value or substring match
          const actualStr = JSON.stringify(actual);
          const expectedStr = JSON.stringify(expected);
          if (!actualStr.includes(expectedStr)) {
            warnings.push(`Field '${field}' mismatch: expected '${expectedStr}', got '${actualStr}'`);
          }
        }
      }
    }

    // Validate new context variables (for skill_research)
    if (result.enrichment_source === 'skill_research') {
      const minNewVars = testConfig.validation_rules.min_new_context_variables;
      if (result.new_variables.length < minNewVars) {
        warnings.push(
          `Only ${result.new_variables.length}/${minNewVars} new context variables populated`
        );
      }
    }

    // Print results
    log(`\nResults:`, 'info');
    log(`  Status: ${result.status}`, 'info');
    log(`  Source: ${result.enrichment_source}`, 'info');
    log(`  Completeness: ${result.completeness}% (${result.fields_populated}/${result.total_fields})`, 'info');
    log(`  Duration: ${result.duration_seconds}s`, 'info');
    log(`  Context Variables: ${result.context_variables}`, 'info');
    log(`  New Variables: ${result.new_variables.length} (${result.new_variables.join(', ')})`, 'info');

    if (errors.length > 0) {
      log(`\nErrors:`, 'error');
      errors.forEach(err => log(`  - ${err}`, 'error'));
    }

    if (warnings.length > 0) {
      log(`\nWarnings:`, 'warn');
      warnings.forEach(warn => log(`  - ${warn}`, 'warn'));
    }

    // Cleanup test organization
    await supabase.from('organizations').delete().eq('id', org.id);
    log(`Cleaned up test organization`, 'success');

    const passed = errors.length === 0;
    log(`\nTest ${passed ? 'PASSED' : 'FAILED'}`, passed ? 'success' : 'error');

    return {
      test_id: testCase.id,
      test_name: testCase.name,
      passed,
      errors,
      warnings,
      enrichment: result,
      duration_ms: Date.now() - startTime
    };

  } catch (error: any) {
    errors.push(error.message);
    log(`\nTest FAILED: ${error.message}`, 'error');

    return {
      test_id: testCase.id,
      test_name: testCase.name,
      passed: false,
      errors,
      warnings,
      enrichment: null,
      duration_ms: Date.now() - startTime
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log('Enrichment Validation Script', 'info');
  log('='.repeat(80), 'info');

  // Select test cases
  let testCases: TestCase[] = testConfig.test_cases;
  if (specificCase) {
    testCases = testCases.filter((tc: TestCase) => tc.id === specificCase);
    if (testCases.length === 0) {
      log(`No test case found with id '${specificCase}'`, 'error');
      process.exit(1);
    }
  }

  log(`Running ${testCases.length} test case(s)...`, 'info');

  // Run tests sequentially
  const results: ValidationResult[] = [];
  for (const testCase of testCases) {
    const result = await validateTestCase(testCase);
    results.push(result);
  }

  // Summary
  log(`\n${'='.repeat(80)}`, 'info');
  log('SUMMARY', 'info');
  log(`${'='.repeat(80)}`, 'info');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  log(`Total: ${results.length}`, 'info');
  log(`Passed: ${passed}`, passed > 0 ? 'success' : 'info');
  log(`Failed: ${failed}`, failed > 0 ? 'error' : 'info');

  // Detailed results
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    log(`${icon} ${result.test_name} (${result.duration_ms}ms)`, result.passed ? 'success' : 'error');

    if (result.enrichment) {
      log(`   Completeness: ${result.enrichment.completeness}%`, 'info');
      log(`   Duration: ${result.enrichment.duration_seconds}s`, 'info');
      log(`   Source: ${result.enrichment.enrichment_source}`, 'info');
    }
  });

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
