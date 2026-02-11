/**
 * Compile Organization Skills Edge Function
 *
 * Compiles platform skill templates for a specific organization by:
 * 1. Fetching all active platform skills
 * 2. Fetching organization context
 * 3. Interpolating context variables into skill templates
 * 4. Saving compiled skills to organization_skills table
 *
 * Actions:
 * - compile_all: Compile all platform skills for an organization
 * - compile_one: Compile a specific skill for an organization
 * - preview: Preview compilation without saving
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

interface PlatformSkill {
  id: string;
  skill_key: string;
  category: string;
  frontmatter: Record<string, unknown>;
  content_template: string;
  version: number;
  is_active: boolean;
}

interface OrganizationContext {
  [key: string]: unknown;
}

interface CompileRequest {
  action: 'compile_all' | 'compile_one' | 'preview';
  organization_id: string;
  skill_key?: string;
  preview_context?: OrganizationContext;
}

interface CompilationResult {
  success: boolean;
  content: string;
  frontmatter: Record<string, unknown>;
  missingVariables: string[];
  warnings: string[];
}

// ============================================================================
// Context Profiles — controls which org variables each skill receives
// ============================================================================

const CONTEXT_PROFILES: Record<string, string[]> = {
  sales: [
    'company_name', 'company_bio', 'products', 'value_propositions',
    'competitors', 'icp', 'ideal_customer_profile', 'brand_voice',
    'case_studies', 'customer_logos', 'pain_points',
  ],
  research: [
    'company_name', 'company_bio', 'products', 'competitors',
    'industry', 'target_market', 'tech_stack', 'pain_points',
    'employee_count', 'company_size',
  ],
  communication: [
    'company_name', 'brand_voice', 'products', 'case_studies',
    'customer_logos', 'value_propositions',
  ],
  // 'full' is handled specially — includes ALL keys
};

/**
 * Format a context value for display in the Organization Context block.
 * Arrays become comma-separated lists, objects become key: value lines,
 * primitives become strings.
 */
function formatContextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    // Array of objects: format each as "name (detail)" or just the string
    const formatted = value.map(item => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        // Common patterns: {name, description}, {name, domain}, {name, pricing_tier}
        if (obj.name) {
          const details = Object.entries(obj)
            .filter(([k]) => k !== 'name')
            .map(([, v]) => v)
            .filter(Boolean);
          return details.length > 0 ? `${obj.name} (${details.join(', ')})` : String(obj.name);
        }
        return JSON.stringify(item);
      }
      return String(item);
    });
    return formatted.join(', ');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;
    // For small objects, inline; for larger ones, multi-line
    if (entries.length <= 3) {
      return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    return entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  }

  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/**
 * Pretty-print a context key for display.
 * e.g. "company_name" → "Company Name", "icp" → "ICP", "tech_stack" → "Tech Stack"
 */
function formatContextKey(key: string): string {
  const acronyms = ['icp', 'crm', 'api', 'url', 'seo'];
  if (acronyms.includes(key.toLowerCase())) return key.toUpperCase();
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate the Organization Context markdown block for a skill.
 *
 * @param context  Full organization context object
 * @param profile  Profile name: 'sales' | 'research' | 'communication' | 'full'
 * @returns        Markdown string to prepend to compiled skill content
 */
function generateContextBlock(
  context: OrganizationContext,
  profile: string
): string {
  if (!context || Object.keys(context).length === 0) return '';

  // Determine which keys to include
  const allowedKeys = profile === 'full'
    ? Object.keys(context)
    : (CONTEXT_PROFILES[profile] || Object.keys(context));

  const lines: string[] = ['## Organization Context (Auto-Generated)', ''];

  for (const key of allowedKeys) {
    const value = context[key];
    const formatted = formatContextValue(value);
    if (formatted) {
      lines.push(`**${formatContextKey(key)}**: ${formatted}`);
    }
  }

  // If no values were added, skip the block entirely
  if (lines.length <= 2) return '';

  lines.push('');
  lines.push('> This context is auto-generated from your organization settings. Update at Settings > Organization.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Compute a simple hash of the context used for a skill compilation.
 * Used to detect when org context changes require recompilation.
 */
function computeContextHash(context: OrganizationContext, profile: string): string {
  const allowedKeys = profile === 'full'
    ? Object.keys(context).sort()
    : (CONTEXT_PROFILES[profile] || Object.keys(context)).sort();

  const filtered: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (context[key] !== undefined) {
      filtered[key] = context[key];
    }
  }

  // Simple string hash (djb2)
  const str = JSON.stringify(filtered);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Skill Compiler (server-side implementation)
// ============================================================================

function navigatePath(path: string, context: OrganizationContext): unknown {
  if (!path || !context) return undefined;

  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalizedPath.split('.');

  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
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

function applyModifier(value: unknown, modifier: string): unknown {
  if (value === null || value === undefined) {
    const defaultMatch = modifier.match(/^'([^']*)'$/);
    if (defaultMatch) {
      return defaultMatch[1];
    }
    return value;
  }

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
      return Array.isArray(value) ? value[0] : value;
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : value;
    case 'count':
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'object' && value !== null) return Object.keys(value).length;
      return 1;
    case 'json':
      return JSON.stringify(value, null, 2);
    default:
      const joinMatch = modifier.match(/^join\(['"]?([^'"]*?)['"]?\)$/i);
      if (joinMatch && Array.isArray(value)) {
        return value.join(joinMatch[1]);
      }
      const defaultValMatch = modifier.match(/^'([^']*)'$/);
      if (defaultValMatch && (value === null || value === undefined)) {
        return defaultValMatch[1];
      }
      return value;
  }
}

