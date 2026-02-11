/**
 * Refresh Organization Skills Edge Function
 *
 * Batch refresh function for recompiling organization skills when platform
 * skills are updated. Supports refreshing by skill_key (all orgs for a skill)
 * or by organization_id (all skills for an org).
 *
 * Actions:
 * - refresh_by_skill: Recompile all org skills for a specific platform skill
 * - refresh_by_org: Recompile all skills for a specific organization
 * - refresh_pending: Process all skills marked for recompilation
 * - status: Check refresh queue status
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

interface RefreshRequest {
  action: 'refresh_by_skill' | 'refresh_by_org' | 'refresh_pending' | 'status';
  skill_key?: string;
  organization_id?: string;
  limit?: number;
}

interface RefreshResult {
  success: boolean;
  processed: number;
  errors: string[];
  skipped?: number;
  details?: Array<{
    organization_id: string;
    skill_key: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
  }>;
}

interface PlatformSkill {
  id: string;
  skill_key: string;
  category: string;
  frontmatter: Record<string, unknown>;
  content_template: string;
  version: number;
}

interface OrganizationContext {
  [key: string]: unknown;
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
};

function formatContextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map(item => {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if (obj.name) {
          const details = Object.entries(obj).filter(([k]) => k !== 'name').map(([, v]) => v).filter(Boolean);
          return details.length > 0 ? `${obj.name} (${details.join(', ')})` : String(obj.name);
        }
        return JSON.stringify(item);
      }
      return String(item);
    }).join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;
    return entries.length <= 3
      ? entries.map(([k, v]) => `${k}: ${v}`).join(', ')
      : entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function formatContextKey(key: string): string {
  const acronyms = ['icp', 'crm', 'api', 'url', 'seo'];
  if (acronyms.includes(key.toLowerCase())) return key.toUpperCase();
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function generateContextBlock(context: OrganizationContext, profile: string): string {
  if (!context || Object.keys(context).length === 0) return '';
  const allowedKeys = profile === 'full'
    ? Object.keys(context)
    : (CONTEXT_PROFILES[profile] || Object.keys(context));
  const lines: string[] = ['## Organization Context (Auto-Generated)', ''];
  for (const key of allowedKeys) {
    const formatted = formatContextValue(context[key]);
    if (formatted) lines.push(`**${formatContextKey(key)}**: ${formatted}`);
  }
  if (lines.length <= 2) return '';
  lines.push('', '> This context is auto-generated from your organization settings. Update at Settings > Organization.', '');
  return lines.join('\n');
}

function computeContextHash(context: OrganizationContext, profile: string): string {
  const allowedKeys = (profile === 'full' ? Object.keys(context) : (CONTEXT_PROFILES[profile] || Object.keys(context))).sort();
  const filtered: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (context[key] !== undefined) filtered[key] = context[key];
  }
  const str = JSON.stringify(filtered);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Skill Compiler (same as compile-organization-skills)
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
): { content: string; missingVariables: string[] } {
  const missingVariables: string[] = [];

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

  return {
    content: compiled,
    missingVariables: [...new Set(missingVariables)],
  };
}

function compileSkillDocument(
  frontmatter: Record<string, unknown>,
  contentTemplate: string,
  context: OrganizationContext,
  userOverrides?: Record<string, unknown>
): { frontmatter: Record<string, unknown>; content: string; contextHash: string } {
  // Determine context profile and inject Organization Context block
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  const contextProfile = (metadata?.context_profile as string) ?? 'full';
  const contextBlock = generateContextBlock(context, contextProfile);
  const enrichedTemplate = contextBlock ? contextBlock + '\n' + contentTemplate : contentTemplate;

  const contentResult = compileTemplate(enrichedTemplate, context);

  const compiledFrontmatter: Record<string, unknown> = {};

  function compileValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const result = compileTemplate(value, context);
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

  // Apply user overrides if present
  if (userOverrides && Object.keys(userOverrides).length > 0) {
    // Merge user overrides into frontmatter
    for (const [key, value] of Object.entries(userOverrides)) {
      if (key === 'frontmatter' && typeof value === 'object') {
        Object.assign(compiledFrontmatter, value);
      }
    }
  }

  const contextHash = computeContextHash(context, contextProfile);

  return {
    frontmatter: compiledFrontmatter,
    content: contentResult.content,
    contextHash,
  };
}

// ============================================================================
// Helper: Extract error message
// ============================================================================

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.details === 'string') return obj.details;
    return JSON.stringify(error);
  }
  return String(error);
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

    // Verify the user is authenticated and is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Check if user is a platform admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      throw new Error('Unauthorized: Platform admin access required');
    }

    const { action, skill_key, organization_id, limit = 100 }: RefreshRequest = await req.json();

    let response: RefreshResult;

    switch (action) {
      case 'refresh_by_skill':
        if (!skill_key) {
          throw new Error('skill_key is required for refresh_by_skill action');
        }
        response = await refreshBySkill(supabase, skill_key, limit);
        break;

      case 'refresh_by_org':
        if (!organization_id) {
          throw new Error('organization_id is required for refresh_by_org action');
        }
        response = await refreshByOrg(supabase, organization_id);
        break;

      case 'refresh_pending':
        response = await refreshPending(supabase, limit);
        break;

      case 'status':
        response = await getRefreshStatus(supabase);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('[refresh-organization-skills] Error:', errorMessage);

    return new Response(
      JSON.stringify({ success: false, processed: 0, errors: [errorMessage] }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// Refresh by Skill Key (all orgs for a specific skill)
// ============================================================================

async function refreshBySkill(
  supabase: any,
  skillKey: string,
  limit: number
): Promise<RefreshResult> {
  console.log(`[refreshBySkill] Starting refresh for skill: ${skillKey}`);

  // Fetch the platform skill
  const { data: platformSkill, error: skillError } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template, version')
    .eq('skill_key', skillKey)
    .eq('is_active', true)
    .single();

  if (skillError || !platformSkill) {
    return {
      success: false,
      processed: 0,
      errors: [`Platform skill not found: ${skillKey}`],
    };
  }

  // Fetch all organization skills that use this platform skill
  const { data: orgSkills, error: orgSkillsError } = await supabase
    .from('organization_skills')
    .select('organization_id, skill_id, user_overrides')
    .eq('platform_skill_id', platformSkill.id)
    .eq('is_active', true)
    .limit(limit);

  if (orgSkillsError) {
    return {
      success: false,
      processed: 0,
      errors: [`Failed to fetch organization skills: ${orgSkillsError.message}`],
    };
  }

  if (!orgSkills || orgSkills.length === 0) {
    return {
      success: true,
      processed: 0,
      errors: [],
      details: [],
    };
  }

  const details: RefreshResult['details'] = [];
  const errors: string[] = [];
  let processed = 0;

  // Process each organization
  for (const orgSkill of orgSkills) {
    try {
      // Fetch organization context
      const { data: contextData, error: contextError } = await supabase
        .rpc('get_organization_context_object', { p_org_id: orgSkill.organization_id });

      if (contextError) {
        const errMsg = `Failed to fetch context for org ${orgSkill.organization_id}: ${contextError.message}`;
        errors.push(errMsg);
        details?.push({
          organization_id: orgSkill.organization_id,
          skill_key: skillKey,
          status: 'error',
          error: errMsg,
        });
        continue;
      }

      const context: OrganizationContext = contextData || {};

      // Compile the skill with user overrides preserved
      const compiled = compileSkillDocument(
        platformSkill.frontmatter,
        platformSkill.content_template,
        context,
        orgSkill.user_overrides
      );

      // Save the compiled skill
      const { error: saveError } = await supabase.rpc('save_compiled_organization_skill', {
        p_org_id: orgSkill.organization_id,
        p_skill_key: skillKey,
        p_platform_skill_id: platformSkill.id,
        p_platform_version: platformSkill.version,
        p_compiled_frontmatter: compiled.frontmatter,
        p_compiled_content: compiled.content,
      });

      if (saveError) {
        const errMsg = `Failed to save for org ${orgSkill.organization_id}: ${saveError.message}`;
        errors.push(errMsg);
        details?.push({
          organization_id: orgSkill.organization_id,
          skill_key: skillKey,
          status: 'error',
          error: errMsg,
        });
      } else {
        processed++;
        details?.push({
          organization_id: orgSkill.organization_id,
          skill_key: skillKey,
          status: 'success',
        });
      }

    } catch (err) {
      const errMsg = `Unexpected error for org ${orgSkill.organization_id}: ${extractErrorMessage(err)}`;
      errors.push(errMsg);
      details?.push({
        organization_id: orgSkill.organization_id,
        skill_key: skillKey,
        status: 'error',
        error: errMsg,
      });
    }
  }

  console.log(`[refreshBySkill] Completed: ${processed} processed, ${errors.length} errors`);

  return {
    success: errors.length === 0,
    processed,
    errors,
    details,
  };
}

// ============================================================================
// Refresh by Organization (all skills for a specific org)
// ============================================================================

async function refreshByOrg(
  supabase: any,
  organizationId: string
): Promise<RefreshResult> {
  console.log(`[refreshByOrg] Starting refresh for organization: ${organizationId}`);

  // Fetch all active platform skills
  const { data: platformSkills, error: skillsError } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template, version')
    .eq('is_active', true);

  if (skillsError) {
    return {
      success: false,
      processed: 0,
      errors: [`Failed to fetch platform skills: ${skillsError.message}`],
    };
  }

  // Fetch organization context
  const { data: contextData, error: contextError } = await supabase
    .rpc('get_organization_context_object', { p_org_id: organizationId });

  if (contextError) {
    return {
      success: false,
      processed: 0,
      errors: [`Failed to fetch organization context: ${contextError.message}`],
    };
  }

  const context: OrganizationContext = contextData || {};

  // Fetch existing organization skills to get user overrides
  const { data: existingSkills, error: existingError } = await supabase
    .from('organization_skills')
    .select('skill_id, user_overrides')
    .eq('organization_id', organizationId);

  if (existingError) {
    console.warn(`[refreshByOrg] Warning: Could not fetch existing skills: ${existingError.message}`);
  }

  // Create a map of skill_id -> user_overrides
  const overridesMap = new Map<string, Record<string, unknown>>();
  if (existingSkills) {
    for (const skill of existingSkills) {
      if (skill.user_overrides && Object.keys(skill.user_overrides).length > 0) {
        overridesMap.set(skill.skill_id, skill.user_overrides);
      }
    }
  }

  const details: RefreshResult['details'] = [];
  const errors: string[] = [];
  let processed = 0;

  // Compile each platform skill for this organization
  for (const skill of platformSkills as PlatformSkill[]) {
    try {
      const userOverrides = overridesMap.get(skill.skill_key) || {};

      // Compile the skill
      const compiled = compileSkillDocument(
        skill.frontmatter,
        skill.content_template,
        context,
        userOverrides
      );

      // Save the compiled skill
      const { error: saveError } = await supabase.rpc('save_compiled_organization_skill', {
        p_org_id: organizationId,
        p_skill_key: skill.skill_key,
        p_platform_skill_id: skill.id,
        p_platform_version: skill.version,
        p_compiled_frontmatter: compiled.frontmatter,
        p_compiled_content: compiled.content,
      });

      if (saveError) {
        const errMsg = `Failed to save skill ${skill.skill_key}: ${saveError.message}`;
        errors.push(errMsg);
        details?.push({
          organization_id: organizationId,
          skill_key: skill.skill_key,
          status: 'error',
          error: errMsg,
        });
      } else {
        processed++;
        details?.push({
          organization_id: organizationId,
          skill_key: skill.skill_key,
          status: 'success',
        });
      }

    } catch (err) {
      const errMsg = `Unexpected error for skill ${skill.skill_key}: ${extractErrorMessage(err)}`;
      errors.push(errMsg);
      details?.push({
        organization_id: organizationId,
        skill_key: skill.skill_key,
        status: 'error',
        error: errMsg,
      });
    }
  }

  console.log(`[refreshByOrg] Completed: ${processed} processed, ${errors.length} errors`);

  return {
    success: errors.length === 0,
    processed,
    errors,
    details,
  };
}

// ============================================================================
// Refresh Pending (process skills marked for recompilation)
// ============================================================================

async function refreshPending(
  supabase: any,
  limit: number
): Promise<RefreshResult> {
  console.log(`[refreshPending] Processing pending skill refreshes, limit: ${limit}`);

  // Fetch skills that need recompilation using the helper function
  const { data: pendingSkills, error: pendingError } = await supabase
    .rpc('get_skills_needing_recompile');

  if (pendingError) {
    return {
      success: false,
      processed: 0,
      errors: [`Failed to fetch pending skills: ${pendingError.message}`],
    };
  }

  if (!pendingSkills || pendingSkills.length === 0) {
    return {
      success: true,
      processed: 0,
      errors: [],
      details: [],
    };
  }

  // Limit the number of skills to process
  const skillsToProcess = pendingSkills.slice(0, limit);

  const details: RefreshResult['details'] = [];
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  // Group by platform skill to batch fetch
  const skillsByPlatformId = new Map<string, typeof skillsToProcess>();
  for (const skill of skillsToProcess) {
    const existing = skillsByPlatformId.get(skill.platform_skill_id) || [];
    existing.push(skill);
    skillsByPlatformId.set(skill.platform_skill_id, existing);
  }

  // Process each platform skill group
  for (const [platformSkillId, orgSkills] of skillsByPlatformId) {
    // Fetch the platform skill
    const { data: platformSkill, error: skillError } = await supabase
      .from('platform_skills')
      .select('id, skill_key, category, frontmatter, content_template, version')
      .eq('id', platformSkillId)
      .eq('is_active', true)
      .single();

    if (skillError || !platformSkill) {
      const errMsg = `Platform skill ${platformSkillId} not found or inactive`;
      for (const orgSkill of orgSkills) {
        errors.push(`${errMsg} (org: ${orgSkill.organization_id})`);
        details?.push({
          organization_id: orgSkill.organization_id,
          skill_key: orgSkill.skill_id,
          status: 'skipped',
          error: errMsg,
        });
        skipped++;
      }
      continue;
    }

    // Process each org skill
    for (const orgSkill of orgSkills) {
      try {
        // Fetch organization context
        const { data: contextData, error: contextError } = await supabase
          .rpc('get_organization_context_object', { p_org_id: orgSkill.organization_id });

        if (contextError) {
          const errMsg = `Failed to fetch context: ${contextError.message}`;
          errors.push(`Org ${orgSkill.organization_id}: ${errMsg}`);
          details?.push({
            organization_id: orgSkill.organization_id,
            skill_key: platformSkill.skill_key,
            status: 'error',
            error: errMsg,
          });
          continue;
        }

        // Fetch user overrides
        const { data: existingSkill } = await supabase
          .from('organization_skills')
          .select('user_overrides')
          .eq('organization_id', orgSkill.organization_id)
          .eq('skill_id', orgSkill.skill_id)
          .maybeSingle();

        const context: OrganizationContext = contextData || {};
        const userOverrides = existingSkill?.user_overrides || {};

        // Compile the skill
        const compiled = compileSkillDocument(
          platformSkill.frontmatter,
          platformSkill.content_template,
          context,
          userOverrides
        );

        // Save the compiled skill
        const { error: saveError } = await supabase.rpc('save_compiled_organization_skill', {
          p_org_id: orgSkill.organization_id,
          p_skill_key: platformSkill.skill_key,
          p_platform_skill_id: platformSkill.id,
          p_platform_version: platformSkill.version,
          p_compiled_frontmatter: compiled.frontmatter,
          p_compiled_content: compiled.content,
        });

        if (saveError) {
          const errMsg = `Failed to save: ${saveError.message}`;
          errors.push(`Org ${orgSkill.organization_id}, skill ${platformSkill.skill_key}: ${errMsg}`);
          details?.push({
            organization_id: orgSkill.organization_id,
            skill_key: platformSkill.skill_key,
            status: 'error',
            error: errMsg,
          });
        } else {
          // Clear the recompile flag and update context hash
          await supabase
            .from('organization_skills')
            .update({ needs_recompile: false, context_hash: compiled.contextHash })
            .eq('organization_id', orgSkill.organization_id)
            .eq('skill_id', platformSkill.skill_key);

          processed++;
          details?.push({
            organization_id: orgSkill.organization_id,
            skill_key: platformSkill.skill_key,
            status: 'success',
          });
        }

      } catch (err) {
        const errMsg = extractErrorMessage(err);
        errors.push(`Org ${orgSkill.organization_id}: ${errMsg}`);
        details?.push({
          organization_id: orgSkill.organization_id,
          skill_key: platformSkill.skill_key,
          status: 'error',
          error: errMsg,
        });
      }
    }
  }

  console.log(`[refreshPending] Completed: ${processed} processed, ${skipped} skipped, ${errors.length} errors`);

  return {
    success: errors.length === 0,
    processed,
    errors,
    skipped,
    details,
  };
}

// ============================================================================
// Get Refresh Status
// ============================================================================

async function getRefreshStatus(supabase: any): Promise<RefreshResult & { status_details?: Record<string, number> }> {
  // Get count of skills needing recompilation (includes both version-stale and context-change)
  const { data: pendingSkills, error: pendingError } = await supabase
    .rpc('get_skills_needing_recompile');

  if (pendingError) {
    return {
      success: false,
      processed: 0,
      errors: [`Failed to check status: ${pendingError.message}`],
    };
  }

  // Get count of context-change pending specifically
  const { count: contextChangePending, error: contextError } = await supabase
    .from('organization_skills')
    .select('id', { count: 'exact', head: true })
    .eq('needs_recompile', true)
    .eq('is_active', true);

  return {
    success: true,
    processed: 0,
    errors: [],
    status_details: {
      total_pending: pendingSkills?.length || 0,
      context_change_pending: (!contextError && contextChangePending) ? contextChangePending : 0,
      version_stale: (pendingSkills?.length || 0) - ((!contextError && contextChangePending) ? contextChangePending : 0),
    },
  };
}
