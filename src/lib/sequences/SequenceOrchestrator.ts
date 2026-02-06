/**
 * Sequence Orchestrator
 *
 * Orchestrates multi-skill sequences following Context Engineering principles.
 * Implements hierarchical tool routing (Level 1 → Level 2) for clean abstraction.
 *
 * Key responsibilities:
 * - Execute skill pipelines in defined order
 * - Manage state throughout sequence execution
 * - Handle HITL (Human-in-the-Loop) approval requests
 * - Route Level 1 tools to Level 2 skill implementations
 * - Track token budgets and trigger compaction
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SequenceState,
  SequenceType,
  SequenceTrigger,
  SkillResult,
  OrchestratorTool,
  ResearchParams,
  EnrichParams,
  DraftParams,
  CRMActionParams,
  NotifyParams,
  ExecuteParams,
  SKILL_ROUTING,
} from './contextEngineering';
import {
  createInitialSequenceState,
  CONTEXT_ENGINEERING_RULES,
} from './contextEngineering';
import { SequenceStateManager, createSequenceStateManager } from './SequenceStateManager';
import type { AgentSequence, SequenceStep, HITLConfig } from '../hooks/useAgentSequences';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Supabase client */
  supabase: SupabaseClient;

  /** Organization ID */
  organizationId: string;

  /** User ID */
  userId: string;

  /** Enable HITL pauses */
  enableHITL?: boolean;

  /** Slack channel for notifications */
  slackChannelId?: string;

  /** Max retries for failed skills */
  maxRetries?: number;

  /** Store full outputs externally */
  storeFullOutputs?: boolean;

  /** Dry run mode (don't execute side effects) */
  dryRun?: boolean;
}

/**
 * Sequence execution result
 */
export interface SequenceExecutionResult {
  success: boolean;
  instance_id: string;
  sequence_id: string;
  final_state: SequenceState;
  error?: string;
  duration_ms: number;
}

/**
 * Level 1 tool execution result
 */
interface ToolResult {
  success: boolean;
  output: unknown;
  skill_results: SkillResult[];
  error?: string;
}

// =============================================================================
// SKILL ROUTING (Level 2 implementation)
// =============================================================================

/**
 * Level 2 skill routing map
 * Maps Level 1 orchestrator tools to specific skill implementations
 */
const LEVEL2_ROUTING: Record<OrchestratorTool, string[]> = {
  research: [
    'apollo_company_search',
    'apollo_contact_search',
    'apify_linkedin_profile',
    'apify_linkedin_posts',
    'gemini_news_search',
    'lead-research',
    'company-analysis',
  ],
  enrich: [
    'apollo_enrichment',
    'gemini_enrichment',
    'reoon_email_validation',
    'lead-enrichment',
  ],
  draft: [
    'copywriter_email',
    'copywriter_linkedin',
    'copywriter_slack',
    'copywriter_call_script',
    'follow-up-email',
    'meeting-followup',
  ],
  crm_action: [
    'hubspot_read',
    'hubspot_write',
    'bullhorn_read',
    'bullhorn_write',
    'crm-updater',
  ],
  notify: [
    'slack_blocks_sender',
    'email_notification',
    'slack-presenter',
  ],
  execute: [
    'email_sender',
    'linkedin_sender',
    'instantly_campaign',
    'crm_task_creator',
    'calendar_booker',
  ],
};

// =============================================================================
// SEQUENCE ORCHESTRATOR CLASS
// =============================================================================

/**
 * SequenceOrchestrator - Orchestrates multi-skill sequences
 *
 * Usage:
 * ```typescript
 * const orchestrator = new SequenceOrchestrator({
 *   supabase,
 *   organizationId: 'org-123',
 *   userId: 'user-456',
 *   enableHITL: true,
 *   slackChannelId: 'C123456',
 * });
 *
 * // Execute a predefined sequence
 * const result = await orchestrator.executeSequence(sequence, trigger);
 *
 * // Or use Level 1 tools directly
 * const researchResult = await orchestrator.research({
 *   target: 'Acme Corp',
 *   depth: 'standard',
 * });
 * ```
 */
