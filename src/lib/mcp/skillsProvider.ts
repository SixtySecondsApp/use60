/**
 * MCP Skills Provider
 *
 * Provides skills context to AI agents via the MCP protocol.
 * Integrates with the Agent-Executable Skills Platform.
 *
 * Features:
 * - List all available skills for an organization
 * - Get a specific skill by key
 * - Search skills by query string
 * - Filter by category and enabled status
 *
 * @see platform-controlled-skills-for-orgs.md - Phase 5: Agent Integration
 */

import { supabase } from '../supabase/clientV2';
import { MCPServer, MCPTool, MCPResource, MCPPrompt } from './mcpServer';

// =============================================================================
// Types
// =============================================================================

/**
 * Skill frontmatter metadata (from YAML/JSON header)
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  category: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format' | 'agent-sequence';
  version: number;
  triggers?: string[];
  requires_context?: string[];
  outputs?: string[];
  dependencies?: string[];
  // Present when category === 'agent-sequence'
  sequence_steps?: unknown[];
}

/**
 * Complete skill document with metadata and content
 */
export interface Skill {
  skill_key: string;
  kind: 'skill' | 'sequence';
  category: string;
  frontmatter: SkillFrontmatter;
  content: string;
  step_count?: number;
  is_enabled: boolean;
  version: number;
}

/**
 * Response from the skills edge function
 */
interface SkillsApiResponse {
  success: boolean;
  skills?: Skill[];
  skill?: Skill | null;
  count?: number;
  error?: string;
}

// =============================================================================
// Skills Provider Class
// =============================================================================

/**
 * SkillsProvider - MCP provider for organization skills
 *
 * Usage:
 * ```typescript
 * const provider = new SkillsProvider(organizationId);
 *
 * // List all skills
 * const skills = await provider.listSkills();
 *
 * // Get a specific skill
 * const skill = await provider.getSkill('lead-qualification');
 *
 * // Search skills
 * const results = await provider.searchSkills('objection');
 * ```
 */
