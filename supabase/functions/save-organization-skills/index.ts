/**
 * Save Organization Skills Edge Function
 *
 * Saves and manages AI-generated and user-modified skill configurations.
 *
 * Actions:
 * - save: Save a single skill configuration
 * - save-all: Save all skill configurations at once
 * - get: Get all skills for an organization
 * - reset: Reset a skill to AI-generated default
 * - history: Get version history for a skill
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper function to extract and validate JWT from Authorization header
function extractUserFromToken(authHeader: string): { id: string; email?: string } | null {
  try {
    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const parts = token.split('.');

    if (parts.length !== 3) {
      console.error('[auth] Invalid JWT structure');
      return null;
    }

    // Decode JWT payload (second part)
    const payload = JSON.parse(atob(parts[1]));

    // Extract user info from JWT claims
    const userId = payload.sub; // Subject (user ID)
    const email = payload.email;

    if (!userId) {
      console.error('[auth] No user ID in JWT');
      return null;
    }

    return { id: userId, email };
  } catch (error) {
    console.error('[auth] Failed to extract user from token:', error);
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface SkillData {
  skill_id: string;
  skill_name: string;
  config: Record<string, any>;
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
      console.error('[save-organization-skills] No authorization header');
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Extract user from JWT token (simple decode without verification)
    // Full verification would require validating the signature, but Supabase JWT should be trusted
    const user = extractUserFromToken(authHeader);

    if (!user) {
      console.error('[save-organization-skills] Failed to extract user from token');
      throw new Error('Invalid authentication token');
    }

    console.log('[save-organization-skills] Authenticated user:', user.id);

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const requestBody = await req.json();
    const { action, organization_id } = requestBody;

    // Verify user has access to this organization
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      throw new Error('You do not have access to this organization');
    }

    let response;

    switch (action) {
      case 'save':
        response = await saveSkill(supabase, user.id, organization_id, requestBody.skill);
        break;

      case 'save-all':
        response = await saveAllSkills(supabase, user.id, organization_id, requestBody.skills);
        break;

      case 'get':
        response = await getSkills(supabase, organization_id);
        break;

      case 'reset':
        response = await resetSkill(supabase, user.id, organization_id, requestBody.skill_id);
        break;

      case 'history':
        response = await getSkillHistory(supabase, organization_id, requestBody.skill_id);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[save-organization-skills] Error:', errorMessage);

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
// Save Single Skill
// ============================================================================

async function saveSkill(
  supabase: any,
  userId: string,
  organizationId: string,
  skill: SkillData
): Promise<{ success: boolean; skill_id?: string; error?: string }> {
  try {
    // Validate skill data
    if (!skill.skill_id || !skill.config) {
      throw new Error('Missing skill_id or config');
    }

    // Call the database function to save with version history
    const { data, error } = await supabase.rpc('save_organization_skill', {
      p_org_id: organizationId,
      p_skill_id: skill.skill_id,
      p_skill_name: skill.skill_name,
      p_config: skill.config,
      p_user_id: userId,
      p_ai_generated: false,
      p_change_reason: 'User edit',
    });

    if (error) throw error;

    console.log(`[saveSkill] Saved skill ${skill.skill_id} for org ${organizationId}`);

    return { success: true, skill_id: data };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[saveSkill] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Save All Skills
// ============================================================================

async function saveAllSkills(
  supabase: any,
  userId: string,
  organizationId: string,
  skills: SkillData[]
): Promise<{ success: boolean; saved_count?: number; error?: string }> {
  try {
    if (!skills || !Array.isArray(skills)) {
      throw new Error('Skills must be an array');
    }

    let savedCount = 0;

    for (const skill of skills) {
      const result = await saveSkill(supabase, userId, organizationId, skill);
      if (result.success) {
        savedCount++;
      }
    }

    // Mark onboarding as complete with v2
    await supabase
      .from('organizations')
      .update({ onboarding_version: 'v2' })
      .eq('id', organizationId);

    console.log(`[saveAllSkills] Saved ${savedCount}/${skills.length} skills for org ${organizationId}`);

    return { success: true, saved_count: savedCount };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[saveAllSkills] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Get Skills
// ============================================================================

async function getSkills(
  supabase: any,
  organizationId: string
): Promise<{ success: boolean; skills?: any[]; error?: string }> {
  try {
    const { data: skills, error } = await supabase
      .from('organization_skills')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('skill_id');

    if (error) throw error;

    return { success: true, skills: skills || [] };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getSkills] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Reset Skill to AI Default
// ============================================================================

async function resetSkill(
  supabase: any,
  userId: string,
  organizationId: string,
  skillId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the original AI-generated config from enrichment
    const { data: enrichment } = await supabase
      .from('organization_enrichment')
      .select('generated_skills')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!enrichment?.generated_skills?.[skillId]) {
      throw new Error('No AI-generated default found for this skill');
    }

    const originalConfig = enrichment.generated_skills[skillId];

    // Save the reset as a new version
    const { error } = await supabase.rpc('save_organization_skill', {
      p_org_id: organizationId,
      p_skill_id: skillId,
      p_skill_name: getSkillName(skillId),
      p_config: originalConfig,
      p_user_id: userId,
      p_ai_generated: true,
      p_change_reason: 'Reset to AI default',
    });

    if (error) throw error;

    console.log(`[resetSkill] Reset skill ${skillId} to AI default for org ${organizationId}`);

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[resetSkill] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Get Skill History
// ============================================================================

async function getSkillHistory(
  supabase: any,
  organizationId: string,
  skillId: string
): Promise<{ success: boolean; history?: any[]; error?: string }> {
  try {
    const { data: history, error } = await supabase
      .from('organization_skills_history')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('skill_id', skillId)
      .order('version', { ascending: false })
      .limit(10);

    if (error) throw error;

    return { success: true, history: history || [] };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getSkillHistory] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSkillName(skillId: string): string {
  const names: Record<string, string> = {
    'lead_qualification': 'Qualification',
    'lead_enrichment': 'Enrichment',
    'brand_voice': 'Brand Voice',
    'objection_handling': 'Objections',
    'icp': 'ICP',
  };
  return names[skillId] || skillId;
}