function evaluateExpression(
  expr: string,
  context: OrganizationContext
): { value: string | null; variableName: string } {
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
  const variableName = path.split('[')[0].split('.')[0];

  let value = navigatePath(path, context);

  for (const mod of modifiers) {
    value = applyModifier(value, mod);
  }

  if (value === null || value === undefined) {
    return { value: null, variableName };
  }

  if (typeof value === 'object') {
    return { value: JSON.stringify(value), variableName };
  }

  return { value: String(value), variableName };
}

function compileTemplate(
  template: string,
  context: OrganizationContext
): CompilationResult {
  const missingVariables: string[] = [];
  const warnings: string[] = [];

  const compiled = template.replace(/\$\{([^}]+)\}/g, (match, expression) => {
    const { value, variableName } = evaluateExpression(expression.trim(), context);

    if (value === null) {
      if (!expression.includes("'") && !expression.includes('"')) {
        missingVariables.push(variableName);
      }
      return match;
    }

    return value;
  });

  const remainingPlaceholders = compiled.match(/\$\{([^}]+)\}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    warnings.push(
      `${remainingPlaceholders.length} unresolved placeholder(s) in compiled content`
    );
  }

  return {
    success: missingVariables.length === 0,
    content: compiled,
    frontmatter: {},
    missingVariables: [...new Set(missingVariables)],
    warnings,
  };
}

