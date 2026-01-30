/**
 * Get Agent Skills Edge Function
 *
 * MCP-compatible endpoint for AI agents to retrieve organization skills.
 * Returns compiled skills with frontmatter metadata and content.
 *
 * V2 Features:
 * - Folder structure included in response
 * - Child documents (prompts, examples, assets) included
 * - @ references resolved and inlined
 * - Backward compatible with existing agent calls
 *
 * Actions:
 * - list: Get all skills for an organization (with optional filters)
 * - get: Get a single skill by key (includes folder structure)
 * - search: Search skills by query string
 *
 * @see platform-controlled-skills-for-orgs.md - Phase 5: Agent Integration
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface AgentSkillsRequest {
  action: 'list' | 'get' | 'search';
  organization_id: string;
  category?: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format';
  enabled_only?: boolean;
  skill_key?: string;
  query?: string;
  /** V2: Include folder structure and documents in response */
  include_documents?: boolean;
  /** V2: Resolve @ references in content */
  resolve_references?: boolean;
}

/** V2: Skill document (child document within a skill folder) */
interface SkillDocument {
  id: string;
  title: string;
  doc_type: 'prompt' | 'example' | 'asset' | 'reference' | 'template';
  content: string;
  folder_path?: string;
}

/** V2: Skill folder structure */
interface SkillFolder {
  id: string;
  name: string;
  path: string;
  documents: SkillDocument[];
}

interface AgentSkill {
  skill_key: string;
  category: string;
  frontmatter: Record<string, unknown>;
  content: string;
  is_enabled: boolean;
  version: number;
  /** V2: Folder structure (when include_documents=true) */
  folders?: SkillFolder[];
  /** V2: Root-level documents (when include_documents=true) */
  documents?: SkillDocument[];
  /** V2: Compiled content with resolved references (when resolve_references=true) */
  compiled_content?: string;
  /** V2: Unresolved reference warnings */
  reference_warnings?: string[];
}

interface AgentSkillsResponse {
  success: boolean;
  skills?: AgentSkill[];
  skill?: AgentSkill | null;
  count?: number;
  error?: string;
  /** V2: API version indicator */
  api_version?: string;
}

// =============================================================================
// Helper: Extract error message from any error type
// =============================================================================

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

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Only accept POST requests
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('No authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return errorResponse('Invalid authentication token', req, 401);
    }

    // Parse request body
    const requestBody: AgentSkillsRequest = await req.json();
    const {
      action = 'list',
      organization_id,
      category,
      enabled_only = true,
      skill_key,
      query,
      include_documents = false,
      resolve_references = false,
    } = requestBody;

    // Validate organization_id
    if (!organization_id) {
      return errorResponse('organization_id is required', req, 400);
    }

    // Verify user has access to this organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return errorResponse('Access denied to this organization', req, 403);
    }

    // Route to appropriate handler
    let response: AgentSkillsResponse;

    switch (action) {
      case 'list':
        response = await listSkills(supabase, organization_id, category, enabled_only);
        break;

      case 'get':
        if (!skill_key) {
          return errorResponse('skill_key is required for get action', req, 400);
        }
        response = await getSkill(supabase, organization_id, skill_key, include_documents, resolve_references);
        break;

      case 'search':
        if (!query) {
          return errorResponse('query is required for search action', req, 400);
        }
        response = await searchSkills(supabase, organization_id, query, category, enabled_only);
        break;

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400);
    }

    // Add API version to response
    response.api_version = '2.0';

    return jsonResponse(response, req);
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('[get-agent-skills] Error:', errorMessage);
    return errorResponse(errorMessage, req, 500);
  }
});

// =============================================================================
// List Skills
// =============================================================================

