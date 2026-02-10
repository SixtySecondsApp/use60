/**
 * Specialist Agent Runner
 *
 * Runs a specialist agent with scoped tools and action whitelisting.
 * Reuses the same 4-tool architecture as copilot-autonomous but restricts
 * which execute_action actions each agent can use.
 *
 * Each agent gets:
 *   - A focused system prompt defining its personality and domain
 *   - A filtered subset of allowed actions
 *   - A configurable model (from org config)
 *   - Standard agentic iteration loop
 */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { AgentName, SpecialistResult } from './agentConfig.ts';
import { executeAction } from './copilot_adapters/executeAction.ts';
import type { ExecuteActionName } from './copilot_adapters/types.ts';
import { resolveEntity } from './resolveEntityAdapter.ts';
import { handleListSkills, handleGetSkill, resolveOrgId } from './skillsToolHandlers.ts';
import { logAICostEvent } from './costTracking.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface SpecialistConfig {
  name: AgentName;
  displayName: string;
  model: string;
  systemPrompt: string;
  allowedActions: string[];
  skillCategories: string[];
  maxIterations: number;
}

export interface SpecialistDeps {
  anthropic: Anthropic;
  supabase: SupabaseClient;
  userId: string;
  orgId: string;
}

export interface StreamWriter {
  sendSSE: (event: string, data: unknown) => Promise<void>;
}

// =============================================================================
// Tool Definitions (scoped per agent)
// =============================================================================

function buildScopedTools(config: SpecialistConfig): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    // resolve_entity always available
    {
      name: 'resolve_entity',
      description: 'Resolve a person mentioned by first name to a specific CRM contact.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Name to search for' },
          context_hint: { type: 'string', description: 'Context to help disambiguate' },
        },
        required: ['name'],
      },
    },
    // list_skills scoped to agent's categories
    {
      name: 'list_skills',
      description: `List available skills (filtered to: ${config.skillCategories.join(', ')}).`,
      input_schema: {
        type: 'object' as const,
        properties: {
          kind: { type: 'string', enum: ['skill', 'sequence', 'all'] },
          category: { type: 'string', enum: config.skillCategories },
          enabled_only: { type: 'boolean' },
        },
      },
    },
    // get_skill always available
    {
      name: 'get_skill',
      description: 'Retrieve a skill document by key.',
      input_schema: {
        type: 'object' as const,
        properties: {
          skill_key: { type: 'string', description: 'Skill identifier' },
        },
        required: ['skill_key'],
      },
    },
    // execute_action scoped to allowed actions
    {
      name: 'execute_action',
      description: `Execute a CRM action. You can use: ${config.allowedActions.join(', ')}`,
      input_schema: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            enum: config.allowedActions,
            description: 'The action to execute',
          },
          params: {
            type: 'object',
            description: 'Parameters for the action',
          },
        },
        required: ['action'],
      },
    },
  ];

  return tools;
}

// =============================================================================
// Tool Execution with Whitelist
// =============================================================================

