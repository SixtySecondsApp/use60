/**
 * Autonomous Executor
 *
 * Enables Claude to autonomously decide which skills to use via native tool use.
 * Skills are exposed as tools that Claude can discover and invoke based on user intent.
 *
 * Flow:
 * 1. Load all active skills and convert to tool definitions
 * 2. Send user message to Claude with tools available
 * 3. Claude decides which tool(s) to call (or asks clarifying questions)
 * 4. Execute the tools, return results to Claude
 * 5. Claude continues until task is complete
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../../supabase/clientV2';
import type { SkillFrontmatterV2 } from '../../types/skills';

// =============================================================================
// Types
// =============================================================================

export interface SkillToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  // Internal metadata (not sent to Claude)
  _skillId: string;
  _skillKey: string;
  _category: string;
  _isSequence: boolean;
}

export interface ExecutorConfig {
  organizationId: string;
  userId: string;
  /** Optional organization context to inject */
  orgContext?: Record<string, unknown>;
  /** Model to use (default: claude-haiku-4-5) */
  model?: string;
  /** Maximum tool use iterations (default: 10) */
  maxIterations?: number;
  /** System prompt additions */
  systemPromptAdditions?: string;
}

export interface ExecutorMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallInfo[];
  toolResults?: ToolResultInfo[];
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultInfo {
  toolUseId: string;
  result: unknown;
  isError: boolean;
}

export interface ExecutorResult {
  success: boolean;
  response: string;
  messages: ExecutorMessage[];
  toolsUsed: string[];
  iterations: number;
  error?: string;
}

// =============================================================================
// Skill to Tool Conversion
// =============================================================================

/**
 * Convert a skill's frontmatter to a Claude tool definition
 */
function skillToTool(skill: {
  skill_key: string;
  category: string;
  frontmatter: SkillFrontmatterV2;
  content: string;
}): SkillToolDefinition {
  const fm = skill.frontmatter;

  // Build input schema from skill's inputs definition
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Add inputs from frontmatter
  if (fm.inputs && Array.isArray(fm.inputs)) {
    for (const input of fm.inputs) {
      properties[input.name] = {
        type: input.type || 'string',
        description: input.description || `Input: ${input.name}`,
      };
      if (input.required) {
        required.push(input.name);
      }
    }
  }

  // Add required_context as optional inputs
  if (fm.required_context && Array.isArray(fm.required_context)) {
    for (const ctx of fm.required_context) {
      if (!properties[ctx]) {
        properties[ctx] = {
          type: 'string',
          description: `Context: ${ctx}`,
        };
      }
    }
  }

  // If no inputs defined, add a generic "query" input
  if (Object.keys(properties).length === 0) {
    properties['query'] = {
      type: 'string',
      description: 'The query or request for this skill',
    };
  }

  // Build description from frontmatter
  let description = fm.description || `Execute the ${fm.name || skill.skill_key} skill`;

  // Add trigger examples to help Claude understand when to use this tool
  if (fm.triggers && fm.triggers.length > 0) {
    const triggerExamples = fm.triggers
      .slice(0, 3)
      .map((t) => (typeof t === 'string' ? t : t.pattern))
      .join(', ');
    description += ` Use when user mentions: ${triggerExamples}.`;
  }

  // Add output info if available
  if (fm.outputs && fm.outputs.length > 0) {
    const outputNames = fm.outputs.map((o) => o.name).join(', ');
    description += ` Returns: ${outputNames}.`;
  }

  return {
    name: skill.skill_key.replace(/[^a-zA-Z0-9_-]/g, '_'),
    description: description.slice(0, 1024), // Claude limit
    input_schema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
    _skillId: skill.skill_key, // Uses skill_key (RPC doesn't return UUID id)
    _skillKey: skill.skill_key,
    _category: skill.category,
    _isSequence: skill.category === 'agent-sequence',
  };
}

// =============================================================================
// Autonomous Executor Class
// =============================================================================

export class AutonomousExecutor {
  private config: Required<ExecutorConfig>;
  private anthropic: Anthropic;
  private tools: SkillToolDefinition[] = [];
  private skillContentCache: Map<string, string> = new Map();

  constructor(config: ExecutorConfig) {
    this.config = {
      organizationId: config.organizationId,
      userId: config.userId,
      orgContext: config.orgContext || {},
      model: config.model || 'claude-haiku-4-5',
      maxIterations: config.maxIterations || 10,
      systemPromptAdditions: config.systemPromptAdditions || '',
    };

    this.anthropic = new Anthropic();
  }

