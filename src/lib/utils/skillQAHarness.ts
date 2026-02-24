/**
 * Skill QA Harness
 * 
 * Validates skills and sequences against real org data and validates contracts.
 * Used for staging/testing to ensure production readiness.
 */

import { supabase } from '../supabase/clientV2';
import type { PlatformSkill } from '@/lib/services/platformSkillService';
import { evaluateReadiness, type ReadinessCheck, type CapabilityStatus } from './skillReadiness';
import type { SkillResult } from '@/lib/mcp/skillsProvider';

export interface QAResult {
  skill_key: string;
  skill_name: string;
  category: string;
  is_sequence: boolean;
  readiness: ReadinessCheck;
  execution_test?: ExecutionTestResult;
  contract_validation?: ContractValidationResult;
  overall_status: 'pass' | 'fail' | 'warning';
}

export interface ExecutionTestResult {
  success: boolean;
  execution_time_ms: number;
  error?: string;
  steps_completed?: number;
  steps_total?: number;
  capabilities_used: string[];
  providers_used: string[];
}

export interface ContractValidationResult {
  has_output_contract: boolean;
  output_keys_match: boolean;
  required_keys_present: string[];
  missing_keys: string[];
  extra_keys: string[];
}

/**
 * Run QA tests for a skill or sequence
 */
export async function runSkillQA(
  skill: PlatformSkill,
  organizationId: string,
  capabilities: CapabilityStatus[],
  testContext?: Record<string, unknown>
): Promise<QAResult> {
  const readiness = evaluateReadiness(skill, capabilities);
  const isSequence = skill.category === 'agent-sequence';

  // Execution test (if skill is active and ready)
  let executionTest: ExecutionTestResult | undefined;
  let contractValidation: ContractValidationResult | undefined;

  if (readiness.isReady && skill.is_active) {
    try {
      executionTest = await testSkillExecution(skill, organizationId, testContext);
      
      if (executionTest.success && executionTest.result) {
        contractValidation = validateContract(skill, executionTest.result);
      }
    } catch (error) {
      executionTest = {
        success: false,
        execution_time_ms: 0,
        error: error instanceof Error ? error.message : String(error),
        capabilities_used: [],
        providers_used: [],
      };
    }
  }

  // Determine overall status
  let overallStatus: 'pass' | 'fail' | 'warning' = 'pass';
  if (!readiness.isReady || readiness.issues.some(i => i.severity === 'error')) {
    overallStatus = 'fail';
  } else if (readiness.issues.some(i => i.severity === 'warning') || executionTest?.success === false) {
    overallStatus = 'warning';
  }

  return {
    skill_key: skill.skill_key,
    skill_name: skill.frontmatter.name || skill.skill_key,
    category: skill.category,
    is_sequence: isSequence,
    readiness,
    execution_test: executionTest,
    contract_validation: contractValidation,
    overall_status: overallStatus,
  };
}

/**
 * Test skill execution with real org data
 */
