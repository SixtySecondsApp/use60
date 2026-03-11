/**
 * Task Orchestrator — One-Shot Plain-Language Task Execution
 *
 * Maps common daily asks ("prep my day", "send follow-up pack", "fix contact link")
 * to deterministic skill step sequences. Each step has explicit states:
 * planned → running → succeeded | failed
 *
 * Unlike the event-driven runner.ts, this handles user-initiated compound tasks
 * that compose multiple existing skills in a single invocation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type TaskStepStatus = 'planned' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface TaskStep {
  id: string;
  skill: string;
  label: string;
  params: Record<string, unknown>;
  criticality: 'critical' | 'best-effort';
  status: TaskStepStatus;
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface TaskPlan {
  taskKey: string;
  label: string;
  steps: TaskStep[];
  status: 'planned' | 'running' | 'completed' | 'partial' | 'failed';
  startedAt?: string;
  completedAt?: string;
  summary?: string;
}

export interface TaskOrchestratorResult {
  plan: TaskPlan;
  summary: string;
  hasFailures: boolean;
  completedCount: number;
  totalCount: number;
}

// Step executor callback — provided by the caller (e.g., api-copilot)
export type StepExecutor = (
  skill: string,
  params: Record<string, unknown>,
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

// =============================================================================
// Task Registry — maps common asks to step sequences
// =============================================================================

interface TaskTemplate {
  key: string;
  label: string;
  steps: Array<{
    id: string;
    skill: string;
    label: string;
    paramBuilder: (ctx: TaskContext) => Record<string, unknown>;
    criticality: 'critical' | 'best-effort';
  }>;
}

export interface TaskContext {
  orgId: string;
  userId: string;
  contactId?: string;
  dealId?: string;
  meetingId?: string;
  date?: string;
  extra?: Record<string, unknown>;
}

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    key: 'prep_my_day',
    label: 'Prep My Day',
    steps: [
      {
        id: 'meetings',
        skill: 'get_meetings_for_period',
        label: 'Fetch today\'s meetings',
        paramBuilder: (ctx) => ({ period: 'today', date: ctx.date }),
        criticality: 'critical',
      },
      {
        id: 'pipeline',
        skill: 'get_pipeline_summary',
        label: 'Pull pipeline summary',
        paramBuilder: () => ({}),
        criticality: 'best-effort',
      },
      {
        id: 'attention',
        skill: 'get_contacts_needing_attention',
        label: 'Check contacts needing attention',
        paramBuilder: () => ({}),
        criticality: 'best-effort',
      },
      {
        id: 'tasks',
        skill: 'list_tasks',
        label: 'List open tasks',
        paramBuilder: () => ({ status: 'pending', limit: 10 }),
        criticality: 'best-effort',
      },
    ],
  },
  {
    key: 'send_followup_pack',
    label: 'Send Follow-Up Pack',
    steps: [
      {
        id: 'contact',
        skill: 'get_contact',
        label: 'Load contact details',
        paramBuilder: (ctx) => ({ id: ctx.contactId }),
        criticality: 'critical',
      },
      {
        id: 'meeting_context',
        skill: 'search_meeting_context',
        label: 'Pull recent meeting context',
        paramBuilder: (ctx) => ({
          contact_id: ctx.contactId,
          limit: 1,
        }),
        criticality: 'critical',
      },
      {
        id: 'draft',
        skill: 'draft_email',
        label: 'Draft follow-up email',
        paramBuilder: (ctx) => ({
          contact_id: ctx.contactId,
          type: 'followup',
          ...ctx.extra,
        }),
        criticality: 'critical',
      },
    ],
  },
  {
    key: 'fix_contact_company_link',
    label: 'Fix Contact-Company Link',
    steps: [
      {
        id: 'resolve_contact',
        skill: 'get_contact',
        label: 'Resolve contact',
        paramBuilder: (ctx) => ({
          id: ctx.contactId,
          name: ctx.extra?.contact_name,
          email: ctx.extra?.contact_email,
        }),
        criticality: 'critical',
      },
      {
        id: 'resolve_company',
        skill: 'get_company_status',
        label: 'Resolve company',
        paramBuilder: (ctx) => ({
          name: ctx.extra?.company_name,
          domain: ctx.extra?.company_domain,
        }),
        criticality: 'critical',
      },
      {
        id: 'update_link',
        skill: 'update_crm',
        label: 'Update contact-company association',
        paramBuilder: (ctx) => ({
          entity_type: 'contact',
          contact_id: ctx.contactId,
          fields: { company_id: ctx.extra?.company_id },
          confirm: true,
        }),
        criticality: 'critical',
      },
    ],
  },
  {
    key: 'deal_health_check',
    label: 'Deal Health Check',
    steps: [
      {
        id: 'deal',
        skill: 'get_deal',
        label: 'Load deal details',
        paramBuilder: (ctx) => ({ id: ctx.dealId }),
        criticality: 'critical',
      },
      {
        id: 'meetings',
        skill: 'search_meeting_context',
        label: 'Pull meeting history',
        paramBuilder: (ctx) => ({ deal_id: ctx.dealId, limit: 5 }),
        criticality: 'best-effort',
      },
      {
        id: 'attention',
        skill: 'get_contacts_needing_attention',
        label: 'Check stale contacts on deal',
        paramBuilder: (ctx) => ({ deal_id: ctx.dealId }),
        criticality: 'best-effort',
      },
    ],
  },
];

// =============================================================================
// Public API
// =============================================================================

/**
 * List all available task templates.
 */