async function executeSpecialistToolCall(
  toolName: string,
  input: Record<string, unknown>,
  config: SpecialistConfig,
  deps: SpecialistDeps
): Promise<unknown> {
  const resolvedOrgId = await resolveOrgId(deps.supabase, deps.userId, deps.orgId);

  switch (toolName) {
    case 'resolve_entity':
      return await resolveEntity(deps.supabase, deps.userId, resolvedOrgId, {
        name: input.name ? String(input.name) : undefined,
        context_hint: input.context_hint ? String(input.context_hint) : undefined,
      });

    case 'list_skills':
      return await handleListSkills(deps.supabase, resolvedOrgId, {
        kind: input.kind ? String(input.kind) : undefined,
        category: input.category ? String(input.category) : undefined,
        enabled_only: input.enabled_only !== false,
      });

    case 'get_skill': {
      const skillKey = input.skill_key ? String(input.skill_key) : '';
      return await handleGetSkill(deps.supabase, resolvedOrgId, skillKey);
    }

    case 'execute_action': {
      const action = String(input.action) as ExecuteActionName;

      // Enforce action whitelist
      if (!config.allowedActions.includes(action)) {
        return {
          success: false,
          error: `Action '${action}' is not available for the ${config.displayName} agent. Available: ${config.allowedActions.join(', ')}`,
        };
      }

      const params = (input.params || {}) as Record<string, unknown>;
      return await executeAction(deps.supabase, deps.userId, resolvedOrgId, action, params);
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// =============================================================================
// Specialist Runner
// =============================================================================

/**
 * Run a specialist agent with scoped tools and return the result.
 * Optionally streams SSE events via the streamWriter.
 */
export async function runSpecialist(
  config: SpecialistConfig,
  userMessage: string,
  context: string,
  deps: SpecialistDeps,
  streamWriter?: StreamWriter,
  parentExecutionId?: string
): Promise<SpecialistResult> {
  const startTime = Date.now();
  const tools = buildScopedTools(config);
  const toolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;
  let responseText = '';

  // Log execution start
  let executionId: string | null = null;
  try {
    const { data } = await deps.supabase
      .from('copilot_executions')
      .insert({
        organization_id: deps.orgId,
        user_id: deps.userId,
        user_message: userMessage,
        execution_mode: 'autonomous',
        model: config.model,
        agent_name: config.name,
        parent_execution_id: parentExecutionId || null,
        delegation_reason: `Delegated to ${config.displayName}`,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    executionId = data?.id || null;
  } catch {
    // Non-fatal
  }

  const systemPrompt = `${config.systemPrompt}

## Context from Orchestrator
${context}

## Available Actions
You can use these actions via execute_action: ${config.allowedActions.join(', ')}`;

  let claudeMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  try {
    while (iterations < config.maxIterations) {
      iterations++;

      const response = await deps.anthropic.messages.create({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: claudeMessages,
      });

      // Track tokens
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Log cost
      await logAICostEvent(
        deps.supabase,
        deps.userId,
        deps.orgId,
        'anthropic',
        config.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        `agent_${config.name}`
      );

      if (response.stop_reason === 'end_turn') {
        const textContent = response.content.find((c) => c.type === 'text');
        responseText = textContent?.type === 'text' ? textContent.text : '';
        break;
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (c) => c.type === 'tool_use'
        ) as Anthropic.ToolUseBlock[];

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          toolsUsed.push(toolUse.name);

          // Stream tool events if writer available
          if (streamWriter) {
            await streamWriter.sendSSE('tool_start', {
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
              agent: config.name,
            });
          }

          try {
            const result = await executeSpecialistToolCall(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              config,
              deps
            );

            if (streamWriter) {
              await streamWriter.sendSSE('tool_result', {
                id: toolUse.id,
                name: toolUse.name,
                result,
                success: true,
                agent: config.name,
              });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);

            if (streamWriter) {
              await streamWriter.sendSSE('tool_result', {
                id: toolUse.id,
                name: toolUse.name,
                error: errorMsg,
                success: false,
                agent: config.name,
              });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errorMsg }),
              is_error: true,
            });
          }
        }

        claudeMessages.push({ role: 'assistant', content: response.content });
        claudeMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }
  } catch (err) {
    responseText = `Error in ${config.displayName}: ${err instanceof Error ? err.message : String(err)}`;
  }

  const durationMs = Date.now() - startTime;

  // Log execution complete
  if (executionId) {
    try {
      await deps.supabase
        .from('copilot_executions')
        .update({
          success: true,
          response_text: responseText?.slice(0, 5000),
          tools_used: [...new Set(toolsUsed)],
          tool_call_count: toolsUsed.length,
          iterations,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          total_tokens: totalInputTokens + totalOutputTokens,
        })
        .eq('id', executionId);
    } catch {
      // Non-fatal
    }
  }

  return {
    agentName: config.name,
    responseText,
    toolsUsed: [...new Set(toolsUsed)],
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    iterations,
    durationMs,
  };
}
