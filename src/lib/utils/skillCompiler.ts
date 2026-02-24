/**
 * Skill Compiler - Variable interpolation and reference resolution for platform skill templates
 *
 * Supports the following variable syntax:
 * - ${variable_name}              - Simple substitution
 * - ${variable_name|'default'}    - With default value
 * - ${products[0].name}           - Array/object access
 * - ${competitors|join(', ')}     - Formatter: join array
 * - ${company_name|upper}         - Formatter: uppercase
 * - ${company_name|lower}         - Formatter: lowercase
 * - ${products|first}             - Formatter: first element of array
 * - ${products|last}              - Formatter: last element of array
 * - ${products|count}             - Formatter: array length
 *
 * Supports the following reference syntax:
 * - @folder/document.md           - Reference to a document in a folder
 * - @document.md                  - Reference to a document at root level
 * - @skill-key                    - Reference to another skill's content
 * - {variable_name}               - Short variable syntax (in addition to ${})
 */

import { parseReferences, type ParsedReference } from '@/lib/types/skills';

export interface CompilationResult {
  success: boolean;
  content: string;
  frontmatter: Record<string, unknown>;
  missingVariables: string[];
  unresolvedReferences: UnresolvedReference[];
  warnings: string[];
}

/**
 * Unresolved reference details
 */
export interface UnresolvedReference {
  type: 'document' | 'skill' | 'variable';
  text: string;
  path?: string;
  reason: string;
}

/**
 * Context for resolving @ references
 */
export interface ReferenceContext {
  /** Documents available for resolution (keyed by path) */
  documents: Map<string, { title: string; content: string }>;
  /** Skills available for resolution (keyed by skill_key) */
  skills: Map<string, { name: string; content: string }>;
}

export interface OrganizationContext {
  [key: string]: unknown;
}

/**
 * Empty reference context for when no references need resolution
 */
export const EMPTY_REFERENCE_CONTEXT: ReferenceContext = {
  documents: new Map(),
  skills: new Map(),
};

/**
 * Navigate a path like 'products[0].name' or 'competitors' in an object
 */
function navigatePath(path: string, context: OrganizationContext): unknown {
  if (!path || !context) return undefined;

  // Handle array index notation: products[0] -> products.0
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalizedPath.split('.');

  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      // Handle array index
      if (Array.isArray(current) && /^\d+$/.test(part)) {
        current = current[parseInt(part, 10)];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Apply a modifier/formatter to a value
 */
function applyModifier(value: unknown, modifier: string): unknown {
  if (value === null || value === undefined) {
    // Check for default value: 'default text'
    const defaultMatch = modifier.match(/^'([^']*)'$/);
    if (defaultMatch) {
      return defaultMatch[1];
    }
    return value;
  }

  // Modifiers
  switch (modifier.toLowerCase()) {
    case 'upper':
      return String(value).toUpperCase();

    case 'lower':
      return String(value).toLowerCase();

    case 'capitalize':
      return String(value)
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    case 'first':
      if (Array.isArray(value)) {
        return value[0];
      }
      return value;

    case 'last':
      if (Array.isArray(value)) {
        return value[value.length - 1];
      }
      return value;

    case 'count':
      if (Array.isArray(value)) {
        return value.length;
      }
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length;
      }
      return 1;

    case 'json':
      return JSON.stringify(value, null, 2);

    default:
      // Check for join(separator)
      const joinMatch = modifier.match(/^join\(['"]?([^'"]*?)['"]?\)$/i);
      if (joinMatch && Array.isArray(value)) {
        return value.join(joinMatch[1]);
      }

      // Check for default value: 'default text'
      const defaultMatch = modifier.match(/^'([^']*)'$/);
      if (defaultMatch && (value === null || value === undefined)) {
        return defaultMatch[1];
      }

      // Check for slice(start, end)
      const sliceMatch = modifier.match(/^slice\((\d+)(?:,\s*(\d+))?\)$/i);
      if (sliceMatch && Array.isArray(value)) {
        const start = parseInt(sliceMatch[1], 10);
        const end = sliceMatch[2] ? parseInt(sliceMatch[2], 10) : undefined;
        return value.slice(start, end);
      }

      return value;
  }
}