export class SkillsProvider {
  private organizationId: string;
  private cache: Map<string, { data: Skill[]; timestamp: number }> = new Map();
  private cacheTtl = 60000; // 1 minute cache

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * List all skills for the organization
   *
   * @param category - Optional category filter
   * @param enabledOnly - Only return enabled skills (default: true)
   * @returns Array of skills
   */
  async listSkills(
    category?: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format' | 'agent-sequence',
    enabledOnly = true,
    kind: 'skill' | 'sequence' | 'all' = 'all'
  ): Promise<Skill[]> {
    try {
      // Check cache
      const cacheKey = `list:${category || 'all'}:${enabledOnly}:${kind}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        return cached.data;
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke<SkillsApiResponse>(
        'get-agent-skills',
        {
          body: {
            action: 'list',
            organization_id: this.organizationId,
            category,
            kind,
            enabled_only: enabledOnly,
          },
        }
      );

      if (error) {
        console.error('[SkillsProvider.listSkills] Error:', error);
        throw new Error(`Failed to list skills: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to list skills');
      }

      const skills = data.skills || [];

      // Update cache
      this.cache.set(cacheKey, { data: skills, timestamp: Date.now() });

      return skills;
    } catch (error) {
      console.error('[SkillsProvider.listSkills] Error:', error);
      throw error;
    }
  }

  /**
   * Get a specific skill by key
   *
   * @param skillKey - The skill identifier (e.g., 'lead-qualification')
   * @returns The skill or null if not found
   */
  async getSkill(skillKey: string): Promise<Skill | null> {
    try {
      // Check cache first
      const cacheKey = `skill:${skillKey}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        return cached.data[0] || null;
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke<SkillsApiResponse>(
        'get-agent-skills',
        {
          body: {
            action: 'get',
            organization_id: this.organizationId,
            skill_key: skillKey,
          },
        }
      );

      if (error) {
        console.error('[SkillsProvider.getSkill] Error:', error);
        throw new Error(`Failed to get skill: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to get skill');
      }

      const skill = data.skill || null;

      // Update cache
      if (skill) {
        this.cache.set(cacheKey, { data: [skill], timestamp: Date.now() });
      }

      return skill;
    } catch (error) {
      console.error('[SkillsProvider.getSkill] Error:', error);
      throw error;
    }
  }

  /**
   * Search skills by query string
   *
   * Searches in:
   * - skill_key
   * - frontmatter.name
   * - frontmatter.description
   * - frontmatter.triggers
   * - content
   * - category
   *
   * @param query - Search query string
   * @param category - Optional category filter
   * @param enabledOnly - Only return enabled skills (default: true)
   * @returns Array of matching skills
   */
  async searchSkills(
    query: string,
    category?: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format' | 'agent-sequence',
    enabledOnly = true,
    kind: 'skill' | 'sequence' | 'all' = 'all'
  ): Promise<Skill[]> {
    try {
      // Call edge function
      const { data, error } = await supabase.functions.invoke<SkillsApiResponse>(
        'get-agent-skills',
        {
          body: {
            action: 'search',
            organization_id: this.organizationId,
            query,
            category,
            kind,
            enabled_only: enabledOnly,
          },
        }
      );

      if (error) {
        console.error('[SkillsProvider.searchSkills] Error:', error);
        throw new Error(`Failed to search skills: ${error.message}`);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to search skills');
      }

      return data.skills || [];
    } catch (error) {
      console.error('[SkillsProvider.searchSkills] Error:', error);
      throw error;
    }
  }

  /**
   * Get skills by category
   *
   * @param category - The skill category
   * @returns Array of skills in that category
   */
  async getSkillsByCategory(
    category: 'sales-ai' | 'writing' | 'enrichment' | 'workflows' | 'data-access' | 'output-format' | 'agent-sequence'
  ): Promise<Skill[]> {
    return this.listSkills(category);
  }

  /**
   * Get skills by trigger
   *
   * @param trigger - The trigger to match (e.g., 'lead_created')
   * @returns Array of skills that respond to this trigger
   */
  async getSkillsByTrigger(trigger: string): Promise<Skill[]> {
    const allSkills = await this.listSkills();
    return allSkills.filter((skill) => {
      const triggers = skill.frontmatter?.triggers || [];
      return triggers.includes(trigger);
    });
  }

  /**
   * Get skill content formatted for AI consumption
   *
   * @param skillKey - The skill identifier
   * @returns Formatted skill content or null
   */
  async getSkillContent(skillKey: string): Promise<string | null> {
    const skill = await this.getSkill(skillKey);
    if (!skill) return null;

    // Format as readable document
    const frontmatter = skill.frontmatter;
    const header = [
      `# ${frontmatter.name || skillKey}`,
      '',
      frontmatter.description || '',
      '',
      `**Category:** ${skill.category}`,
      `**Version:** ${skill.version}`,
    ];

    if (frontmatter.triggers?.length) {
      header.push(`**Triggers:** ${frontmatter.triggers.join(', ')}`);
    }

    if (frontmatter.requires_context?.length) {
      header.push(`**Required Context:** ${frontmatter.requires_context.join(', ')}`);
    }

    header.push('', '---', '');

    return [...header, skill.content].join('\n');
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set cache TTL (time to live) in milliseconds
   */
  setCacheTtl(ttl: number): void {
    this.cacheTtl = ttl;
  }
}

// =============================================================================
// MCP Skills Server
// =============================================================================

/**
 * SkillsMCPServer - MCP server implementation for skills
 *
 * Provides skills access through the MCP protocol for AI agents.
 */
export class SkillsMCPServer extends MCPServer {
  private provider: SkillsProvider;
  private organizationId: string;

  constructor(organizationId: string) {
    super('skills-mcp-server', '1.0.0');
    this.organizationId = organizationId;
    this.provider = new SkillsProvider(organizationId);
  }