async function testSkillExecution(
  skill: PlatformSkill,
  organizationId: string,
  testContext?: Record<string, unknown>
): Promise<ExecutionTestResult & { result?: any }> {
  const startTime = Date.now();
  const isSequence = skill.category === 'agent-sequence';

  try {
    if (isSequence) {
      // Test sequence execution
      const { data, error } = await supabase.functions.invoke('api-sequence-execute', {
        body: {
          sequence_key: skill.skill_key,
          organization_id: organizationId,
          sequence_context: testContext || {},
          is_simulation: true, // Use simulation mode for QA
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Sequence execution failed');
      }

      const executionTime = Date.now() - startTime;
      const stepResults = data.step_results || [];
      const capabilitiesUsed = new Set<string>();
      const providersUsed = new Set<string>();

      // Extract capability/provider info from step results
      for (const step of stepResults) {
        if (step.meta?.capability) capabilitiesUsed.add(step.meta.capability);
        if (step.meta?.provider) providersUsed.add(step.meta.provider);
      }

      return {
        success: true,
        execution_time_ms: executionTime,
        steps_completed: stepResults.filter((s: any) => s.status === 'success').length,
        steps_total: stepResults.length,
        capabilities_used: Array.from(capabilitiesUsed),
        providers_used: Array.from(providersUsed),
        result: data.final_output,
      };
    } else {
      // Test skill execution
      const { data, error } = await supabase.functions.invoke('api-skill-execute', {
        body: {
          skill_key: skill.skill_key,
          organization_id: organizationId,
          skill_context: testContext || {},
          dry_run: true, // Use dry run for QA
        },
      });

      if (error) throw error;
      if (!data || data.status === 'failed') {
        throw new Error(data?.error || 'Skill execution failed');
      }

      const executionTime = Date.now() - startTime;
      const capabilitiesUsed: string[] = [];
      const providersUsed: string[] = [];

      if (data.meta?.capability) capabilitiesUsed.push(data.meta.capability);
      if (data.meta?.provider) providersUsed.push(data.meta.provider);

      return {
        success: true,
        execution_time_ms: executionTime,
        capabilities_used: capabilitiesUsed,
        providers_used: providersUsed,
        result: data.data,
      };
    }
  } catch (error) {
    return {
      success: false,
      execution_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      capabilities_used: [],
      providers_used: [],
    };
  }
}

/**
 * Validate that skill output matches declared contract
 */
function validateContract(skill: PlatformSkill, result: any): ContractValidationResult {
  const declaredOutputs = (skill.frontmatter.outputs || []) as string[];
  const hasOutputContract = declaredOutputs.length > 0;

  if (!hasOutputContract) {
    return {
      has_output_contract: false,
      output_keys_match: false,
      required_keys_present: [],
      missing_keys: [],
      extra_keys: Object.keys(result || {}),
    };
  }

  // Extract keys from result (handle nested objects)
  const resultKeys = extractKeys(result || {});
  const declaredSet = new Set(declaredOutputs);
  const resultSet = new Set(resultKeys);

  const requiredKeysPresent = declaredOutputs.filter(key => resultSet.has(key));
  const missingKeys = declaredOutputs.filter(key => !resultSet.has(key));
  const extraKeys = resultKeys.filter(key => !declaredSet.has(key));

  return {
    has_output_contract: true,
    output_keys_match: missingKeys.length === 0,
    required_keys_present: requiredKeysPresent,
    missing_keys: missingKeys,
    extra_keys: extraKeys,
  };
}

/**
 * Extract all keys from a nested object
 */
function extractKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  
  if (obj === null || obj === undefined) return keys;
  
  if (Array.isArray(obj)) {
    // For arrays, check first element if it's an object
    if (obj.length > 0 && typeof obj[0] === 'object') {
      obj[0] && extractKeys(obj[0], prefix).forEach(k => keys.push(k));
    }
    return keys;
  }
  
  if (typeof obj !== 'object') return keys;
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      extractKeys(value, fullKey).forEach(k => keys.push(k));
    }
  }
  
  return keys;
}

/**
 * Run QA for all skills in a category
 */
export async function runCategoryQA(
  category: string,
  organizationId: string,
  capabilities: CapabilityStatus[]
): Promise<QAResult[]> {
  const { data: skills, error } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('category', category)
    .eq('is_active', true);

  if (error) throw error;
  if (!skills) return [];

  const results: QAResult[] = [];
  for (const skill of skills) {
    const qaResult = await runSkillQA(skill as PlatformSkill, organizationId, capabilities);
    results.push(qaResult);
  }

  return results;
}

/**
 * Generate QA report summary
 */
export function generateQAReport(results: QAResult[]): {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  by_category: Record<string, { total: number; passed: number; failed: number; warnings: number }>;
  issues: Array<{ skill_key: string; issue: string; severity: 'error' | 'warning' }>;
} {
  const byCategory: Record<string, { total: number; passed: number; failed: number; warnings: number }> = {};
  const issues: Array<{ skill_key: string; issue: string; severity: 'error' | 'warning' }> = [];

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const result of results) {
    // Update category stats
    if (!byCategory[result.category]) {
      byCategory[result.category] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }
    byCategory[result.category].total++;
    
    if (result.overall_status === 'pass') {
      passed++;
      byCategory[result.category].passed++;
    } else if (result.overall_status === 'fail') {
      failed++;
      byCategory[result.category].failed++;
    } else {
      warnings++;
      byCategory[result.category].warnings++;
    }

    // Collect issues
    for (const issue of result.readiness.issues) {
      issues.push({
        skill_key: result.skill_key,
        issue: issue.message,
        severity: issue.severity,
      });
    }

    if (result.execution_test && !result.execution_test.success) {
      issues.push({
        skill_key: result.skill_key,
        issue: `Execution failed: ${result.execution_test.error}`,
        severity: 'error',
      });
    }

    if (result.contract_validation && !result.contract_validation.output_keys_match) {
      issues.push({
        skill_key: result.skill_key,
        issue: `Contract mismatch: missing keys ${result.contract_validation.missing_keys.join(', ')}`,
        severity: 'warning',
      });
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    warnings,
    by_category: byCategory,
    issues,
  };
}
