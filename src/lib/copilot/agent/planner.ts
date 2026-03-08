/**
 * Planning Engine
 *
 * Takes a user's goal and available skills, then produces an
 * optimal execution plan that:
 * 1. Orders skills by dependency
 * 2. Maps context between steps
 * 3. Identifies what's possible vs gaps
 */

import type { Skill } from '@/lib/mcp/skillsProvider';
import type { SkillContext } from '@/lib/mcp/skillsTools';
import type {
  AgentGoal,
  ExecutionPlan,
  PlannedStep,
  SkillGap,
  PlanningRequest,
  PlanningResponse,
} from './types';
import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Planning Prompts
// =============================================================================

/**
 * System prompt for the planning AI
 */
const PLANNER_SYSTEM_PROMPT = `You are an AI planning assistant that creates execution plans using available skills.

Your job is to:
1. Understand the goal and what skills can help
2. Order skills by logical dependency (what needs to happen first)
3. Note which skills are available vs what would be needed but isn't available
4. Identify gaps that will limit what we can do

RULES:
- Only plan with skills that are marked as available
- Create realistic sequences (research before outreach, understand before advise)
- Be honest about what can't be accomplished with current skills
- Keep plans focused - don't add unnecessary steps

You will be given the goal, available skills, and context.`;

/**
 * Build the user prompt for planning
 */
function buildPlanningPrompt(request: PlanningRequest): string {
  const { goal, availableSkills, context } = request;

  // Format skills with their capabilities
  const skillsList = availableSkills
    .map((s) => {
      const fm = s.frontmatter;
      const deps = fm.dependencies?.length ? `Needs: ${fm.dependencies.join(', ')}` : '';
      const outputs = fm.outputs?.length ? `Provides: ${fm.outputs.join(', ')}` : '';
      const triggers = fm.triggers?.length ? `Triggers: ${fm.triggers.join(', ')}` : '';

      return `- ${s.skill_key} (${fm.category}): ${fm.description}
    ${deps} ${outputs} ${triggers}`.trim();
    })
    .join('\n');

  // Format current context
  const contextKeys = Object.keys(context).filter((k) => context[k] !== undefined);
  const contextSummary =
    contextKeys.length > 0
      ? `Currently available context: ${contextKeys.join(', ')}`
      : 'No additional context available yet';

  return `GOAL: ${goal.goalStatement}

Intent: ${goal.intentCategory || 'general'}
Requirements: ${JSON.stringify(goal.requirements, null, 2)}
Confidence: ${goal.confidence}

${contextSummary}

AVAILABLE SKILLS:
${skillsList}

Create an execution plan. Respond with JSON:
{
  "steps": [
    {
      "skillKey": "skill-key",
      "purpose": "why this skill is needed",
      "inputMapping": { "skill_input_key": "context_key" },
      "outputKey": "key to store output"
    }
  ],
  "canAccomplish": "what we CAN do with these skills",
  "gaps": [
    {
      "capability": "what's missing",
      "requirement": "what would be needed",
      "suggestion": "how to get it"
    }
  ],
  "complexity": 1-10
}

IMPORTANT:
- Steps should be in execution order (dependencies first)
- Only include skills that exist in the AVAILABLE SKILLS list
- Be specific about gaps - don't just say "more skills needed"`;
}

// =============================================================================
// Skill Matching Utilities
// =============================================================================

/**
 * Find skills relevant to a goal using keyword matching
 */
function findRelevantSkills(goal: AgentGoal, skills: Skill[]): Skill[] {
  const goalText = `${goal.goalStatement} ${goal.intentCategory || ''} ${JSON.stringify(goal.requirements)}`.toLowerCase();

  return skills.filter((skill) => {
    const fm = skill.frontmatter;
    const skillText =
      `${skill.skill_key} ${fm.name} ${fm.description} ${fm.triggers?.join(' ') || ''} ${fm.category}`.toLowerCase();

    // Check for keyword overlap
    const goalWords = goalText.split(/\W+/).filter((w) => w.length > 2);
    const skillWords = skillText.split(/\W+/).filter((w) => w.length > 2);

    const matches = goalWords.filter((gw) =>
      skillWords.some((sw) => sw.includes(gw) || gw.includes(sw))
    );

    return matches.length > 0;
  });
}

/**
 * Order skills by dependencies
 */