export class SequenceOrchestrator {
  private config: OrchestratorConfig;
  private stateManager: SequenceStateManager;

  constructor(config: OrchestratorConfig) {
    this.config = {
      enableHITL: true,
      maxRetries: 1,
      storeFullOutputs: true,
      dryRun: false,
      ...config,
    };

    this.stateManager = createSequenceStateManager(
      config.supabase,
      config.organizationId,
      config.userId
    );
  }

  // =============================================================================
  // SEQUENCE EXECUTION
  // =============================================================================

  /**
   * Execute a full sequence with support for parallel step groups
   */
  async executeSequence(
    sequence: AgentSequence,
    trigger: SequenceTrigger
  ): Promise<SequenceExecutionResult> {
    const startTime = Date.now();
    const steps = sequence.frontmatter.sequence_steps || [];

    console.log(`[SequenceOrchestrator] Starting sequence: ${sequence.skill_key}`, {
      steps: steps.length,
      trigger: trigger.type,
    });

    try {
      // Initialize state
      const state = await this.stateManager.initialize(
        sequence.skill_key,
        (sequence.frontmatter.triggers?.[0] as SequenceType) || 'custom',
        trigger,
        steps.length
      );

      // Group steps into batches (parallel groups execute together)
      const stepBatches = this.groupStepsIntoBatches(steps);

      console.log(`[SequenceOrchestrator] Grouped ${steps.length} steps into ${stepBatches.length} batches`);

      // Execute batches
      for (let batchIndex = 0; batchIndex < stepBatches.length; batchIndex++) {
        const batch = stepBatches[batchIndex];
        const isParallel = batch.length > 1 || batch[0]?.execution_mode === 'parallel';

        console.log(`[SequenceOrchestrator] Batch ${batchIndex + 1}/${stepBatches.length}: ${batch.length} step(s), mode: ${isParallel ? 'parallel' : 'sequential'}`);

        if (isParallel) {
          // Execute all steps in this batch in parallel
          await this.executeParallelBatch(batch, state, batchIndex);
        } else {
          // Execute single step sequentially
          const step = batch[0];
          const stepIndex = steps.indexOf(step);

          // Check for HITL before step
          if (step.hitl_before?.enabled && this.config.enableHITL) {
            const approved = await this.requestHITLApproval(step.hitl_before, state, stepIndex, 'before');
            if (!approved) {
              console.log(`[SequenceOrchestrator] HITL rejected at step ${stepIndex + 1}`);
              break;
            }
          }

          // Check condition
          if (step.condition && !this.evaluateCondition(step.condition, state)) {
            console.log(`[SequenceOrchestrator] Step ${step.skill_key} skipped due to condition`);
            continue;
          }

          // Execute the step
          const stepResult = await this.executeStep(step, state);

          // Handle step failure
          if (stepResult.status === 'failed') {
            console.error(`[SequenceOrchestrator] Step ${stepIndex + 1} failed:`, stepResult.error);

            if (step.on_failure === 'stop') {
              throw new Error(`Step ${step.skill_key} failed: ${stepResult.error}`);
            } else if (step.on_failure === 'fallback' && step.fallback_skill_key) {
              const fallbackResult = await this.executeSkillStep(
                step.fallback_skill_key,
                this.buildStepContext(step, state),
                step.output_key
              );
              await this.stateManager.mergeSkillResult(step.fallback_skill_key, fallbackResult);
            }
          } else {
            await this.stateManager.mergeSkillResult(step.skill_key, stepResult);
          }

          // Check for HITL after step
          if (step.hitl_after?.enabled && this.config.enableHITL) {
            const approved = await this.requestHITLApproval(step.hitl_after, state, stepIndex, 'after');
            if (!approved) {
              console.log(`[SequenceOrchestrator] HITL rejected after step ${stepIndex + 1}`);
              break;
            }
          }
        }
      }

      // Get final state
      const finalState = this.stateManager.getState();

      return {
        success: true,
        instance_id: finalState.instance_id,
        sequence_id: sequence.skill_key,
        final_state: finalState,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SequenceOrchestrator] Sequence failed:`, errorMessage);

      return {
        success: false,
        instance_id: this.stateManager.getState()?.instance_id || 'unknown',
        sequence_id: sequence.skill_key,
        final_state: this.stateManager.getState(),
        error: errorMessage,
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Group steps into batches based on execution mode and parallel_group
   * Sequential steps become single-item batches
   * Parallel steps with the same group (or consecutive parallel steps) become multi-item batches
   */
  private groupStepsIntoBatches(steps: SequenceStep[]): SequenceStep[][] {
    const batches: SequenceStep[][] = [];
    let currentBatch: SequenceStep[] = [];
    let currentGroup: string | undefined = undefined;

    for (const step of steps) {
      const isParallel = step.execution_mode === 'parallel';
      const group = step.parallel_group;

      if (isParallel) {
        // If this parallel step has a group
        if (group) {
          // Same group as current batch - add to batch
          if (currentGroup === group) {
            currentBatch.push(step);
          } else {
            // Different group - flush current batch and start new one
            if (currentBatch.length > 0) {
              batches.push(currentBatch);
            }
            currentBatch = [step];
            currentGroup = group;
          }
        } else {
          // No group specified - consecutive parallel steps run together
          if (currentBatch.length > 0 && currentBatch[0].execution_mode === 'parallel' && !currentGroup) {
            currentBatch.push(step);
          } else {
            if (currentBatch.length > 0) {
              batches.push(currentBatch);
            }
            currentBatch = [step];
            currentGroup = undefined;
          }
        }
      } else {
        // Sequential step - flush current batch and add as single-item batch
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        batches.push([step]);
        currentBatch = [];
        currentGroup = undefined;
      }
    }

    // Don't forget the last batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Execute a batch of steps in parallel
   */
  private async executeParallelBatch(
    batch: SequenceStep[],
    state: SequenceState,
    batchIndex: number
  ): Promise<void> {
    console.log(`[SequenceOrchestrator] Executing parallel batch with ${batch.length} steps:`,
      batch.map(s => s.skill_key).join(', ')
    );

    // Execute all steps concurrently
    const results = await Promise.allSettled(
      batch.map(async (step) => {
        // Check condition
        if (step.condition && !this.evaluateCondition(step.condition, state)) {
          console.log(`[SequenceOrchestrator] Parallel step ${step.skill_key} skipped due to condition`);
          return { step, result: null, skipped: true };
        }

        const result = await this.executeStep(step, state);
        return { step, result, skipped: false };
      })
    );

    // Process results
    for (const settledResult of results) {
      if (settledResult.status === 'fulfilled') {
        const { step, result, skipped } = settledResult.value;

        if (skipped || !result) {
          continue;
        }

        if (result.status === 'failed') {
          console.error(`[SequenceOrchestrator] Parallel step ${step.skill_key} failed:`, result.error);

          if (step.on_failure === 'stop') {
            throw new Error(`Parallel step ${step.skill_key} failed: ${result.error}`);
          } else if (step.on_failure === 'fallback' && step.fallback_skill_key) {
            const fallbackResult = await this.executeSkillStep(
              step.fallback_skill_key,
              this.buildStepContext(step, state),
              step.output_key
            );
            await this.stateManager.mergeSkillResult(step.fallback_skill_key, fallbackResult);
          }
        } else {
          await this.stateManager.mergeSkillResult(step.skill_key, result);
        }
      } else {
        // Promise rejected
        console.error(`[SequenceOrchestrator] Parallel step execution threw:`, settledResult.reason);
      }
    }
  }

  /**
   * Evaluate a condition expression against current state
   * Supports simple expressions like "${previous_step.success}", "${context.has_email}"
   */
  private evaluateCondition(condition: string, state: SequenceState): boolean {
    try {
      // Handle ${variable} expressions
      const value = this.resolveExpression(condition, state);

      // Convert to boolean
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
      if (typeof value === 'number') return value !== 0;
      return !!value;
    } catch (error) {
      console.warn(`[SequenceOrchestrator] Failed to evaluate condition "${condition}":`, error);
      return true; // Default to running the step if condition evaluation fails
    }
  }

  /**
   * Execute a single step in the sequence
   */
  private async executeStep(step: SequenceStep, state: SequenceState): Promise<SkillResult> {
    const context = this.buildStepContext(step, state);

    // Determine if this is a Level 1 tool or direct skill
    const level1Tool = this.mapSkillToLevel1Tool(step.skill_key);

    if (level1Tool) {
      // Route through Level 1 tool
      const toolResult = await this.executeLevel1Tool(level1Tool, step.skill_key, context);

      // Aggregate results if multiple skills were called
      if (toolResult.skill_results.length === 1) {
        return toolResult.skill_results[0];
      }

      // Merge multiple results into one
      return this.mergeSkillResults(step.skill_key, toolResult.skill_results);
    }

    // Direct skill execution
    return this.executeSkillStep(step.skill_key, context, step.output_key);
  }

  /**
   * Execute a skill directly
   */
  private async executeSkillStep(
    skillKey: string,
    context: Record<string, unknown>,
    outputKey?: string
  ): Promise<SkillResult> {
    // In production, this would call the edge function
    // For now, simulate with a placeholder that would call runSkillWithContract
    const startTime = Date.now();

    try {
      // Call edge function to execute skill
      const { data, error } = await this.config.supabase.functions.invoke('api-skill-execute', {
        body: {
          skill_key: skillKey,
          context,
          organization_id: this.config.organizationId,
          user_id: this.config.userId,
          store_full_output: this.config.storeFullOutputs,
          dry_run: this.config.dryRun,
        },
      });

      if (error) {
        return {
          status: 'failed',
          error: error.message,
          summary: `Skill ${skillKey} failed: ${error.message}`,
          data: {},
          references: [],
          meta: {
            skill_id: skillKey,
            skill_version: '1.0.0',
            execution_time_ms: Date.now() - startTime,
          },
        };
      }

      // Return the result (already in contract format from edge function)
      return data as SkillResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: 'failed',
        error: errorMessage,
        summary: `Skill ${skillKey} failed: ${errorMessage}`,
        data: {},
        references: [],
        meta: {
          skill_id: skillKey,
          skill_version: '1.0.0',
          execution_time_ms: Date.now() - startTime,
        },
      };
    }
  }

  // =============================================================================
  // LEVEL 1 TOOLS (Hierarchical Action Space)
  // =============================================================================

  /**
   * Level 1 Tool: Research
   * Internally routes to appropriate research skills based on target and depth
   */
  async research(params: ResearchParams): Promise<ToolResult> {
    const skillKeys: string[] = [];

    // Determine which skills to call based on depth
    if (params.depth === 'quick') {
      skillKeys.push('apollo_company_search');
    } else if (params.depth === 'standard') {
      skillKeys.push('apollo_company_search', 'lead-research');
    } else if (params.depth === 'deep') {
      skillKeys.push(
        'apollo_company_search',
        'apify_linkedin_profile',
        'gemini_news_search',
        'company-analysis'
      );
    }

    const context = {
      target: params.target,
      depth: params.depth,
      focus_areas: params.focus_areas,
    };

    return this.executeMultipleSkills(skillKeys, context);
  }

  /**
   * Level 1 Tool: Enrich
   */
  async enrich(params: EnrichParams): Promise<ToolResult> {
    const skillKeys =
      params.entity_type === 'contact'
        ? ['apollo_enrichment', 'apify_linkedin_profile']
        : ['apollo_company_search', 'lead-enrichment'];

    const context = {
      entity_type: params.entity_type,
      identifier: params.identifier,
      sources: params.sources,
    };

    return this.executeMultipleSkills(skillKeys, context);
  }

  /**
   * Level 1 Tool: Draft
   */
  async draft(params: DraftParams): Promise<ToolResult> {
    const skillKeyMap: Record<string, string> = {
      email: 'follow-up-email',
      linkedin: 'copywriter_linkedin',
      slack: 'copywriter_slack',
      call_script: 'copywriter_call_script',
    };

    const skillKey = skillKeyMap[params.type] || 'follow-up-email';
    const context = {
      draft_type: params.type,
      ...params.context,
    };

    const result = await this.executeSkillStep(skillKey, context);
    return {
      success: result.status === 'success',
      output: result.data,
      skill_results: [result],
      error: result.error,
    };
  }

  /**
   * Level 1 Tool: CRM Action
   */
  async crmAction(params: CRMActionParams): Promise<ToolResult> {
    const skillKey = params.action === 'read' ? 'hubspot_read' : 'crm-updater';
    const context = {
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      data: params.data,
    };

    const result = await this.executeSkillStep(skillKey, context);
    return {
      success: result.status === 'success',
      output: result.data,
      skill_results: [result],
      error: result.error,
    };
  }

  /**
   * Level 1 Tool: Notify
   */
  async notify(params: NotifyParams): Promise<ToolResult> {
    const skillKey = params.channel === 'slack' ? 'slack-presenter' : 'email_notification';
    const context = {
      channel: params.channel,
      recipient: params.recipient,
      message: params.message,
      blocks: params.blocks,
      priority: params.priority,
    };

    const result = await this.executeSkillStep(skillKey, context);
    return {
      success: result.status === 'success',
      output: result.data,
      skill_results: [result],
      error: result.error,
    };
  }

  /**
   * Level 1 Tool: Execute (approved actions)
   */
  async execute(params: ExecuteParams): Promise<ToolResult> {
    if (this.config.dryRun) {
      return {
        success: true,
        output: { dry_run: true, would_execute: params.action_type },
        skill_results: [],
      };
    }

    const skillKeyMap: Record<string, string> = {
      send_email: 'email_sender',
      send_linkedin: 'linkedin_sender',
      create_task: 'crm_task_creator',
      book_meeting: 'calendar_booker',
      start_campaign: 'instantly_campaign',
    };

    const skillKey = skillKeyMap[params.action_type];
    if (!skillKey) {
      return {
        success: false,
        output: {},
        skill_results: [],
        error: `Unknown action type: ${params.action_type}`,
      };
    }

    const context = {
      action_type: params.action_type,
      approval_id: params.approval_id,
      ...params.params,
    };

    const result = await this.executeSkillStep(skillKey, context);
    return {
      success: result.status === 'success',
      output: result.data,
      skill_results: [result],
      error: result.error,
    };
  }

  // =============================================================================
  // LEVEL 1 ROUTING
  // =============================================================================

  /**
   * Execute Level 1 tool with internal routing
   */
  private async executeLevel1Tool(
    tool: OrchestratorTool,
    skillKey: string,
    context: Record<string, unknown>
  ): Promise<ToolResult> {
    switch (tool) {
      case 'research':
        return this.research({
          target: (context.target as string) || (context.company_name as string) || '',
          depth: (context.depth as 'quick' | 'standard' | 'deep') || 'standard',
          focus_areas: context.focus_areas as string[] | undefined,
        });

      case 'enrich':
        return this.enrich({
          entity_type: (context.entity_type as 'contact' | 'company') || 'company',
          identifier: (context.identifier as string) || (context.email as string) || '',
        });

      case 'draft':
        return this.draft({
          type: this.inferDraftType(skillKey),
          context: {
            purpose: (context.purpose as string) || 'follow_up',
            recipient: context.recipient as never,
            company: context.company as never,
            deal: context.deal as never,
            previous_conversation_summary: context.previous_conversation_summary as string,
          },
        });

      case 'crm_action':
        return this.crmAction({
          action: (context.action as 'read' | 'update' | 'create') || 'update',
          entity_type:
            (context.entity_type as 'contact' | 'company' | 'deal' | 'activity') || 'deal',
          entity_id: context.entity_id as string,
          data: context.data as Record<string, unknown>,
        });

      case 'notify':
        return this.notify({
          channel: (context.channel as 'slack' | 'email') || 'slack',
          recipient: (context.recipient as string) || this.config.slackChannelId || '',
          message: (context.message as string) || '',
          blocks: context.blocks as unknown[],
        });

      case 'execute':
        return this.execute({
          action_type: context.action_type as never,
          params: context.params as Record<string, unknown>,
          approval_id: context.approval_id as string,
        });

      default:
        // Direct skill execution
        const result = await this.executeSkillStep(skillKey, context);
        return {
          success: result.status === 'success',
          output: result.data,
          skill_results: [result],
          error: result.error,
        };
    }
  }

  /**
   * Map a skill key to its Level 1 tool category
   */
  private mapSkillToLevel1Tool(skillKey: string): OrchestratorTool | null {
    for (const [tool, skills] of Object.entries(LEVEL2_ROUTING)) {
      if (skills.some((s) => skillKey.includes(s) || s.includes(skillKey))) {
        return tool as OrchestratorTool;
      }
    }
    return null;
  }

  /**
   * Infer draft type from skill key
   */
  private inferDraftType(skillKey: string): 'email' | 'linkedin' | 'slack' | 'call_script' {
    if (skillKey.includes('linkedin')) return 'linkedin';
    if (skillKey.includes('slack')) return 'slack';
    if (skillKey.includes('call') || skillKey.includes('script')) return 'call_script';
    return 'email';
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  /**
   * Execute multiple skills in parallel
   */
  private async executeMultipleSkills(
    skillKeys: string[],
    context: Record<string, unknown>
  ): Promise<ToolResult> {
    const results = await Promise.all(
      skillKeys.map((key) => this.executeSkillStep(key, context))
    );

    const allSuccessful = results.every((r) => r.status === 'success');
    const errors = results.filter((r) => r.error).map((r) => r.error);

    // Merge data from all results
    const mergedData: Record<string, unknown> = {};
    for (const result of results) {
      Object.assign(mergedData, result.data);
    }

    return {
      success: allSuccessful || results.some((r) => r.status === 'success'),
      output: mergedData,
      skill_results: results,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Merge multiple skill results into one
   */
  private mergeSkillResults(skillKey: string, results: SkillResult[]): SkillResult {
    const summaries = results.map((r) => r.summary).join(' ');
    const allData: Record<string, unknown> = {};
    const allReferences = results.flatMap((r) => r.references);
    const totalTime = results.reduce((sum, r) => sum + r.meta.execution_time_ms, 0);
    const totalTokens = results.reduce((sum, r) => sum + (r.meta.tokens_used || 0), 0);

    for (const result of results) {
      Object.assign(allData, result.data);
    }

    return {
      status: results.every((r) => r.status === 'success')
        ? 'success'
        : results.some((r) => r.status === 'success')
          ? 'partial'
          : 'failed',
      summary: summaries.substring(0, 200),
      data: allData,
      references: allReferences.slice(0, 10),
      hints: results.find((r) => r.hints)?.hints,
      meta: {
        skill_id: skillKey,
        skill_version: '1.0.0',
        execution_time_ms: totalTime,
        tokens_used: totalTokens > 0 ? totalTokens : undefined,
      },
    };
  }

  /**
   * Build context for a step using input mapping
   */
  private buildStepContext(step: SequenceStep, state: SequenceState): Record<string, unknown> {
    const context: Record<string, unknown> = {};

    // Start with sequence state context
    context.contacts = state.context.entities.contacts;
    context.companies = state.context.entities.companies;
    context.deals = state.context.entities.deals;
    context.key_facts = state.context.findings.key_facts;

    // Apply input mapping
    if (step.input_mapping) {
      for (const [targetKey, sourceExpr] of Object.entries(step.input_mapping)) {
        const value = this.resolveExpression(sourceExpr, state);
        if (value !== undefined) {
          context[targetKey] = value;
        }
      }
    }

    return context;
  }

  /**
   * Resolve a ${variable} expression from state
   */
  private resolveExpression(expr: string, state: SequenceState): unknown {
    // Handle ${varName} pattern
    const match = expr.match(/^\$\{(.+)\}$/);
    if (!match) return expr;

    const path = match[1].split('.');
    let value: unknown = state;

    for (const key of path) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // =============================================================================
  // HITL (Human-in-the-Loop)
  // =============================================================================

  /**
   * Request HITL approval
   */
  private async requestHITLApproval(
    config: HITLConfig,
    state: SequenceState,
    stepIndex: number,
    timing: 'before' | 'after'
  ): Promise<boolean> {
    // Interpolate prompt
    const prompt = this.interpolatePrompt(config.prompt, state);

    // Create HITL request record
    const { data: request, error } = await this.config.supabase
      .from('sequence_hitl_requests')
      .insert({
        execution_id: state.instance_id,
        sequence_key: state.sequence_id,
        step_index: stepIndex,
        timing,
        organization_id: this.config.organizationId,
        requested_by_user_id: this.config.userId,
        assigned_to_user_id: config.assigned_to_user_id || this.config.userId,
        request_type: config.request_type,
        prompt,
        options: config.options || [],
        default_value: config.default_value,
        channels: config.channels,
        slack_channel_id: config.slack_channel_id || this.config.slackChannelId,
        timeout_minutes: config.timeout_minutes,
        timeout_action: config.timeout_action,
        expires_at: new Date(Date.now() + config.timeout_minutes * 60 * 1000).toISOString(),
        execution_context: this.stateManager.getSkillContext(),
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[SequenceOrchestrator] Failed to create HITL request:', error);
      return config.timeout_action === 'continue';
    }

    // Send notification via Slack if enabled
    if (config.channels.includes('slack') && this.config.slackChannelId) {
      await this.sendSlackApprovalRequest(request, prompt, config);
    }

    // Update state manager
    this.stateManager.requireApproval(config.channels[0] as 'slack' | 'email' | 'app');

    // For now, return based on timeout_action (actual approval would be async)
    // In production, this would wait for webhook callback or poll
    console.log(`[SequenceOrchestrator] HITL request created: ${request.id}`);

    // Return true to continue (actual approval handling would be async)
    return true;
  }

  /**
   * Interpolate variables in HITL prompt
   */
  private interpolatePrompt(prompt: string, state: SequenceState): string {
    return prompt.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const value = this.resolveExpression(`\${${path}}`, state);
      return value !== undefined ? String(value) : `\${${path}}`;
    });
  }

  /**
   * Send Slack approval request
   */
  private async sendSlackApprovalRequest(
    request: Record<string, unknown>,
    prompt: string,
    config: HITLConfig
  ): Promise<void> {
    // This would send to Slack via the slack-presenter skill
    const blocks = this.buildApprovalBlocks(request, prompt, config);

    await this.notify({
      channel: 'slack',
      recipient: config.slack_channel_id || this.config.slackChannelId || '',
      message: prompt,
      blocks,
      priority: 'high',
    });
  }

  /**
   * Build Slack blocks for approval request
   */
  private buildApprovalBlocks(
    request: Record<string, unknown>,
    prompt: string,
    config: HITLConfig
  ): unknown[] {
    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔔 Approval Required' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: prompt },
      },
      {
        type: 'divider',
      },
    ];

    // Add options if choice type
    if (config.request_type === 'choice' && config.options) {
      blocks.push({
        type: 'actions',
        elements: config.options.map((opt) => ({
          type: 'button',
          text: { type: 'plain_text', text: opt.label },
          value: opt.value,
          action_id: `hitl_${request.id}_${opt.value}`,
        })),
      });
    } else {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✓ Approve' },
            style: 'primary',
            action_id: `hitl_${request.id}_approve`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✗ Reject' },
            style: 'danger',
            action_id: `hitl_${request.id}_reject`,
          },
        ],
      });
    }

    return blocks;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new SequenceOrchestrator
 */
export function createSequenceOrchestrator(config: OrchestratorConfig): SequenceOrchestrator {
  return new SequenceOrchestrator(config);
}