/**
 * Evaluate a full expression like 'products[0].name|upper' or 'company_name|\'Unknown\''
 */
function evaluateExpression(
  expr: string,
  context: OrganizationContext
): { value: string | null; variableName: string } {
  // Split by pipe, but handle escaped pipes and pipes within function calls
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if ((char === "'" || char === '"') && expr[i - 1] !== '\\') {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
    }

    if (!inQuote) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
    }

    if (char === '|' && parenDepth === 0 && !inQuote) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());

  const [path, ...modifiers] = parts;
  const variableName = path.split('[')[0].split('.')[0]; // Get base variable name

  // Navigate to get the value
  let value = navigatePath(path, context);

  // Apply modifiers in sequence
  for (const mod of modifiers) {
    value = applyModifier(value, mod);
  }

  // Convert to string for output
  if (value === null || value === undefined) {
    return { value: null, variableName };
  }

  if (typeof value === 'object') {
    return { value: JSON.stringify(value), variableName };
  }

  return { value: String(value), variableName };
}

/**
 * Resolve @ references in content
 *
 * @param content - Content with @ references
 * @param referenceContext - Context containing documents and skills for resolution
 * @returns Object with resolved content and unresolved references
 */
export function resolveReferences(
  content: string,
  referenceContext: ReferenceContext
): { content: string; unresolvedReferences: UnresolvedReference[] } {
  const unresolvedReferences: UnresolvedReference[] = [];

  // Parse all references from content
  const references = parseReferences(content);

  // Sort by start position descending so we replace from end to start
  // This preserves position indexes as we replace
  const sortedRefs = [...references]
    .filter((ref) => ref.type === 'document' || ref.type === 'skill')
    .sort((a, b) => b.start - a.start);

  let resolvedContent = content;

  for (const ref of sortedRefs) {
    const path = ref.path || '';

    if (ref.type === 'document') {
      // Try to resolve document reference
      const doc = referenceContext.documents.get(path);

      if (doc) {
        // Replace the @ reference with the document content
        resolvedContent =
          resolvedContent.slice(0, ref.start) +
          doc.content +
          resolvedContent.slice(ref.end);
      } else {
        // Track unresolved document reference
        unresolvedReferences.push({
          type: 'document',
          text: ref.text,
          path: path,
          reason: `Document '${path}' not found`,
        });
      }
    } else if (ref.type === 'skill') {
      // Try to resolve skill reference
      const skill = referenceContext.skills.get(path);

      if (skill) {
        // Replace the @ reference with the skill content
        resolvedContent =
          resolvedContent.slice(0, ref.start) +
          skill.content +
          resolvedContent.slice(ref.end);
      } else {
        // Track unresolved skill reference
        unresolvedReferences.push({
          type: 'skill',
          text: ref.text,
          path: path,
          reason: `Skill '${path}' not found`,
        });
      }
    }
  }

  return { content: resolvedContent, unresolvedReferences };
}

/**
 * Resolve {variable} short syntax (without $)
 *
 * @param content - Content with {variable} syntax
 * @param context - Organization context for variable resolution
 * @returns Object with resolved content and missing variables
 */
