/**
 * AI Ark Search Node Executor
 *
 * Executes ai-ark-search edge function calls within the workflow engine.
 * Supports company_search, people_search, and similarity_search actions.
 * Respects the 5 req/sec rate limit with a 250ms inter-request delay.
 */

import { supabase } from '@/lib/supabase/clientV2';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiArkAction = 'company_search' | 'people_search' | 'similarity_search';

export type SeniorityLevel =
  | 'C_SUITE'
  | 'VP'
  | 'DIRECTOR'
  | 'MANAGER'
  | 'SENIOR'
  | 'ENTRY'
  | 'INDIVIDUAL_CONTRIBUTOR';

export interface AiArkSearchNodeConfig {
  action: AiArkAction;
  // Company search filters
  industry?: string[];
  employee_min?: number;
  employee_max?: number;
  location?: string[];
  domain?: string[];
  company_name?: string;
  keywords?: string[];
  technologies?: string[];
  revenue_min?: number;
  revenue_max?: number;
  founded_min?: number;
  founded_max?: number;
  // People search filters
  company_domain?: string[];
  job_title?: string[];
  seniority_level?: SeniorityLevel[];
  name?: string;
  // Similarity search (company_search with lookalike domains — passed as domain[])
  lookalike_domains?: string[];
  // Pagination
  page?: number;
  per_page?: number;
  // Runtime
  preview_mode?: boolean;
}

export interface AiArkSearchResult {
  results: Record<string, unknown>[];
  companies?: Record<string, unknown>[];
  contacts?: Record<string, unknown>[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_more: boolean;
    returned: number;
  };
  total_count: number;
  estimated_credit_cost: {
    search_cost: number;
    description: string;
  };
  credits_consumed: number;
  action: AiArkAction;
}

// ─── Rate-limit delay (250ms = max 4 req/sec, safely under 5/sec limit) ───────

const RATE_LIMIT_DELAY_MS = 250;

let lastCallAt = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed)
    );
  }
  lastCallAt = Date.now();
}

// ─── Executor ────────────────────────────────────────────────────────────────

/**
 * Execute an AI Ark search from a workflow node.
 *
 * Handles similarity_search by mapping it to company_search with
 * lookalike_domains passed as the `domain` filter (edge function does the rest).
 */
export async function executeAiArkSearch(
  config: AiArkSearchNodeConfig,
  contextVariables?: Record<string, unknown>
): Promise<AiArkSearchResult> {
  await enforceRateLimit();

  // Resolve any template variables in string fields
  const resolved = resolveConfigVariables(config, contextVariables ?? {});

  // Build the request payload
  const payload: Record<string, unknown> = {
    action: resolved.action === 'similarity_search' ? 'company_search' : resolved.action,
    preview_mode: resolved.preview_mode ?? false,
    page: resolved.page ?? 1,
    per_page: resolved.per_page ?? 25,
  };

  if (resolved.action === 'similarity_search') {
    // Similarity search: pass lookalike domains as domain filter
    const domains = resolved.lookalike_domains ?? [];
    if (domains.length > 0) {
      payload.domain = domains.slice(0, 5); // AI Ark max 5 lookalike domains
    }
  } else if (resolved.action === 'company_search') {
    if (resolved.industry?.length) payload.industry = resolved.industry;
    if (resolved.employee_min != null) payload.employee_min = resolved.employee_min;
    if (resolved.employee_max != null) payload.employee_max = resolved.employee_max;
    if (resolved.location?.length) payload.location = resolved.location;
    if (resolved.domain?.length) payload.domain = resolved.domain;
    if (resolved.company_name) payload.company_name = resolved.company_name;
    if (resolved.keywords?.length) payload.keywords = resolved.keywords;
    if (resolved.technologies?.length) payload.technologies = resolved.technologies;
    if (resolved.revenue_min != null) payload.revenue_min = resolved.revenue_min;
    if (resolved.revenue_max != null) payload.revenue_max = resolved.revenue_max;
    if (resolved.founded_min != null) payload.founded_min = resolved.founded_min;
    if (resolved.founded_max != null) payload.founded_max = resolved.founded_max;
  } else {
    // people_search
    if (resolved.company_domain?.length) payload.company_domain = resolved.company_domain;
    if (resolved.company_name) payload.company_name = resolved.company_name;
    if (resolved.job_title?.length) payload.job_title = resolved.job_title;
    if (resolved.seniority_level?.length) payload.seniority_level = resolved.seniority_level;
    if (resolved.location?.length) payload.location = resolved.location;
    if (resolved.name) payload.name = resolved.name;
  }

  const { data, error } = await supabase.functions.invoke<AiArkSearchResult>(
    'ai-ark-search',
    { body: payload }
  );

  if (error) {
    throw new Error(`AI Ark search failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('AI Ark search returned no data');
  }

  return data;
}

// ─── Credit cost estimation ───────────────────────────────────────────────────

export const CREDIT_COSTS: Record<AiArkAction, { cost: number; label: string }> = {
  company_search: { cost: 2.5, label: '~2.5 credits per search' },
  people_search: { cost: 12.5, label: '~12.5 credits per search' },
  similarity_search: { cost: 2.5, label: '~2.5 credits per search' },
};

export function estimateCreditCost(action: AiArkAction): string {
  return CREDIT_COSTS[action]?.label ?? 'Unknown cost';
}

// ─── Template variable resolution ────────────────────────────────────────────

function resolveString(value: string, ctx: Record<string, unknown>): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const parts = path.trim().split('.');
    let cursor: unknown = ctx;
    for (const part of parts) {
      if (cursor == null || typeof cursor !== 'object') return '';
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return cursor != null ? String(cursor) : '';
  });
}

function resolveConfigVariables(
  config: AiArkSearchNodeConfig,
  ctx: Record<string, unknown>
): AiArkSearchNodeConfig {
  const resolve = (v: string) => resolveString(v, ctx);

  return {
    ...config,
    company_name: config.company_name ? resolve(config.company_name) : undefined,
    name: config.name ? resolve(config.name) : undefined,
    industry: config.industry?.map(resolve),
    keywords: config.keywords?.map(resolve),
    technologies: config.technologies?.map(resolve),
    location: config.location?.map(resolve),
    domain: config.domain?.map(resolve),
    company_domain: config.company_domain?.map(resolve),
    job_title: config.job_title?.map(resolve),
    lookalike_domains: config.lookalike_domains?.map(resolve),
  };
}
