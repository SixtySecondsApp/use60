/**
 * Platform Skill Service
 *
 * Service layer for managing platform-level skill documents.
 * Super-admin only - provides CRUD operations for skill templates.
 */

import { supabase } from '../supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface PlatformSkillFrontmatter {
  name: string;
  description: string;
  triggers?: string[];
  requires_context?: string[];
  outputs?: string[];
  agents?: string[];
  priority?: 'critical' | 'high' | 'medium' | 'low';
  [key: string]: unknown;
}

export interface PlatformSkill {
  id: string;
  skill_key: string;
  category: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format' | 'agent-sequence';
  frontmatter: PlatformSkillFrontmatter;
  content_template: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSkillHistory {
  id: string;
  skill_id: string;
  version: number;
  frontmatter: PlatformSkillFrontmatter;
  content_template: string;
  changed_by: string | null;
  changed_at: string;
}

export interface CreatePlatformSkillInput {
  skill_key: string;
  category: PlatformSkill['category'];
  frontmatter: PlatformSkillFrontmatter;
  content_template: string;
}

export interface UpdatePlatformSkillInput {
  frontmatter?: PlatformSkillFrontmatter;
  content_template?: string;
  is_active?: boolean;
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SkillCategory =
  | 'sales-ai'
  | 'writing'
  | 'enrichment'
  | 'workflows'
  | 'data-access'
  | 'output-format'
  | 'agent-sequence';

export const SKILL_CATEGORIES: { value: SkillCategory; label: string; description: string }[] = [
  { value: 'sales-ai', label: 'Sales AI', description: 'AI-powered sales intelligence and automation' },
  { value: 'writing', label: 'Writing', description: 'Email and communication templates' },
  { value: 'enrichment', label: 'Enrichment', description: 'Lead and company research' },
  { value: 'workflows', label: 'Workflows', description: 'Automated process triggers' },
  { value: 'data-access', label: 'Data Access', description: 'How Copilot fetches contacts, deals, meetings, and emails' },
  { value: 'output-format', label: 'Output Format', description: 'How Copilot formats responses for Slack, email, and other channels' },
  { value: 'agent-sequence', label: 'Agent Sequences', description: 'Multi-step skill chains that orchestrate other skills' },
];

// ============================================================================
// Platform Skill CRUD Operations
// ============================================================================

/**
 * Get all platform skills, optionally filtered by category
 */
export async function getPlatformSkills(
  category?: SkillCategory
): Promise<ServiceResult<PlatformSkill[]>> {
  try {
    let query = supabase
      .from('platform_skills')
      .select('*')
      .order('category')
      .order('skill_key');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch platform skills';
    console.error('[platformSkillService] getPlatformSkills error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get a single platform skill by ID
 */
export async function getPlatformSkill(
  skillId: string
): Promise<ServiceResult<PlatformSkill>> {
  try {
    const { data, error } = await supabase
      .from('platform_skills')
      .select('*')
      .eq('id', skillId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch platform skill';
    console.error('[platformSkillService] getPlatformSkill error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get a platform skill by its skill_key
 */
export async function getPlatformSkillByKey(
  skillKey: string
): Promise<ServiceResult<PlatformSkill>> {
  try {
    const { data, error } = await supabase
      .from('platform_skills')
      .select('*')
      .eq('skill_key', skillKey)
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch platform skill';
    console.error('[platformSkillService] getPlatformSkillByKey error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Create a new platform skill
 */
export async function createPlatformSkill(
  input: CreatePlatformSkillInput,
  userId: string
): Promise<ServiceResult<PlatformSkill>> {
  try {
    const { data, error } = await supabase
      .from('platform_skills')
      .insert({
        skill_key: input.skill_key,
        category: input.category,
        frontmatter: input.frontmatter,
        content_template: input.content_template,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create platform skill';
    console.error('[platformSkillService] createPlatformSkill error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Update an existing platform skill
 */
export async function updatePlatformSkill(
  skillId: string,
  input: UpdatePlatformSkillInput
): Promise<ServiceResult<PlatformSkill>> {
  try {
    const { data, error } = await supabase
      .from('platform_skills')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', skillId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update platform skill';
    console.error('[platformSkillService] updatePlatformSkill error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Delete a platform skill (hard delete - use is_active=false for soft delete)
 */
export async function deletePlatformSkill(
  skillId: string
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('platform_skills')
      .delete()
      .eq('id', skillId);

    if (error) throw error;

    return {
      success: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete platform skill';
    console.error('[platformSkillService] deletePlatformSkill error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Toggle skill active status (soft delete/restore)
 */
export async function togglePlatformSkillActive(
  skillId: string,
  isActive: boolean
): Promise<ServiceResult<PlatformSkill>> {
  return updatePlatformSkill(skillId, { is_active: isActive });
}

// ============================================================================
// Skill History Operations
// ============================================================================

/**
 * Get version history for a platform skill
 */
export async function getPlatformSkillHistory(
  skillId: string
): Promise<ServiceResult<PlatformSkillHistory[]>> {
  try {
    const { data, error } = await supabase
      .from('platform_skills_history')
      .select('*')
      .eq('skill_id', skillId)
      .order('version', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch skill history';
    console.error('[platformSkillService] getPlatformSkillHistory error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Rollback a skill to a previous version
 */
export async function rollbackPlatformSkill(
  skillId: string,
  version: number
): Promise<ServiceResult<PlatformSkill>> {
  try {
    // Get the historical version
    const { data: history, error: historyError } = await supabase
      .from('platform_skills_history')
      .select('frontmatter, content_template')
      .eq('skill_id', skillId)
      .eq('version', version)
      .single();

    if (historyError) throw historyError;

    // Update the skill with historical data
    return updatePlatformSkill(skillId, {
      frontmatter: history.frontmatter,
      content_template: history.content_template,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to rollback skill';
    console.error('[platformSkillService] rollbackPlatformSkill error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// Skill Compilation Preview
// ============================================================================

/**
 * Preview skill compilation with sample context
 */
export async function previewSkillCompilation(
  skillKey: string,
  organizationId: string,
  overrideContext?: Record<string, unknown>
): Promise<ServiceResult<{
  content: string;
  frontmatter: PlatformSkillFrontmatter;
  missingVariables: string[];
  context: Record<string, unknown>;
}>> {
  try {
    const { data, error } = await supabase.functions.invoke('compile-organization-skills', {
      body: {
        action: 'preview',
        organization_id: organizationId,
        skill_key: skillKey,
        preview_context: overrideContext,
      },
    });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to preview skill');
    }

    return {
      success: true,
      data: {
        content: data.result?.content || '',
        frontmatter: data.result?.frontmatter || {},
        missingVariables: data.result?.missingVariables || [],
        context: data.context || {},
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to preview skill compilation';
    console.error('[platformSkillService] previewSkillCompilation error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// Context Variables
// ============================================================================

/**
 * Get all available context variables for an organization
 */
export async function getOrganizationContext(
  organizationId: string
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.rpc('get_organization_context_object', {
      p_org_id: organizationId,
    });

    if (error) throw error;

    return {
      success: true,
      data: data || {},
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch organization context';
    console.error('[platformSkillService] getOrganizationContext error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get a list of all available context variable keys
 */
export function getAvailableContextVariables(): { key: string; description: string; type: string }[] {
  return [
    // Company Identity
    { key: 'company_name', description: 'Company name', type: 'string' },
    { key: 'domain', description: 'Website domain', type: 'string' },
    { key: 'tagline', description: 'Company tagline', type: 'string' },
    { key: 'description', description: 'Company description', type: 'string' },
    { key: 'industry', description: 'Industry classification', type: 'string' },
    { key: 'employee_count', description: 'Size indicator', type: 'string' },

    // Products & Services
    { key: 'products', description: 'Array of products with name/description', type: 'array' },
    { key: 'main_product', description: 'Primary product name', type: 'string' },
    { key: 'value_propositions', description: 'Key value propositions', type: 'array' },

    // Market Intelligence
    { key: 'competitors', description: 'Array of competitor names', type: 'array' },
    { key: 'primary_competitor', description: 'Main competitor', type: 'string' },
    { key: 'target_market', description: 'Target market description', type: 'string' },
    { key: 'icp_summary', description: 'Ideal customer profile summary', type: 'object' },

    // Additional
    { key: 'tech_stack', description: 'Technologies used', type: 'array' },
    { key: 'key_people', description: 'Key team members', type: 'array' },
    { key: 'pain_points', description: 'Customer pain points', type: 'array' },
    { key: 'buying_signals', description: 'Purchase intent signals', type: 'array' },
    { key: 'customer_logos', description: 'Notable customer names', type: 'array' },

    // Brand Voice & Writing Style
    { key: 'brand_tone', description: 'Brand communication tone (e.g., professional, friendly)', type: 'string' },
    { key: 'words_to_avoid', description: 'Words/phrases to avoid in communication', type: 'array' },
    { key: 'key_phrases', description: 'Key brand phrases and messaging', type: 'array' },
    { key: 'writing_style_name', description: 'Name of the writing style', type: 'string' },
    { key: 'writing_style_tone', description: 'Writing tone description', type: 'string' },
    { key: 'writing_style_examples', description: 'Example writing samples', type: 'array' },

    // ICP & Lead Qualification
    { key: 'icp_company_profile', description: 'Ideal company profile description', type: 'string' },
    { key: 'icp_buyer_persona', description: 'Buyer persona description', type: 'string' },
    { key: 'qualification_criteria', description: 'Lead qualification criteria', type: 'array' },
    { key: 'disqualification_criteria', description: 'Lead disqualification criteria', type: 'array' },

    // Copilot Personality
    { key: 'copilot_personality', description: 'AI assistant personality description', type: 'string' },
    { key: 'copilot_greeting', description: 'AI assistant greeting message', type: 'string' },
  ];
}

/**
 * Extract required context variables from a template
 */
// ============================================================================
// Post-Save Sync: Embedding Generation + Org Compilation
// ============================================================================

/**
 * Generate embedding and compile org skills after a skill is saved.
 * Runs in the background — failures are logged but don't block the save.
 */
export async function syncSkillAfterSave(
  skill: PlatformSkill,
  organizationId: string | null
): Promise<{ embeddingOk: boolean; compileOk: boolean; errors: string[] }> {
  const errors: string[] = [];
  let embeddingOk = false;
  let compileOk = false;

  // 1. Generate embedding from name + description
  const embeddingText = buildEmbeddingText(skill);

  try {
    const { data, error } = await supabase.functions.invoke('generate-embedding', {
      body: { text: embeddingText },
    });

    if (error || !data?.embedding) {
      const msg = error?.message || 'No embedding returned';
      console.warn('[syncSkillAfterSave] Embedding generation failed:', msg);
      errors.push(`Embedding: ${msg}`);
    } else {
      // Store the embedding on the platform_skills row
      const { error: updateError } = await supabase
        .from('platform_skills')
        .update({ description_embedding: JSON.stringify(data.embedding) })
        .eq('id', skill.id);

      if (updateError) {
        console.warn('[syncSkillAfterSave] Embedding save failed:', updateError.message);
        errors.push(`Embedding save: ${updateError.message}`);
      } else {
        embeddingOk = true;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[syncSkillAfterSave] Embedding error:', msg);
    errors.push(`Embedding: ${msg}`);
  }

  // 2. Compile for the user's organization
  if (organizationId) {
    try {
      const { data, error } = await supabase.functions.invoke('compile-organization-skills', {
        body: {
          action: 'compile_one',
          organization_id: organizationId,
          skill_key: skill.skill_key,
        },
      });

      if (error) {
        console.warn('[syncSkillAfterSave] Org compilation failed:', error.message);
        errors.push(`Compile: ${error.message}`);
      } else if (data && !data.success) {
        console.warn('[syncSkillAfterSave] Org compilation error:', data.error);
        errors.push(`Compile: ${data.error}`);
      } else {
        compileOk = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[syncSkillAfterSave] Compile error:', msg);
      errors.push(`Compile: ${msg}`);
    }
  }

  return { embeddingOk, compileOk, errors };
}

/**
 * Build the text used for embedding generation.
 * Format: "Name: Description. Triggers: trigger1, trigger2"
 */
function buildEmbeddingText(skill: PlatformSkill): string {
  const name = skill.frontmatter.name || skill.skill_key;
  const description = skill.frontmatter.description || '';
  const triggers = skill.frontmatter.triggers;

  let text = `${name}: ${description}`;

  if (Array.isArray(triggers) && triggers.length > 0) {
    text += ` Triggers: ${triggers.join(', ')}`;
  }

  return text;
}

export function extractVariablesFromTemplate(template: string): string[] {
  const regex = /\$\{([^}|]+)/g;
  const variables = new Set<string>();
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Get the base variable name (before any dot or bracket notation)
    const fullPath = match[1].trim();
    const baseName = fullPath.split(/[.\[]/)[0];
    variables.add(baseName);
  }

  return Array.from(variables);
}
