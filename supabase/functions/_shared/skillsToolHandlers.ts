/**
 * Shared Skills Tool Handlers
 *
 * Implements list_skills and get_skill tool handlers used by both
 * api-copilot and copilot-autonomous edge functions.
 *
 * These handlers query organization_skills (compiled per-org) via the
 * get_organization_skills_for_agent RPC, with fallback to direct table queries.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillSummary {
  skill_key: string;
  kind: 'skill' | 'sequence';
  category: string;
  name?: string;
  description?: string;
  triggers?: unknown[];
  step_count?: number;
  is_enabled: boolean;
}

export interface SkillDetail {
  skill_key: string;
  kind: 'skill' | 'sequence';
  category: string;
  frontmatter: Record<string, unknown>;
  content: string;
  step_count?: number;
  is_enabled: boolean;
}

export interface ListSkillsResult {
  success: boolean;
  count: number;
  skills: SkillSummary[];
  error?: string;
}

export interface GetSkillResult {
  success: boolean;
  skill: SkillDetail | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Org Resolution Helper
// ---------------------------------------------------------------------------

export async function resolveOrgId(
  client: SupabaseClient,
  userId: string,
  orgId: string | null
): Promise<string> {
  if (orgId) return orgId;

  const { data: membership, error: membershipError } = await client
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Failed to resolve organization: ${membershipError.message}`);
  }

  if (!membership?.org_id) {
    throw new Error('No organization found for user');
  }

  return String(membership.org_id);
}

// ---------------------------------------------------------------------------
// list_skills Handler
// ---------------------------------------------------------------------------

export async function handleListSkills(
  client: SupabaseClient,
  orgId: string,
  args?: { kind?: string; category?: string; enabled_only?: boolean }
): Promise<ListSkillsResult> {
  const category = args?.category ? String(args.category) : null;
  const enabledOnly = args?.enabled_only !== false;
  const kind = args?.kind ? String(args.kind) : 'all';

  if (enabledOnly) {
    const { data: skills, error } = await client.rpc('get_organization_skills_for_agent', {
      p_org_id: orgId,
    });

    if (error) {
      return { success: false, count: 0, skills: [], error: `Failed to list skills: ${error.message}` };
    }

    const filtered = (skills || [])
      .filter((s: Record<string, unknown>) => (!category ? true : s.category === category))
      .filter((s: Record<string, unknown>) => {
        if (kind === 'sequence') return s.category === 'agent-sequence';
        if (kind === 'skill') return s.category !== 'agent-sequence';
        return true;
      });

    return {
      success: true,
      count: filtered.length,
      skills: filtered.map((s: Record<string, unknown>) => ({
        skill_key: s.skill_key as string,
        kind: (s.category === 'agent-sequence' ? 'sequence' : 'skill') as 'skill' | 'sequence',
        category: s.category as string,
        name: (s.frontmatter as Record<string, unknown>)?.name as string | undefined,
        description: (s.frontmatter as Record<string, unknown>)?.description as string | undefined,
        triggers: ((s.frontmatter as Record<string, unknown>)?.triggers as unknown[]) || [],
        step_count: Array.isArray((s.frontmatter as Record<string, unknown>)?.sequence_steps)
          ? ((s.frontmatter as Record<string, unknown>).sequence_steps as unknown[]).length
          : undefined,
        is_enabled: (s.is_enabled as boolean) ?? true,
      })),
    };
  }

  // enabled_only=false: include disabled org skills
  const { data: rows, error } = await client
    .from('organization_skills')
    .select(`
      skill_id,
      is_enabled,
      compiled_frontmatter,
      compiled_content,
      platform_skill_version,
      platform_skills:platform_skill_id(category, frontmatter, content_template, is_active)
    `)
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (error) {
    return { success: false, count: 0, skills: [], error: `Failed to list skills: ${error.message}` };
  }

  const all = (rows || [])
    .filter((r: Record<string, unknown>) => {
      const ps = r.platform_skills as Record<string, unknown> | null;
      return (ps?.is_active ?? true) === true;
    })
    .map((r: Record<string, unknown>) => {
      const ps = r.platform_skills as Record<string, unknown> | null;
      const fm = (r.compiled_frontmatter || ps?.frontmatter || {}) as Record<string, unknown>;
      return {
        skill_key: r.skill_id as string,
        category: (ps?.category || 'uncategorized') as string,
        frontmatter: fm,
        is_enabled: (r.is_enabled as boolean) ?? true,
      };
    })
    .filter((s) => (!category ? true : s.category === category))
    .filter((s) => {
      if (kind === 'sequence') return s.category === 'agent-sequence';
      if (kind === 'skill') return s.category !== 'agent-sequence';
      return true;
    });

  return {
    success: true,
    count: all.length,
    skills: all.map((s) => ({
      skill_key: s.skill_key,
      kind: (s.category === 'agent-sequence' ? 'sequence' : 'skill') as 'skill' | 'sequence',
      category: s.category,
      name: s.frontmatter?.name as string | undefined,
      description: s.frontmatter?.description as string | undefined,
      triggers: (s.frontmatter?.triggers as unknown[]) || [],
      step_count: Array.isArray(s.frontmatter?.sequence_steps)
        ? (s.frontmatter.sequence_steps as unknown[]).length
        : undefined,
      is_enabled: s.is_enabled,
    })),
  };
}

// ---------------------------------------------------------------------------
// get_skill Handler
// ---------------------------------------------------------------------------

export async function handleGetSkill(
  client: SupabaseClient,
  orgId: string,
  skillKey: string
): Promise<GetSkillResult> {
  if (!skillKey) {
    return { success: false, skill: null, error: 'skill_key is required' };
  }

  // Prefer enabled compiled skills first
  const { data: skills, error } = await client.rpc('get_organization_skills_for_agent', {
    p_org_id: orgId,
  });

  if (error) {
    return { success: false, skill: null, error: `Failed to get skill: ${error.message}` };
  }

  const found = (skills || []).find((s: Record<string, unknown>) => s.skill_key === skillKey);
  if (found) {
    const fm = (found.frontmatter || {}) as Record<string, unknown>;
    return {
      success: true,
      skill: {
        skill_key: found.skill_key as string,
        kind: (found.category === 'agent-sequence' ? 'sequence' : 'skill') as 'skill' | 'sequence',
        category: found.category as string,
        frontmatter: fm,
        content: (found.content as string) || '',
        step_count: Array.isArray(fm?.sequence_steps)
          ? (fm.sequence_steps as unknown[]).length
          : undefined,
        is_enabled: (found.is_enabled as boolean) ?? true,
      },
    };
  }

  // Fallback: fetch disabled skill
  const { data: row, error: rowError } = await client
    .from('organization_skills')
    .select(`
      skill_id,
      is_enabled,
      compiled_frontmatter,
      compiled_content,
      platform_skill_version,
      platform_skills:platform_skill_id(category, frontmatter, content_template, is_active)
    `)
    .eq('organization_id', orgId)
    .eq('skill_id', skillKey)
    .eq('is_active', true)
    .maybeSingle();

  if (rowError) {
    return { success: false, skill: null, error: `Failed to get skill: ${rowError.message}` };
  }

  if (!row) {
    return { success: true, skill: null };
  }

  const ps = row.platform_skills as Record<string, unknown> | null;
  if ((ps?.is_active ?? true) !== true) {
    return { success: true, skill: null };
  }

  const fm = (row.compiled_frontmatter || ps?.frontmatter || {}) as Record<string, unknown>;

  // If compiled_content is available, use it. Otherwise fall back to content_template
  // but clean any unresolved ${variable} placeholders that belong to platform_skills templates.
  let content = (row.compiled_content as string) || (ps?.content_template as string) || '';
  if (content && /\$\{[^}]+\}/.test(content)) {
    content = content.replace(/\$\{[^}]+\}/g, '');
  }

  return {
    success: true,
    skill: {
      skill_key: row.skill_id as string,
      kind: (ps?.category === 'agent-sequence' ? 'sequence' : 'skill') as 'skill' | 'sequence',
      category: (ps?.category || 'uncategorized') as string,
      frontmatter: fm,
      content,
      step_count: Array.isArray(fm?.sequence_steps)
        ? (fm.sequence_steps as unknown[]).length
        : undefined,
      is_enabled: (row.is_enabled as boolean) ?? true,
    },
  };
}