export function resolveShortVariables(
  content: string,
  context: OrganizationContext
): { content: string; missingVariables: string[] } {
  const missingVariables: string[] = [];

  // Match {variable_name} but NOT ${variable_name} (which is handled separately)
  // Use negative lookbehind to exclude $ prefix
  const shortVarRegex = /(?<!\$)\{([\w_]+)\}/g;

  const resolved = content.replace(shortVarRegex, (match, varName) => {
    const value = context[varName];

    if (value === null || value === undefined) {
      missingVariables.push(varName);
      return match; // Keep original if not found
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  });

  return { content: resolved, missingVariables };
}

/**
 * Compile a skill template by interpolating organization context
 *
 * @param template - The skill template with ${variable} placeholders
 * @param context - Organization context key-value pairs
 * @param referenceContext - Optional context for resolving @ references
 * @returns Compiled content with variables replaced
 */
export function compileSkillTemplate(
  template: string,
  context: OrganizationContext,
  referenceContext: ReferenceContext = EMPTY_REFERENCE_CONTEXT
): CompilationResult {
  const missingVariables: string[] = [];
  const warnings: string[] = [];
  const usedVariables = new Set<string>();
  let unresolvedReferences: UnresolvedReference[] = [];

  let compiled = template;

  // Step 1: Resolve @ references first (documents and skills)
  const refResult = resolveReferences(compiled, referenceContext);
  compiled = refResult.content;
  unresolvedReferences = refResult.unresolvedReferences;

  // Step 2: Resolve {variable} short syntax
  const shortVarResult = resolveShortVariables(compiled, context);
  compiled = shortVarResult.content;
  missingVariables.push(...shortVarResult.missingVariables);

  // Step 3: Resolve ${variable} syntax with modifiers
  compiled = compiled.replace(/\$\{([^}]+)\}/g, (match, expression) => {
    const { value, variableName } = evaluateExpression(expression.trim(), context);
    usedVariables.add(variableName);

    if (value === null) {
      // Check if there's a default value in the expression
      if (!expression.includes("'") && !expression.includes('"')) {
        missingVariables.push(variableName);
      }
      return match; // Keep original placeholder if no value and no default
    }

    return value;
  });

  // Check if any placeholders remain (indicates missing variables)
  const remainingPlaceholders = compiled.match(/\$\{([^}]+)\}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    warnings.push(
      `${remainingPlaceholders.length} unresolved \${variable} placeholder(s) in compiled content`
    );
  }

  // Check for remaining short variable syntax
  const remainingShortVars = compiled.match(/(?<!\$)\{([\w_]+)\}/g);
  if (remainingShortVars && remainingShortVars.length > 0) {
    warnings.push(
      `${remainingShortVars.length} unresolved {variable} placeholder(s) in compiled content`
    );
  }

  // Add warnings for unresolved references
  if (unresolvedReferences.length > 0) {
    warnings.push(
      `${unresolvedReferences.length} unresolved @ reference(s): ${unresolvedReferences.map((r) => r.text).join(', ')}`
    );
  }

  return {
    success: missingVariables.length === 0 && unresolvedReferences.length === 0,
    content: compiled,
    frontmatter: {},
    missingVariables: [...new Set(missingVariables)],
    unresolvedReferences,
    warnings,
  };
}

/**
 * Compile both frontmatter and content template
 */
export function compileSkillDocument(
  frontmatter: Record<string, unknown>,
  contentTemplate: string,
  context: OrganizationContext,
  referenceContext: ReferenceContext = EMPTY_REFERENCE_CONTEXT
): CompilationResult {
  // Compile the content
  const contentResult = compileSkillTemplate(contentTemplate, context, referenceContext);

  // Compile any string values in frontmatter
  const compiledFrontmatter: Record<string, unknown> = {};
  const frontmatterMissing: string[] = [];
  const frontmatterUnresolved: UnresolvedReference[] = [];

  function compileValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const result = compileSkillTemplate(value, context, referenceContext);
      frontmatterMissing.push(...result.missingVariables);
      frontmatterUnresolved.push(...result.unresolvedReferences);
      return result.content;
    }
    if (Array.isArray(value)) {
      return value.map(compileValue);
    }
    if (typeof value === 'object' && value !== null) {
      const compiled: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        compiled[k] = compileValue(v);
      }
      return compiled;
    }
    return value;
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    compiledFrontmatter[key] = compileValue(value);
  }

  // Merge missing variables and unresolved references
  const allMissing = [...new Set([...contentResult.missingVariables, ...frontmatterMissing])];
  const allUnresolved = [...contentResult.unresolvedReferences, ...frontmatterUnresolved];

  return {
    success: allMissing.length === 0 && allUnresolved.length === 0,
    content: contentResult.content,
    frontmatter: compiledFrontmatter,
    missingVariables: allMissing,
    unresolvedReferences: allUnresolved,
    warnings: contentResult.warnings,
  };
}

/**
 * Validate that a context object has all required variables
 */