  /**
   * Initialize by loading all available skills as tools.
   * Only loads Tier 1 (metadata/frontmatter) — content_template is lazy-loaded
   * on first execution to reduce startup token cost.
   */
  async initialize(): Promise<void> {
    // Load from organization_skills via RPC (compiled, org-specific skills)
    const { data: skills, error } = await supabase
      .rpc('get_organization_skills_for_agent', {
        p_org_id: this.config.organizationId,
      }) as { data: Array<{ skill_key: string; category: string; frontmatter: Record<string, unknown>; content: string; is_enabled: boolean }> | null; error: { message: string } | null };

    if (error) {
      console.error('[AutonomousExecutor.initialize] Error loading skills:', error);
      throw new Error(`Failed to load skills: ${error.message}`);
    }

    // Filter out HITL skills and convert to tool definitions
    const activeSkills = (skills || []).filter(
      (s) => s.category !== 'hitl'
    );

    this.tools = activeSkills.map((skill) =>
      skillToTool({
        skill_key: skill.skill_key,
        category: skill.category,
        frontmatter: skill.frontmatter as SkillFrontmatterV2,
        content: '', // Content used only during execution, not in tool definition
      })
    );

    // Pre-cache content from the RPC response (already compiled for this org)
    this.skillContentCache.clear();
    for (const skill of activeSkills) {
      if (skill.content) {
        this.skillContentCache.set(skill.skill_key, skill.content);
      }
    }

    console.log(`[AutonomousExecutor] Initialized with ${this.tools.length} tools from organization_skills`);
  }

  /**
   * Execute a user request autonomously
   * Claude will decide which skills to use
   */
  async execute(userMessage: string): Promise<ExecutorResult> {
    if (this.tools.length === 0) {
      await this.initialize();
    }

    const messages: ExecutorMessage[] = [];
    const toolsUsed: string[] = [];
    let iterations = 0;

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt();

    // Build Claude tools array (without internal metadata)
    const claudeTools: Anthropic.Tool[] = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    // Initial message history for Claude
    let claudeMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    messages.push({ role: 'user', content: userMessage });

    try {
      // Agentic loop - let Claude decide what to do
      while (iterations < this.config.maxIterations) {
        iterations++;

        // Call Claude
        const response = await this.anthropic.messages.create({
          model: this.config.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: claudeTools,
          messages: claudeMessages,
        });

        // Check stop reason
        if (response.stop_reason === 'end_turn') {
          // Claude is done - extract text response
          const textContent = response.content.find((c) => c.type === 'text');
          const finalResponse = textContent?.type === 'text' ? textContent.text : '';

          messages.push({ role: 'assistant', content: finalResponse });

          return {
            success: true,
            response: finalResponse,
            messages,
            toolsUsed: [...new Set(toolsUsed)],
            iterations,
          };
        }

        if (response.stop_reason === 'tool_use') {
          // Claude wants to use tools
          const toolUseBlocks = response.content.filter(
            (c) => c.type === 'tool_use'
          ) as Anthropic.ToolUseBlock[];

          const textBlock = response.content.find((c) => c.type === 'text');
          const assistantText = textBlock?.type === 'text' ? textBlock.text : '';

          const toolCalls: ToolCallInfo[] = [];
          const toolResults: ToolResultInfo[] = [];

          // Execute each tool call
          for (const toolUse of toolUseBlocks) {
            toolCalls.push({
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
            });

            toolsUsed.push(toolUse.name);

            try {
              const result = await this.executeTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>
              );

              toolResults.push({
                toolUseId: toolUse.id,
                result,
                isError: false,
              });
            } catch (toolError) {
              const errorMsg =
                toolError instanceof Error ? toolError.message : String(toolError);

              toolResults.push({
                toolUseId: toolUse.id,
                result: { error: errorMsg },
                isError: true,
              });
            }
          }

          messages.push({
            role: 'assistant',
            content: assistantText,
            toolCalls,
          });

          // Add assistant message with tool use to Claude messages
          claudeMessages.push({
            role: 'assistant',
            content: response.content,
          });

          // Add tool results to Claude messages
          claudeMessages.push({
            role: 'user',
            content: toolResults.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.toolUseId,
              content: JSON.stringify(tr.result),
              is_error: tr.isError,
            })),
          });

          messages.push({
            role: 'user',
            content: '[Tool results returned]',
            toolResults,
          });