function orderByDependencies(steps: PlannedStep[]): PlannedStep[] {
  const ordered: PlannedStep[] = [];
  const remaining = [...steps];
  const processed = new Set<string>();

  // Simple topological sort
  let iterations = 0;
  const maxIterations = steps.length * 2;

  while (remaining.length > 0 && iterations < maxIterations) {
    iterations++;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const step = remaining[i];
      const deps = step.skill.frontmatter?.dependencies || [];
      const depsResolved = deps.every(
        (d) => processed.has(d) || !steps.some((s) => s.skillKey === d)
      );

      if (depsResolved) {
        step.order = ordered.length;
        ordered.push(step);
        processed.add(step.skillKey);
        remaining.splice(i, 1);
      }
    }
  }

  // Add any remaining (circular deps) at the end
  remaining.forEach((step, idx) => {
    step.order = ordered.length + idx;
    ordered.push(step);
  });

  return ordered;
}

// =============================================================================
// Planning Engine Class
// =============================================================================

/**
 * PlanningEngine - Creates execution plans from goals and skills
 *
 * Usage:
 * ```typescript
 * const engine = new PlanningEngine();
 *
 * const plan = await engine.createPlan({
 *   goal: { goalStatement: "Outreach to 50 SaaS leads", ... },
 *   availableSkills: skills,
 *   context: { industry: "SaaS" }
 * });
 *
 * // plan.steps - ordered execution steps
 * // plan.gaps - what we can't do
 * // plan.canAccomplish - what we can deliver
 * ```
 */
export class PlanningEngine {
  /**
   * Create an execution plan for a goal
   */
  async createPlan(request: PlanningRequest): Promise<ExecutionPlan> {
    const { goal, availableSkills, context } = request;

    // If no skills, return empty plan with gaps
    if (availableSkills.length === 0) {
      return this.createEmptyPlan(goal, 'No skills available for this organization');
    }

    try {
      // Use AI to create the plan
      const aiPlan = await this.callPlanningAI(request);

      // Convert AI response to ExecutionPlan
      return this.buildExecutionPlan(goal, aiPlan, availableSkills, context);
    } catch (error) {
      console.error('[PlanningEngine.createPlan] AI planning failed:', error);

      // Fallback: use rule-based planning
      return this.createFallbackPlan(goal, availableSkills, context);
    }
  }

  /**
   * Validate a plan before execution
   */
  validatePlan(plan: ExecutionPlan): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for empty plan
    if (plan.steps.length === 0 && plan.gaps.length === 0) {
      issues.push('Plan has no steps and no identified gaps');
    }

    // Check for missing skills
    for (const step of plan.steps) {
      if (!step.skill) {
        issues.push(`Step ${step.order} references missing skill: ${step.skillKey}`);
      }
    }