  protected async listTools(): Promise<MCPTool[]> {
    return [
      {
        name: 'list_skills',
        description: 'List all available skills for the organization',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category: sales-ai, writing, enrichment, workflows, data-access, output-format',
              enum: ['sales-ai', 'writing', 'enrichment', 'workflows', 'data-access', 'output-format'],
            },
            enabled_only: {
              type: 'boolean',
              description: 'Only return enabled skills (default: true)',
              default: true,
            },
          },
        },
      },
      {
        name: 'get_skill',
        description: 'Get a specific skill by its key',
        inputSchema: {
          type: 'object',
          properties: {
            skill_key: {
              type: 'string',
              description: 'The skill identifier (e.g., lead-qualification)',
            },
          },
          required: ['skill_key'],
        },
      },
      {
        name: 'search_skills',
        description: 'Search skills by query string',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against skill content and metadata',
            },
            category: {
              type: 'string',
              description: 'Optional category filter',
              enum: ['sales-ai', 'writing', 'enrichment', 'workflows', 'data-access', 'output-format'],
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_skills_by_trigger',
        description: 'Get skills that respond to a specific trigger',
        inputSchema: {
          type: 'object',
          properties: {
            trigger: {
              type: 'string',
              description: 'The trigger to match (e.g., lead_created, deal_won)',
            },
          },
          required: ['trigger'],
        },
      },
      {
        name: 'get_skill_content',
        description: 'Get formatted skill content ready for AI consumption',
        inputSchema: {
          type: 'object',
          properties: {
            skill_key: {
              type: 'string',
              description: 'The skill identifier',
            },
          },
          required: ['skill_key'],
        },
      },
    ];
  }

  protected async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'list_skills':
        return this.provider.listSkills(
          args.category as
            | 'sales-ai'
            | 'writing'
            | 'enrichment'
            | 'workflows'
            | 'data-access'
            | 'output-format'
            | undefined,
          args.enabled_only !== false
        );

      case 'get_skill':
        return this.provider.getSkill(args.skill_key as string);

      case 'search_skills':
        return this.provider.searchSkills(
          args.query as string,
          args.category as
            | 'sales-ai'
            | 'writing'
            | 'enrichment'
            | 'workflows'
            | 'data-access'
            | 'output-format'
            | undefined
        );

      case 'get_skills_by_trigger':
        return this.provider.getSkillsByTrigger(args.trigger as string);

      case 'get_skill_content':
        return this.provider.getSkillContent(args.skill_key as string);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  protected async listResources(): Promise<MCPResource[]> {
    // Get all skills to list as resources
    const skills = await this.provider.listSkills();

    return skills.map((skill) => ({
      uri: `skill://${this.organizationId}/${skill.skill_key}`,
      name: skill.frontmatter?.name || skill.skill_key,
      description: skill.frontmatter?.description,
      mimeType: 'text/markdown',
    }));
  }

  protected async getResource(uri: string): Promise<{ contents: string }> {
    // Parse URI: skill://org-id/skill-key
    const match = uri.match(/^skill:\/\/[^/]+\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid skill URI: ${uri}`);
    }

    const skillKey = match[1];
    const content = await this.provider.getSkillContent(skillKey);

    if (!content) {
      throw new Error(`Skill not found: ${skillKey}`);
    }

    return { contents: content };
  }

  protected async listPrompts(): Promise<MCPPrompt[]> {
    return [
      {
        name: 'use_skill',
        description: 'Generate a prompt to use a specific skill',
        arguments: [
          {
            name: 'skill_key',
            description: 'The skill to use',
            required: true,
          },
          {
            name: 'context',
            description: 'Additional context for the skill execution',
            required: false,
          },
        ],
      },
      {
        name: 'find_relevant_skill',
        description: 'Find the most relevant skill for a given task',
        arguments: [
          {
            name: 'task_description',
            description: 'Description of the task to accomplish',
            required: true,
          },
        ],
      },
    ];
  }

  protected async getPrompt(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'use_skill': {
        const skillKey = args.skill_key as string;
        const context = args.context as string | undefined;
        const content = await this.provider.getSkillContent(skillKey);

        if (!content) {
          throw new Error(`Skill not found: ${skillKey}`);
        }

        let prompt = `You are using the following skill to accomplish a task:\n\n${content}`;
        if (context) {
          prompt += `\n\n## Additional Context\n\n${context}`;
        }
        prompt += '\n\nFollow the skill instructions precisely and apply them to the current task.';

        return prompt;
      }

      case 'find_relevant_skill': {
        const taskDescription = args.task_description as string;
        const skills = await this.provider.searchSkills(taskDescription);

        if (skills.length === 0) {
          return `No relevant skills found for task: "${taskDescription}". Please try a different search term or list all skills.`;
        }

        const skillList = skills
          .map(
            (s) =>
              `- **${s.frontmatter?.name || s.skill_key}** (${s.category}): ${s.frontmatter?.description || 'No description'}`
          )
          .join('\n');

        return `Based on the task "${taskDescription}", the following skills may be relevant:\n\n${skillList}\n\nUse the get_skill_content tool to retrieve the full skill content before applying it.`;
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new SkillsProvider instance
 */
export function createSkillsProvider(organizationId: string): SkillsProvider {
  return new SkillsProvider(organizationId);
}

/**
 * Create a new SkillsMCPServer instance
 */
export function createSkillsMCPServer(organizationId: string): SkillsMCPServer {
  return new SkillsMCPServer(organizationId);
}