          // Continue the loop for Claude to process results
          continue;
        }

        // Unexpected stop reason
        console.warn(
          `[AutonomousExecutor] Unexpected stop reason: ${response.stop_reason}`
        );
        break;
      }

      // Max iterations reached
      return {
        success: false,
        response: 'Maximum iterations reached without completing the task.',
        messages,
        toolsUsed: [...new Set(toolsUsed)],
        iterations,
        error: 'max_iterations_reached',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[AutonomousExecutor.execute] Error:', error);

      return {
        success: false,
        response: `An error occurred: ${errorMsg}`,
        messages,
        toolsUsed: [...new Set(toolsUsed)],
        iterations,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute a skill tool
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    // Find the tool definition
    const tool = this.tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Tier 2: Load skill content (normally pre-cached from initialize RPC response)
    let skillContent = this.skillContentCache.get(tool._skillKey);
    if (!skillContent) {
      // Fallback: fetch from organization_skills (compiled content for this org)
      const { data, error: contentError } = await supabase
        .from('organization_skills')
        .select('compiled_content')
        .eq('skill_id', tool._skillKey)
        .eq('organization_id', this.config.organizationId)
        .maybeSingle();

      if (contentError || !data?.compiled_content) {
        throw new Error(`Failed to load content for skill: ${tool._skillKey}`);
      }

      skillContent = data.compiled_content;
      this.skillContentCache.set(tool._skillKey, skillContent);
    }

    // Build context for skill execution
    const context = {
      ...this.config.orgContext,
      ...input,
      user_id: this.config.userId,
      organization_id: this.config.organizationId,
    };

    // Execute skill via Claude (skill content as system prompt)
    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: `You are executing a skill. Follow the instructions precisely.

${skillContent}

Respond with a JSON object containing the result. If the skill defines outputs, include those fields.`,
      messages: [
        {
          role: 'user',
          content: `Execute this skill with the following context:\n\n${JSON.stringify(context, null, 2)}`,
        },
      ],
    });

    // Extract response
    const textContent = response.content.find((c) => c.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    // Try to parse as JSON
    try {
      // Find JSON in response (might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
        responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr);
      }
    } catch {
      // If not JSON, return as text
    }

    return { result: responseText };
  }

  /**
   * Build the system prompt for the autonomous executor
   */
  private buildSystemPrompt(): string {
    const toolCategories = new Map<string, string[]>();
    for (const tool of this.tools) {
      const category = tool._category;
      if (!toolCategories.has(category)) {
        toolCategories.set(category, []);
      }
      toolCategories.get(category)!.push(tool.name);
    }

    const categoryList = Array.from(toolCategories.entries())
      .map(([cat, tools]) => `- **${cat}**: ${tools.join(', ')}`)
      .join('\n');

    let prompt = `You are an AI assistant for a sales intelligence platform called Sixty.

You have access to various skills (tools) that help users with sales tasks. Your job is to:
1. Understand what the user wants to accomplish
2. Decide which skill(s) to use to help them
3. Execute those skills with appropriate inputs
4. Synthesize the results into a helpful response

## Available Skill Categories

${categoryList}

## Guidelines

- **Sequences First**: If a task involves multiple steps (e.g., "full deal review"), look for a sequence skill (category: agent-sequence) that orchestrates the workflow.
- **Ask if Unclear**: If you need more information to execute a skill properly, ask the user before proceeding.
- **Chain Skills**: You can call multiple skills in sequence if needed to accomplish a complex task.
- **Explain Your Actions**: Briefly tell the user what you're doing when you use a skill.
- **Handle Errors Gracefully**: If a skill fails, explain what happened and suggest alternatives.

## Organization Context

The user belongs to organization: ${this.config.organizationId}
${Object.keys(this.config.orgContext).length > 0 ? `\nAvailable context: ${Object.keys(this.config.orgContext).join(', ')}` : ''}
`;

    if (this.config.systemPromptAdditions) {
      prompt += `\n\n${this.config.systemPromptAdditions}`;
    }

    return prompt;
  }

  /**
   * Get list of available tools (for UI display)
   */
  getAvailableTools(): Array<{
    name: string;
    description: string;
    category: string;
    isSequence: boolean;
  }> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      category: t._category,
      isSequence: t._isSequence,
    }));
  }

  /**
   * Reload skills (call after skill changes)
   */
  async reload(): Promise<void> {
    this.tools = [];
    this.skillContentCache.clear();
    await this.initialize();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an autonomous executor instance
 */
export function createAutonomousExecutor(
  config: ExecutorConfig
): AutonomousExecutor {
  return new AutonomousExecutor(config);
}