export function listTaskTemplates(): Array<{ key: string; label: string; stepCount: number }> {
  return TASK_TEMPLATES.map((t) => ({
    key: t.key,
    label: t.label,
    stepCount: t.steps.length,
  }));
}

/**
 * Resolve a plain-language ask to a task key.
 * Returns null if no match found.
 */
export function resolveTaskKey(input: string): string | null {
  const lower = input.toLowerCase().trim();

  const patterns: Array<{ pattern: RegExp; key: string }> = [
    { pattern: /\b(prep|prepare|plan)\b.*\b(day|morning|today)\b/, key: 'prep_my_day' },
    { pattern: /\b(daily|morning)\b.*\b(brief|summary|prep)\b/, key: 'prep_my_day' },
    { pattern: /\bfollow[\s-]?up\b.*\b(pack|bundle|email)\b/, key: 'send_followup_pack' },
    { pattern: /\bsend\b.*\bfollow[\s-]?up\b/, key: 'send_followup_pack' },
    { pattern: /\b(fix|relink|link|connect|associate)\b.*\b(contact|company)\b/, key: 'fix_contact_company_link' },
    { pattern: /\b(contact|company)\b.*\b(link|association|mismatch)\b/, key: 'fix_contact_company_link' },
    { pattern: /\bdeal\b.*\b(health|check|status|review)\b/, key: 'deal_health_check' },
    { pattern: /\b(health|risk)\b.*\bdeal\b/, key: 'deal_health_check' },
  ];

  for (const { pattern, key } of patterns) {
    if (pattern.test(lower)) return key;
  }

  return null;
}

/**
 * Build a task plan from a template key and context.
 */
export function buildTaskPlan(taskKey: string, ctx: TaskContext): TaskPlan | null {
  const template = TASK_TEMPLATES.find((t) => t.key === taskKey);
  if (!template) return null;

  return {
    taskKey: template.key,
    label: template.label,
    steps: template.steps.map((s) => ({
      id: s.id,
      skill: s.skill,
      label: s.label,
      params: s.paramBuilder(ctx),
      criticality: s.criticality,
      status: 'planned' as const,
    })),
    status: 'planned',
  };
}

/**
 * Execute a task plan sequentially, updating step states as we go.
 * Failure in a critical step halts execution; best-effort steps are skipped on failure.
 */
export async function executeTaskPlan(
  plan: TaskPlan,
  executor: StepExecutor,
): Promise<TaskOrchestratorResult> {
  plan.status = 'running';
  plan.startedAt = new Date().toISOString();

  let halted = false;

  for (const step of plan.steps) {
    if (halted) {
      step.status = 'skipped';
      continue;
    }

    step.status = 'running';
    step.startedAt = new Date().toISOString();
    const stepStart = Date.now();

    try {
      const result = await executor(step.skill, step.params);
      step.durationMs = Date.now() - stepStart;
      step.completedAt = new Date().toISOString();

      if (result.success) {
        step.status = 'succeeded';
        step.result = result.data;
      } else {
        step.status = 'failed';
        step.error = result.error || 'Unknown error';
        if (step.criticality === 'critical') {
          halted = true;
        }
      }
    } catch (err) {
      step.durationMs = Date.now() - stepStart;
      step.completedAt = new Date().toISOString();
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      if (step.criticality === 'critical') {
        halted = true;
      }
    }
  }

  plan.completedAt = new Date().toISOString();

  const succeeded = plan.steps.filter((s) => s.status === 'succeeded').length;
  const failed = plan.steps.filter((s) => s.status === 'failed').length;
  const skipped = plan.steps.filter((s) => s.status === 'skipped').length;
  const total = plan.steps.length;

  if (failed === 0 && skipped === 0) {
    plan.status = 'completed';
  } else if (succeeded === 0) {
    plan.status = 'failed';
  } else {
    plan.status = 'partial';
  }

  const summary = buildSummary(plan, succeeded, failed, skipped, total);
  plan.summary = summary;

  return {
    plan,
    summary,
    hasFailures: failed > 0,
    completedCount: succeeded,
    totalCount: total,
  };
}

// =============================================================================
// Summary Builder
// =============================================================================

function buildSummary(
  plan: TaskPlan,
  succeeded: number,
  failed: number,
  skipped: number,
  total: number,
): string {
  const statusIcon = plan.status === 'completed' ? 'Complete' : plan.status === 'partial' ? 'Partial' : 'Failed';
  const lines: string[] = [
    `${statusIcon}: ${plan.label} — ${succeeded}/${total} steps succeeded`,
  ];

  for (const step of plan.steps) {
    const icon =
      step.status === 'succeeded' ? '[OK]' :
      step.status === 'failed' ? '[FAIL]' :
      step.status === 'skipped' ? '[SKIP]' :
      '[--]';
    const duration = step.durationMs ? ` (${step.durationMs}ms)` : '';
    const err = step.error ? ` — ${step.error}` : '';
    lines.push(`  ${icon} ${step.label}${duration}${err}`);
  }

  if (failed > 0) {
    lines.push('');
    lines.push(`${failed} step(s) failed. ${skipped > 0 ? `${skipped} step(s) skipped due to critical failure.` : ''}`);
  }

  return lines.join('\n');
}