    // Check for circular dependencies
    const visited = new Set<number>();
    for (const step of plan.steps) {
      if (step.dependencies.some((d) => d >= step.order)) {
        issues.push(
          `Step ${step.order} has forward dependency (possible circular dependency)`
        );
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Estimate plan complexity and time
   */
  estimatePlan(plan: ExecutionPlan): {
    estimatedTimeMs: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const stepCount = plan.steps.length;
    const gapCount = plan.gaps.length;

    // Base estimate: 5 seconds per step
    const estimatedTimeMs = stepCount * 5000;

    // Risk based on gaps and complexity
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (gapCount > 0 || plan.complexity > 5) {
      riskLevel = 'medium';
    }
    if (gapCount > 2 || plan.complexity > 7) {
      riskLevel = 'high';
    }

    return { estimatedTimeMs, riskLevel };
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  /**
   * Call AI for planning
   */
  private async callPlanningAI(request: PlanningRequest): Promise<PlanningResponse> {
    const prompt = buildPlanningPrompt(request);

    const { data, error } = await supabase.functions.invoke('api-services-router', {
      body: {
        action: 'copilot',
        sub_action: 'plan',
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        userPrompt: prompt,
      },
    });

    if (error) {
      throw new Error(`AI planning error: ${error.message}`);
    }

    const responseText = data?.response || data?.content || '';
    return this.parseAIPlan(responseText);
  }

  /**
   * Parse AI response into PlanningResponse
   */
  private parseAIPlan(response: string): PlanningResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          steps: Array.isArray(parsed.steps) ? parsed.steps : [],
          canAccomplish: parsed.canAccomplish || 'Unknown',
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
          complexity: typeof parsed.complexity === 'number' ? parsed.complexity : 5,
        };
      }

      return { steps: [], canAccomplish: '', gaps: [], complexity: 5 };
    } catch {
      return { steps: [], canAccomplish: '', gaps: [], complexity: 5 };
    }
  }

  /**
   * Build ExecutionPlan from AI response
   */
  private buildExecutionPlan(
    goal: AgentGoal,
    aiPlan: PlanningResponse,
    availableSkills: Skill[],
    context: SkillContext
  ): ExecutionPlan {
    // Map AI steps to PlannedSteps
    const steps: PlannedStep[] = aiPlan.steps
      .map((aiStep, index) => {
        const skill = availableSkills.find((s) => s.skill_key === aiStep.skillKey);
        if (!skill) return null;

        // Map input context
        const inputContext: Partial<SkillContext> = {};
        if (aiStep.inputMapping) {
          for (const [targetKey, sourceKey] of Object.entries(aiStep.inputMapping)) {
            if (context[sourceKey] !== undefined) {
              inputContext[targetKey] = context[sourceKey];
            }
          }
        }

        return {
          order: index,
          skillKey: aiStep.skillKey,
          skill,
          purpose: aiStep.purpose || `Execute ${skill.frontmatter?.name || aiStep.skillKey}`,
          inputContext,
          outputKeys: aiStep.outputKey ? [aiStep.outputKey] : skill.frontmatter?.outputs || [],
          dependencies: this.findDependencies(aiStep.skillKey, aiPlan.steps.slice(0, index)),
          status: 'pending' as const,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null) as PlannedStep[];

    // Order by dependencies
    const orderedSteps = orderByDependencies(steps);

    // Map gaps
    const gaps: SkillGap[] = aiPlan.gaps.map((g) => ({
      capability: g.capability,
      requirement: g.requirement,
      suggestion: g.suggestion,
    }));

    // Determine limitations based on gaps
    const limitations = gaps.map((g) => g.capability);

    return {
      goal,
      steps: orderedSteps,
      gaps,
      canAccomplish: aiPlan.canAccomplish || this.summarizeCapabilities(orderedSteps),
      limitations,
      complexity: aiPlan.complexity,
    };
  }

  /**
   * Find dependencies for a step
   */
  private findDependencies(
    skillKey: string,
    previousSteps: Array<{ skillKey: string; outputKey?: string }>
  ): number[] {
    const deps: number[] = [];

    // Find steps that produce outputs this skill needs
    previousSteps.forEach((prevStep, idx) => {
      if (prevStep.outputKey) {
        // If this skill might need the previous step's output
        deps.push(idx);
      }
    });

    return deps;
  }

  /**
   * Summarize what a plan can accomplish
   */
  private summarizeCapabilities(steps: PlannedStep[]): string {
    if (steps.length === 0) return 'No actions available';

    const actions = steps.map((s) => s.skill.frontmatter?.name || s.skillKey);
    return actions.join(' → ');
  }

  /**
   * Create an empty plan (when no skills available)
   */
  private createEmptyPlan(goal: AgentGoal, reason: string): ExecutionPlan {
    return {
      goal,
      steps: [],
      gaps: [
        {
          capability: 'Skill execution',
          requirement: reason,
          suggestion: 'Contact your administrator to enable skills for this organization',
        },
      ],
      canAccomplish: 'I can discuss your goal, but cannot take automated actions.',
      limitations: [reason],
      complexity: 0,
    };
  }

  /**
   * Create a fallback plan using rule-based matching
   */
  private createFallbackPlan(
    goal: AgentGoal,
    availableSkills: Skill[],
    context: SkillContext
  ): ExecutionPlan {
    // Find relevant skills
    const relevantSkills = findRelevantSkills(goal, availableSkills);

    if (relevantSkills.length === 0) {
      return {
        goal,
        steps: [],
        gaps: [
          {
            capability: goal.intentCategory || 'Requested action',
            requirement: `No skills match the goal: ${goal.goalStatement}`,
            suggestion: 'Try rephrasing your request or contact your administrator',
          },
        ],
        canAccomplish: 'No matching skills found for your request.',
        limitations: ['No relevant skills available'],
        complexity: 1,
      };
    }

    // Create simple sequential plan
    const steps: PlannedStep[] = relevantSkills.slice(0, 5).map((skill, index) => ({
      order: index,
      skillKey: skill.skill_key,
      skill,
      purpose: skill.frontmatter?.description || `Execute ${skill.skill_key}`,
      inputContext: context,
      outputKeys: skill.frontmatter?.outputs || [],
      dependencies: index > 0 ? [index - 1] : [],
      status: 'pending' as const,
    }));

    return {
      goal,
      steps: orderByDependencies(steps),
      gaps: [],
      canAccomplish: `Execute ${steps.length} skill(s): ${steps.map((s) => s.skill.frontmatter?.name || s.skillKey).join(', ')}`,
      limitations: [],
      complexity: steps.length,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new PlanningEngine
 */
export function createPlanningEngine(): PlanningEngine {
  return new PlanningEngine();
}