function compileSkillDocument(
  frontmatter: Record<string, unknown>,
  contentTemplate: string,
  context: OrganizationContext
): CompilationResult & { contextHash?: string } {
  // Determine context profile from frontmatter metadata
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  const contextProfile = (metadata?.context_profile as string) ?? 'full';

  // Generate the Organization Context block and prepend to content
  const contextBlock = generateContextBlock(context, contextProfile);
  const enrichedTemplate = contextBlock
    ? contextBlock + '\n' + contentTemplate
    : contentTemplate;

  const contentResult = compileTemplate(enrichedTemplate, context);

  const compiledFrontmatter: Record<string, unknown> = {};
  const frontmatterMissing: string[] = [];

  function compileValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const result = compileTemplate(value, context);
      frontmatterMissing.push(...result.missingVariables);
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

  const allMissing = [...new Set([...contentResult.missingVariables, ...frontmatterMissing])];

  // Compute context hash for staleness detection
  const contextHash = computeContextHash(context, contextProfile);

  return {
    success: allMissing.length === 0,
    content: contentResult.content,
    frontmatter: compiledFrontmatter,
    missingVariables: allMissing,
    warnings: contentResult.warnings,
    contextHash,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { action, organization_id, skill_key, preview_context }: CompileRequest = await req.json();

    if (!organization_id) {
      throw new Error('organization_id is required');
    }

    let response;

    switch (action) {
      case 'compile_all':
        response = await compileAllSkills(supabase, organization_id);
        break;

      case 'compile_one':
        if (!skill_key) {
          throw new Error('skill_key is required for compile_one action');
        }
        response = await compileOneSkill(supabase, organization_id, skill_key);
        break;

      case 'preview':
        if (!skill_key) {
          throw new Error('skill_key is required for preview action');
        }
        response = await previewSkill(supabase, organization_id, skill_key, preview_context);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[compile-organization-skills] Error:', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// Compile All Skills
// ============================================================================

async function compileAllSkills(
  supabase: any,
  organizationId: string
): Promise<{
  success: boolean;
  compiled: number;
  errors: Array<{ skill_key: string; error: string }>;
}> {
  // Fetch all active platform skills
  const { data: platformSkills, error: skillsError } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template, version')
    .eq('is_active', true);

  if (skillsError) {
    throw new Error(`Failed to fetch platform skills: ${skillsError.message}`);
  }

  // Fetch organization context
  const { data: contextData, error: contextError } = await supabase
    .rpc('get_organization_context_object', { p_org_id: organizationId });

  if (contextError) {
    throw new Error(`Failed to fetch organization context: ${contextError.message}`);
  }

  const context: OrganizationContext = contextData || {};
  const errors: Array<{ skill_key: string; error: string }> = [];
  let compiled = 0;

  // Compile each skill
  for (const skill of platformSkills as PlatformSkill[]) {
    try {
      const result = compileSkillDocument(
        skill.frontmatter,
        skill.content_template,
        context
      );

      // Save compiled skill
      const { error: saveError } = await supabase.rpc('save_compiled_organization_skill', {
        p_org_id: organizationId,
        p_skill_key: skill.skill_key,
        p_platform_skill_id: skill.id,
        p_platform_version: skill.version,
        p_compiled_frontmatter: result.frontmatter,
        p_compiled_content: result.content,
      });

      if (saveError) {
        errors.push({ skill_key: skill.skill_key, error: saveError.message });
      } else {
        compiled++;
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ skill_key: skill.skill_key, error: errorMsg });
    }
  }

  return {
    success: errors.length === 0,
    compiled,
    errors,
  };
}

// ============================================================================
// Compile One Skill
// ============================================================================

async function compileOneSkill(
  supabase: any,
  organizationId: string,
  skillKey: string
): Promise<{
  success: boolean;
  result?: CompilationResult;
  error?: string;
}> {
  // Fetch the platform skill
  const { data: skill, error: skillError } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template, version')
    .eq('skill_key', skillKey)
    .eq('is_active', true)
    .single();

  if (skillError || !skill) {
    return { success: false, error: `Skill not found: ${skillKey}` };
  }

  // Fetch organization context
  const { data: contextData, error: contextError } = await supabase
    .rpc('get_organization_context_object', { p_org_id: organizationId });

  if (contextError) {
    return { success: false, error: `Failed to fetch context: ${contextError.message}` };
  }

  const context: OrganizationContext = contextData || {};

  // Compile the skill
  const result = compileSkillDocument(
    skill.frontmatter,
    skill.content_template,
    context
  );

  // Save compiled skill
  const { error: saveError } = await supabase.rpc('save_compiled_organization_skill', {
    p_org_id: organizationId,
    p_skill_key: skill.skill_key,
    p_platform_skill_id: skill.id,
    p_platform_version: skill.version,
    p_compiled_frontmatter: result.frontmatter,
    p_compiled_content: result.content,
  });

  if (saveError) {
    return { success: false, error: `Failed to save: ${saveError.message}` };
  }

  return { success: true, result };
}

// ============================================================================
// Preview Skill (without saving)
// ============================================================================

async function previewSkill(
  supabase: any,
  organizationId: string,
  skillKey: string,
  overrideContext?: OrganizationContext
): Promise<{
  success: boolean;
  result?: CompilationResult;
  context?: OrganizationContext;
  error?: string;
}> {
  // Fetch the platform skill
  const { data: skill, error: skillError } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template, version')
    .eq('skill_key', skillKey)
    .eq('is_active', true)
    .single();

  if (skillError || !skill) {
    return { success: false, error: `Skill not found: ${skillKey}` };
  }

  let context: OrganizationContext;

  if (overrideContext) {
    // Use provided context for preview
    context = overrideContext;
  } else {
    // Fetch organization context
    const { data: contextData, error: contextError } = await supabase
      .rpc('get_organization_context_object', { p_org_id: organizationId });

    if (contextError) {
      return { success: false, error: `Failed to fetch context: ${contextError.message}` };
    }

    context = contextData || {};
  }

  // Compile the skill (preview only, don't save)
  const result = compileSkillDocument(
    skill.frontmatter,
    skill.content_template,
    context
  );

  return {
    success: true,
    result,
    context,
  };
}