export function validateContextForSkill(
  requiredVariables: string[],
  context: OrganizationContext
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const varName of requiredVariables) {
    const value = navigatePath(varName, context);
    if (value === null || value === undefined) {
      missing.push(varName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Extract all variable names from a template
 */
export function extractVariablesFromTemplate(template: string): string[] {
  const variables = new Set<string>();
  const regex = /\$\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const expression = match[1].trim();
    // Extract the base variable name (before any modifiers or array access)
    const baseName = expression.split(/[|.\[]/)[0];
    variables.add(baseName);
  }

  return Array.from(variables);
}

/**
 * Get sample context for preview purposes
 */
export function getSampleContext(): OrganizationContext {
  return {
    company_name: 'Acme Corp',
    domain: 'acme.com',
    tagline: 'Making the world better',
    description: 'Acme Corp is a leading provider of innovative solutions.',
    industry: 'Technology',
    employee_count: '50-200',
    founded_year: 2015,
    headquarters: 'San Francisco, CA',
    products: [
      { name: 'Product One', description: 'Our flagship product', pricing_tier: 'Enterprise' },
      { name: 'Product Two', description: 'For small teams', pricing_tier: 'Starter' },
    ],
    main_product: 'Product One',
    value_propositions: ['Save time', 'Reduce costs', 'Increase productivity'],
    pricing_model: 'Subscription',
    competitors: ['Competitor A', 'Competitor B', 'Competitor C'],
    primary_competitor: 'Competitor A',
    target_market: 'Mid-market B2B SaaS companies',
    target_customers: 'Sales teams and revenue operations',
    icp_summary: 'B2B SaaS companies with 20-500 employees looking to improve sales efficiency',
    brand_tone: 'Professional yet approachable',
    words_to_avoid: ['cheap', 'basic', 'simple'],
    key_phrases: ['transform your sales', 'revenue intelligence', 'close more deals'],
    buying_signals: ['evaluating CRM', 'sales team growth', 'budget approved'],
  };
}

/**
 * Extract all @ references from a template
 */
export function extractReferencesFromTemplate(template: string): {
  documents: string[];
  skills: string[];
} {
  const documents: string[] = [];
  const skills: string[] = [];

  const references = parseReferences(template);

  for (const ref of references) {
    if (ref.type === 'document' && ref.path) {
      documents.push(ref.path);
    } else if (ref.type === 'skill' && ref.path) {
      skills.push(ref.path);
    }
  }

  return {
    documents: [...new Set(documents)],
    skills: [...new Set(skills)],
  };
}

/**
 * Build a reference context from skill documents and other skills
 *
 * @param documents - Array of documents with path and content
 * @param skills - Array of skills with skill_key and content
 * @returns ReferenceContext for use in compilation
 */
export function buildReferenceContext(
  documents: Array<{ path: string; title: string; content: string }>,
  skills: Array<{ skill_key: string; name: string; content: string }>
): ReferenceContext {
  const docMap = new Map<string, { title: string; content: string }>();
  const skillMap = new Map<string, { name: string; content: string }>();

  for (const doc of documents) {
    docMap.set(doc.path, { title: doc.title, content: doc.content });
    // Also add without extension for convenience
    if (doc.path.endsWith('.md')) {
      docMap.set(doc.path.slice(0, -3), { title: doc.title, content: doc.content });
    }
  }

  for (const skill of skills) {
    skillMap.set(skill.skill_key, { name: skill.name, content: skill.content });
  }

  return {
    documents: docMap,
    skills: skillMap,
  };
}

/**
 * Compile a full skill with all its documents resolved
 *
 * This is the main entry point for compiling a skill that has folder structure.
 * It resolves all internal document references and external skill references.
 *
 * @param mainContent - The main skill content template
 * @param documents - Documents within this skill's folder structure
 * @param otherSkills - Other skills available for cross-referencing
 * @param orgContext - Organization context for variable interpolation
 * @returns Fully compiled skill content
 */
export function compileSkillWithDocuments(
  mainContent: string,
  documents: Array<{ path: string; title: string; content: string }>,
  otherSkills: Array<{ skill_key: string; name: string; content: string }>,
  orgContext: OrganizationContext
): CompilationResult {
  // First, compile all documents with org context (but not inter-document references yet)
  const compiledDocs = documents.map((doc) => {
    const result = compileSkillTemplate(doc.content, orgContext);
    return {
      ...doc,
      content: result.content,
    };
  });

  // Build reference context from compiled documents
  const referenceContext = buildReferenceContext(compiledDocs, otherSkills);

  // Now compile the main content with full reference resolution
  return compileSkillTemplate(mainContent, orgContext, referenceContext);
}
