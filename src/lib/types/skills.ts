/**
 * Skills Types
 *
 * Type definitions for the skills folder structure system.
 * Supports folder-based organization with child documents and references.
 */

// =============================================================================
// Enums
// =============================================================================

/**
 * Document types for skill child documents
 */
export type SkillDocumentType = 'prompt' | 'example' | 'asset' | 'reference' | 'template';

/**
 * Reference target types
 */
export type SkillReferenceType = 'document' | 'skill' | 'variable' | 'folder';

/**
 * Skill categories
 */
export type SkillCategory =
  | 'sales-ai'
  | 'writing'
  | 'enrichment'
  | 'workflows'
  | 'data-access'
  | 'output-format';

/**
 * Skill types for AI matching
 */
export type SkillType = 'atomic' | 'sequence' | 'composite';

// =============================================================================
// Folder Structure Types
// =============================================================================

/**
 * Skill folder for organizing documents
 */
export interface SkillFolder {
  id: string;
  skill_id: string;
  name: string;
  description?: string;
  parent_folder_id: string | null;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Virtual fields from recursive query
  depth?: number;
  path?: string;
  // For tree rendering
  children?: SkillFolder[];
  documents?: SkillDocument[];
}

/**
 * Skill document (prompt, example, asset, etc.)
 */
export interface SkillDocument {
  id: string;
  skill_id: string;
  folder_id: string | null;
  title: string;
  description?: string;
  doc_type: SkillDocumentType;
  content: string;
  frontmatter: SkillDocumentFrontmatter;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Virtual fields
  folder_path?: string;
  references?: SkillReference[];
}

/**
 * Document frontmatter metadata
 */
export interface SkillDocumentFrontmatter {
  // Optional metadata for the document
  version?: number;
  author?: string;
  tags?: string[];
  variables_used?: string[];
  // Custom metadata
  [key: string]: unknown;
}

/**
 * Reference between documents/skills/variables
 */
export interface SkillReference {
  id: string;
  source_skill_id: string;
  source_document_id: string | null;
  target_type: SkillReferenceType;
  target_skill_id: string | null;
  target_document_id: string | null;
  target_variable: string | null;
  reference_text: string;
  reference_path?: string;
  start_position?: number;
  end_position?: number;
  created_at: string;
  // Resolved references (from join)
  target_skill_key?: string;
  target_document_title?: string;
}

// =============================================================================
// Enhanced Frontmatter Types (V2)
// =============================================================================

/**
 * Trigger definition for AI matching
 */
export interface SkillTrigger {
  /** Trigger pattern or keyword */
  pattern: string;
  /** Intent category this trigger matches */
  intent?: string;
  /** Match confidence threshold (0-1) */
  confidence?: number;
  /** Example phrases that match this trigger */
  examples?: string[];
}

/**
 * Input/output schema for skills
 */
export interface SkillIOSchema {
  /** Field name */
  name: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Field description */
  description?: string;
  /** Whether this field is required */
  required?: boolean;
  /** Default value */
  default?: unknown;
  /** Example value */
  example?: unknown;
}

/**
 * Enhanced skill frontmatter (V2)
 * Better structured for AI agent matching and execution
 */
export interface SkillFrontmatterV2 {
  // Identity
  name: string;
  description: string;
  category: SkillCategory;
  version: number;

  // Type classification
  skill_type: SkillType;

  // AI Matching
  triggers: SkillTrigger[];
  intent_patterns?: string[];
  keywords?: string[];

  // Context requirements
  required_context: string[];
  optional_context?: string[];

  // Input/Output schemas
  inputs?: SkillIOSchema[];
  outputs?: SkillIOSchema[];

  // Dependencies
  dependencies?: string[]; // Other skill keys this skill depends on
  child_skills?: string[]; // Skills this composite skill can invoke

  // Execution hints
  execution_mode?: 'sync' | 'async' | 'streaming';
  timeout_ms?: number;
  retry_count?: number;