async function listSkills(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  category?: string,
  enabledOnly = true
): Promise<AgentSkillsResponse> {
  try {
    // Use the RPC function to get compiled skills
    const { data: skills, error } = await supabase.rpc(
      'get_organization_skills_for_agent',
      { p_org_id: organizationId }
    );

    if (error) {
      console.error('[listSkills] RPC error:', error);
      throw error;
    }

    let filteredSkills: AgentSkill[] = (skills || []).map((s: any) => ({
      skill_key: s.skill_key,
      category: s.category || 'uncategorized',
      frontmatter: s.frontmatter || {},
      content: s.content || '',
      is_enabled: s.is_enabled ?? true,
      version: s.version ?? 1,
    }));

    // Apply category filter
    if (category) {
      filteredSkills = filteredSkills.filter((s) => s.category === category);
    }

    // Apply enabled filter
    if (enabledOnly) {
      filteredSkills = filteredSkills.filter((s) => s.is_enabled);
    }

    return {
      success: true,
      skills: filteredSkills,
      count: filteredSkills.length,
    };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('[listSkills] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// =============================================================================
// Get Single Skill (V2: with folder structure and reference resolution)
// =============================================================================

async function getSkill(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  skillKey: string,
  includeDocuments = false,
  resolveReferences = false
): Promise<AgentSkillsResponse> {
  try {
    // Use the RPC function and filter to the specific skill
    const { data: skills, error } = await supabase.rpc(
      'get_organization_skills_for_agent',
      { p_org_id: organizationId }
    );

    if (error) {
      console.error('[getSkill] RPC error:', error);
      throw error;
    }

    const skill = (skills || []).find((s: any) => s.skill_key === skillKey);

    if (!skill) {
      return {
        success: true,
        skill: null,
      };
    }

    // Build basic skill response
    const agentSkill: AgentSkill = {
      skill_key: skill.skill_key,
      category: skill.category || 'uncategorized',
      frontmatter: skill.frontmatter || {},
      content: skill.content || '',
      is_enabled: skill.is_enabled ?? true,
      version: skill.version ?? 1,
    };

    // V2: Include folder documents if requested
    if (includeDocuments) {
      // Get the skill ID for folder lookup (may need to query by skill_key)
      let skillId = skill.skill_id || skill.id;

      if (!skillId) {
        // Query the platform_skills table to get the ID
        const { data: platformSkill } = await supabase
          .from('platform_skills')
          .select('id')
          .eq('skill_key', skillKey)
          .single();

        skillId = platformSkill?.id;
      }

      if (skillId) {
        const { folders, documents } = await getSkillFolderStructure(supabase, skillId);
        agentSkill.folders = folders;
        agentSkill.documents = documents;
      }
    }

    // V2: Resolve @ references if requested
    if (resolveReferences && includeDocuments) {
      const { compiledContent, warnings } = resolveSkillReferences(
        agentSkill.content,
        agentSkill.documents || [],
        agentSkill.folders || []
      );
      agentSkill.compiled_content = compiledContent;
      if (warnings.length > 0) {
        agentSkill.reference_warnings = warnings;
      }
    }

    return {
      success: true,
      skill: agentSkill,
    };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('[getSkill] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// =============================================================================
// V2 Helper: Get Skill Folder Structure
// =============================================================================

async function getSkillFolderStructure(
  supabase: ReturnType<typeof createClient>,
  skillId: string
): Promise<{ folders: SkillFolder[]; documents: SkillDocument[] }> {
  // Get all folders for this skill
  const { data: foldersData, error: foldersError } = await supabase
    .from('skill_folders')
    .select('id, name, parent_folder_id, sort_order')
    .eq('skill_id', skillId)
    .order('sort_order');

  if (foldersError) {
    console.error('[getSkillFolderStructure] Folders error:', foldersError);
    return { folders: [], documents: [] };
  }

  // Get all documents for this skill
  const { data: documentsData, error: documentsError } = await supabase
    .from('skill_documents')
    .select('id, title, doc_type, content, folder_id, sort_order')
    .eq('skill_id', skillId)
    .order('sort_order');

  if (documentsError) {
    console.error('[getSkillFolderStructure] Documents error:', documentsError);
    return { folders: [], documents: [] };
  }

  // Build folder path map
  const folderPathMap = new Map<string, string>();
  const buildPath = (folderId: string | null, folders: any[]): string => {
    if (!folderId) return '';
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return '';
    const parentPath = buildPath(folder.parent_folder_id, folders);
    return parentPath ? `${parentPath}/${folder.name}` : folder.name;
  };

  for (const folder of foldersData || []) {
    folderPathMap.set(folder.id, buildPath(folder.id, foldersData || []));
  }

  // Build folder structure with nested documents
  const folders: SkillFolder[] = [];
  const rootDocuments: SkillDocument[] = [];

  for (const folder of foldersData || []) {
    const folderDocs = (documentsData || [])
      .filter((d: any) => d.folder_id === folder.id)
      .map((d: any) => ({
        id: d.id,
        title: d.title,
        doc_type: d.doc_type,
        content: d.content,
        folder_path: folderPathMap.get(folder.id),
      }));

    folders.push({
      id: folder.id,
      name: folder.name,
      path: folderPathMap.get(folder.id) || folder.name,
      documents: folderDocs,
    });
  }

  // Get root-level documents (no folder)
  for (const doc of documentsData || []) {
    if (!doc.folder_id) {
      rootDocuments.push({
        id: doc.id,
        title: doc.title,
        doc_type: doc.doc_type,
        content: doc.content,
      });
    }
  }

  return { folders, documents: rootDocuments };
}

// =============================================================================
// V2 Helper: Resolve @ References
// =============================================================================

function resolveSkillReferences(
  content: string,
  rootDocuments: SkillDocument[],
  folders: SkillFolder[]
): { compiledContent: string; warnings: string[] } {
  const warnings: string[] = [];

  // Build a map of all documents by path
  const documentMap = new Map<string, string>();

  // Add root documents
  for (const doc of rootDocuments) {
    documentMap.set(doc.title, doc.content);
    documentMap.set(`${doc.title}.md`, doc.content);
  }

  // Add folder documents
  for (const folder of folders) {
    for (const doc of folder.documents) {
      const path = `${folder.path}/${doc.title}`;
      documentMap.set(path, doc.content);
      documentMap.set(`${path}.md`, doc.content);
      // Also add short path (folder/doc)
      documentMap.set(`${folder.name}/${doc.title}`, doc.content);
      documentMap.set(`${folder.name}/${doc.title}.md`, doc.content);
    }
  }

  // Replace @ references
  const atMentionRegex = /@([\w\-\/\.]+)/g;
  let resolvedContent = content;
  let match;
  const matches: Array<{ full: string; path: string; start: number; end: number }> = [];

  while ((match = atMentionRegex.exec(content)) !== null) {
    matches.push({
      full: match[0],
      path: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Replace from end to start to preserve positions
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const docContent = documentMap.get(m.path);

    if (docContent !== undefined) {
      resolvedContent =
        resolvedContent.slice(0, m.start) + docContent + resolvedContent.slice(m.end);
    } else {
      warnings.push(`Unresolved reference: ${m.full}`);
    }
  }

  return { compiledContent: resolvedContent, warnings };
}

// =============================================================================
// Search Skills
// =============================================================================

async function searchSkills(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  query: string,
  category?: string,
  enabledOnly = true
): Promise<AgentSkillsResponse> {
  try {
    // Get all skills first
    const { data: skills, error } = await supabase.rpc(
      'get_organization_skills_for_agent',
      { p_org_id: organizationId }
    );

    if (error) {
      console.error('[searchSkills] RPC error:', error);
      throw error;
    }

    const queryLower = query.toLowerCase();

    // Filter by search query
    let filteredSkills: AgentSkill[] = (skills || [])
      .filter((s: any) => {
        // Search in skill_key
        if (s.skill_key?.toLowerCase().includes(queryLower)) return true;

        // Search in frontmatter
        const frontmatter = s.frontmatter || {};
        if (frontmatter.name?.toLowerCase().includes(queryLower)) return true;
        if (frontmatter.description?.toLowerCase().includes(queryLower)) return true;
        if (Array.isArray(frontmatter.triggers)) {
          if (frontmatter.triggers.some((t: string) => t.toLowerCase().includes(queryLower))) {
            return true;
          }
        }

        // Search in content
        if (s.content?.toLowerCase().includes(queryLower)) return true;

        // Search in category
        if (s.category?.toLowerCase().includes(queryLower)) return true;

        return false;
      })
      .map((s: any) => ({
        skill_key: s.skill_key,
        category: s.category || 'uncategorized',
        frontmatter: s.frontmatter || {},
        content: s.content || '',
        is_enabled: s.is_enabled ?? true,
        version: s.version ?? 1,
      }));

    // Apply category filter
    if (category) {
      filteredSkills = filteredSkills.filter((s) => s.category === category);
    }

    // Apply enabled filter
    if (enabledOnly) {
      filteredSkills = filteredSkills.filter((s) => s.is_enabled);
    }

    return {
      success: true,
      skills: filteredSkills,
      count: filteredSkills.length,
    };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('[searchSkills] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