  // Metadata
  author?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

/**
 * Legacy frontmatter (V1) for backward compatibility
 */
export interface SkillFrontmatterV1 {
  name: string;
  description: string;
  category: SkillCategory;
  version: number;
  triggers?: string[];
  requires_context?: string[];
  outputs?: string[];
  dependencies?: string[];
}

/**
 * Workflow step definition for sequences (V3)
 */
export interface SkillWorkflowStep {
  skill_key: string;
  label?: string;
  execution_mode?: 'sequential' | 'parallel';
  parallel_group?: string;
  input_mapping?: Record<string, string>;
  hitl_before?: boolean;
  hitl_after?: boolean;
}

/**
 * Agent Skills Standard frontmatter (V3)
 *
 * Compliant with the Agent Skills specification (agentskills.io).
 * Standard fields (`name`, `description`) are top-level.
 * All 60-specific extensions live under `metadata`.
 */
export interface SkillFrontmatterV3 {
  // ── Standard (spec-required) ──────────────────────────────────
  name: string;
  description: string;

  // ── 60-specific extensions ────────────────────────────────────
  metadata: {
    author?: string;
    version?: string;
    category: SkillCategory;
    skill_type: SkillType;
    is_active?: boolean;

    // AI matching
    triggers?: SkillTrigger[];
    intent_patterns?: string[];
    keywords?: string[];

    // Context requirements
    required_context?: string[];
    optional_context?: string[];

    // Input/Output schemas
    inputs?: SkillIOSchema[];
    outputs?: SkillIOSchema[];

    // Dependencies
    dependencies?: string[];
    child_skills?: string[];

    // Sequence workflow (sequences only)
    workflow?: SkillWorkflowStep[];
    linked_skills?: string[];

    // Execution hints
    execution_mode?: 'sync' | 'async' | 'streaming';
    timeout_ms?: number;
    retry_count?: number;

    // Tags
    tags?: string[];

    // Extensible
    [key: string]: unknown;
  };
}

/**
 * Union type for frontmatter (supports all versions)
 */
export type SkillFrontmatter = SkillFrontmatterV1 | SkillFrontmatterV2 | SkillFrontmatterV3;

/**
 * DB record shape produced by the SKILL.md parser (scripts/lib/skillParser.ts)
 */
export interface ParsedSkillRecord {
  skill_key: string;
  category: string;
  frontmatter: Record<string, unknown>;
  content_template: string;
  is_active: boolean;
  source_format: 'skill_md';
  source_path: string;
  source_hash: string;
}

// =============================================================================
// Skill Link Types (for Sequences / Mega Skills)
// =============================================================================

/**
 * Dynamic link from one skill (parent/sequence) to another skill
 * Used for sequences that orchestrate multiple skills via @skill-name references
 */
export interface SkillLink {
  id: string;
  parent_skill_id: string;
  linked_skill_id: string;
  folder_id: string | null;
  display_order: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Linked skill preview data (for displaying in folder tree)
 * Contains minimal data needed to render the link
 */
export interface LinkedSkillPreview {
  id: string;
  link_id: string;
  skill_key: string;
  name: string;
  description?: string;
  category: SkillCategory | string;
  folder_id: string | null;
  folder_name?: string;
  display_order: number;
  created_at: string;
}

/**
 * Skill that links to a given skill (reverse lookup)
 * For showing "used by" information
 */
export interface LinkingSkill {
  id: string;
  link_id: string;
  skill_key: string;
  name: string;
  category: SkillCategory | string;
  created_at: string;
}

/**
 * Search result for skills available to link
 */
export interface SkillSearchResult {
  id: string;
  skill_key: string;
  name: string;
  description?: string;
  category: SkillCategory | string;
  is_already_linked: boolean;
}

/**
 * Input for creating a skill link
 */
export interface CreateSkillLinkInput {
  parent_skill_id: string;
  linked_skill_id: string;
  folder_id?: string;
  display_order?: number;
}

/**
 * Input for updating a skill link
 */
export interface UpdateSkillLinkInput {
  folder_id?: string | null;
  display_order?: number;
}

// =============================================================================
// Skill Types
// =============================================================================

/**
 * Complete skill with folder structure
 */
export interface SkillWithFolders {
  id: string;
  skill_key: string;
  category: SkillCategory;
  namespace: 'copilot' | 'fleet' | 'slack' | 'shared';
  frontmatter: SkillFrontmatter;
  content_template: string;
  version: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Folder structure
  folders: SkillFolder[];
  documents: SkillDocument[];
  references: SkillReference[];
  // Linked skills (for sequences/mega skills)
  linked_skills?: LinkedSkillPreview[];
}

/**
 * Flat skill (without folder details)
 */
export interface Skill {
  skill_key: string;
  category: string;
  frontmatter: SkillFrontmatter;
  content: string;
  is_enabled: boolean;
  version: number;
}

// =============================================================================
// Tree Structure Types
// =============================================================================

/**
 * Tree node for rendering folder structure
 */
export interface SkillTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'document' | 'skill' | 'linked-skill';
  path: string;
  depth: number;
  parent_id: string | null;
  sort_order: number;
  // For documents
  doc_type?: SkillDocumentType;
  // For linked skills
  linked_skill_id?: string;
  linked_skill_key?: string;
  linked_skill_category?: string;
  link_id?: string;
  // For rendering
  isExpanded?: boolean;
  isSelected?: boolean;
  children?: SkillTreeNode[];
}

/**
 * Build tree structure from flat folder/document/linked skill lists
 */
export function buildSkillTree(
  folders: SkillFolder[],
  documents: SkillDocument[],
  skillKey: string,
  linkedSkills?: LinkedSkillPreview[]
): SkillTreeNode[] {
  const tree: SkillTreeNode[] = [];
  const folderMap = new Map<string, SkillTreeNode>();

  // Create folder nodes
  for (const folder of folders) {
    const node: SkillTreeNode = {
      id: folder.id,
      name: folder.name,
      type: 'folder',
      path: folder.path || folder.name,
      depth: folder.depth || 0,
      parent_id: folder.parent_folder_id,
      sort_order: folder.sort_order,
      children: [],
    };
    folderMap.set(folder.id, node);
  }

  // Build folder hierarchy
  for (const folder of folders) {
    const node = folderMap.get(folder.id)!;
    if (folder.parent_folder_id) {
      const parent = folderMap.get(folder.parent_folder_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
    } else {
      tree.push(node);
    }
  }

  // Add documents to their folders
  for (const doc of documents) {
    const docNode: SkillTreeNode = {
      id: doc.id,
      name: doc.title,
      type: 'document',
      path: doc.folder_path ? `${doc.folder_path}/${doc.title}` : doc.title,
      depth: doc.folder_path ? doc.folder_path.split('/').length : 0,
      parent_id: doc.folder_id,
      sort_order: doc.sort_order,
      doc_type: doc.doc_type,
    };

    if (doc.folder_id) {
      const parent = folderMap.get(doc.folder_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(docNode);
      }
    } else {
      tree.push(docNode);
    }
  }

  // Add linked skills to their folders (displayed with @ prefix)
  if (linkedSkills) {
    for (const link of linkedSkills) {
      const linkNode: SkillTreeNode = {
        id: link.link_id, // Use link_id as the node id for tree operations
        name: `@${link.skill_key}`, // Display with @ prefix
        type: 'linked-skill',
        path: link.folder_name ? `${link.folder_name}/@${link.skill_key}` : `@${link.skill_key}`,
        depth: link.folder_name ? 1 : 0,
        parent_id: link.folder_id,
        sort_order: link.display_order,
        linked_skill_id: link.id,
        linked_skill_key: link.skill_key,
        linked_skill_category: link.category,
        link_id: link.link_id,
      };

      if (link.folder_id) {
        const parent = folderMap.get(link.folder_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(linkNode);
        }
      } else {
        tree.push(linkNode);
      }
    }
  }

  // Sort children by sort_order then name
  const sortNodes = (nodes: SkillTreeNode[]) => {
    nodes.sort((a, b) => {
      // Folders first, then linked-skills, then documents
      const typeOrder = { folder: 0, 'linked-skill': 1, document: 2, skill: 3 };
      const aOrder = typeOrder[a.type] ?? 4;
      const bOrder = typeOrder[b.type] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Then by sort_order
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      // Then by name
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(tree);

  return tree;
}

// =============================================================================
// Reference Parsing Types
// =============================================================================

/**
 * Parsed reference from content
 */
export interface ParsedReference {
  type: SkillReferenceType;
  text: string;
  path?: string;
  start: number;
  end: number;
}

/**
 * Parse @ mentions and {variables} from content
 */
export function parseReferences(content: string): ParsedReference[] {
  const references: ParsedReference[] = [];

  // Match @folder/document.md or @skill-key patterns
  const atMentionRegex = /@([\w\-\/\.]+)/g;
  let match;
  while ((match = atMentionRegex.exec(content)) !== null) {
    const path = match[1];
    const isSkill = !path.includes('/') && !path.includes('.');
    references.push({
      type: isSkill ? 'skill' : 'document',
      text: match[0],
      path: path,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Match {variable} patterns
  const variableRegex = /\{([\w_]+)\}/g;
  while ((match = variableRegex.exec(content)) !== null) {
    references.push({
      type: 'variable',
      text: match[0],
      path: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Also match ${variable} patterns for backward compatibility
  const dollarVariableRegex = /\$\{([\w_\.]+)\}/g;
  while ((match = dollarVariableRegex.exec(content)) !== null) {
    references.push({
      type: 'variable',
      text: match[0],
      path: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return references;
}

// =============================================================================
// Organization Context Variables
// =============================================================================

/**
 * Available organization context variables for interpolation
 */
export const ORGANIZATION_CONTEXT_VARIABLES = [
  // Company basics
  'company_name',
  'tagline',
  'description',
  'industry',
  'employee_count',
  'founding_year',
  'headquarters',
  'logo_url',

  // Products & value
  'products',
  'value_propositions',
  'use_cases',

  // Market intelligence
  'competitors',
  'target_market',
  'ideal_customer_profile',
  'ICP_profile',

  // Team
  'key_people',
  'recent_hires',
  'open_roles',
  'tech_stack',

  // Social proof
  'customer_logos',
  'case_studies',
  'reviews_summary',

  // Opportunities
  'pain_points',
  'buying_signals',
  'recent_news',
] as const;

export type OrganizationContextVariable = (typeof ORGANIZATION_CONTEXT_VARIABLES)[number];

/**
 * Variable autocomplete suggestion
 */
export interface VariableSuggestion {
  name: string;
  description: string;
  category: 'company' | 'products' | 'market' | 'team' | 'social' | 'opportunities';
  example?: string;
}

/**
 * Get variable suggestions for autocomplete
 */
export function getVariableSuggestions(): VariableSuggestion[] {
  return [
    // Company basics
    { name: 'company_name', description: 'Organization name', category: 'company', example: 'Acme Corp' },
    { name: 'tagline', description: 'Company tagline', category: 'company', example: 'Making things better' },
    { name: 'description', description: 'Company description', category: 'company' },
    { name: 'industry', description: 'Industry vertical', category: 'company', example: 'SaaS' },
    { name: 'employee_count', description: 'Number of employees', category: 'company', example: '50-200' },
    { name: 'founding_year', description: 'Year founded', category: 'company', example: '2020' },
    { name: 'headquarters', description: 'HQ location', category: 'company', example: 'San Francisco, CA' },

    // Products
    { name: 'products', description: 'Product list', category: 'products' },
    { name: 'value_propositions', description: 'Key value props', category: 'products' },
    { name: 'use_cases', description: 'Common use cases', category: 'products' },

    // Market
    { name: 'competitors', description: 'Key competitors', category: 'market' },
    { name: 'target_market', description: 'Target market description', category: 'market' },
    { name: 'ideal_customer_profile', description: 'ICP definition', category: 'market' },
    { name: 'ICP_profile', description: 'ICP profile (alias)', category: 'market' },

    // Team
    { name: 'key_people', description: 'Key team members', category: 'team' },
    { name: 'tech_stack', description: 'Technology stack', category: 'team' },

    // Social proof
    { name: 'customer_logos', description: 'Customer logo list', category: 'social' },
    { name: 'case_studies', description: 'Case study references', category: 'social' },

    // Opportunities
    { name: 'pain_points', description: 'Customer pain points', category: 'opportunities' },
    { name: 'buying_signals', description: 'Buying signals to watch', category: 'opportunities' },
    { name: 'recent_news', description: 'Recent company news', category: 'opportunities' },
  ];
}
