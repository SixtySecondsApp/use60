import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from './corsHelper.ts';

type SupabaseClient = ReturnType<typeof createClient>;

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface SkillReference {
  type:
    | 'transcript'
    | 'enrichment'
    | 'draft'
    | 'analysis'
    | 'raw_response'
    | 'image'
    | 'document';
  location: string;
  summary?: string;
  size_bytes?: number;
  content_type?: string;
}

export interface SkillHints {
  suggested_next_skills?: string[];
  confidence?: number;
  flags?: string[];
}

export interface SkillResult {
  status: 'success' | 'partial' | 'failed';
  error?: string;
  summary: string;
  data: Record<string, unknown>;
  references: SkillReference[];
  hints?: SkillHints;
  meta: {
    skill_id: string;
    skill_version: string;
    execution_time_ms: number;
    tokens_used?: number;
    model?: string;
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function tryParseJson(text: string): unknown {
  // Extract JSON from markdown code blocks if present, else fallback to first {...} blob
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  return JSON.parse(jsonStr);
}

function tryExecuteDeterministicTestSkill(params: {
  skillKey: string;
  context: Record<string, unknown>;
  skillVersion: string;
  startedAtMs: number;
}): SkillResult | null {
  const execMs = () => Date.now() - params.startedAtMs;

  if (params.skillKey === 'test-echo') {
    const text = typeof params.context.text === 'string' ? params.context.text : '';
    const note = typeof params.context.note === 'string' ? params.context.note : '';
    if (!text.trim()) {
      return {
        status: 'failed',
        error: 'context.text is required',
        summary: 'Missing required input: text.',
        data: {},
        references: [],
        meta: {
          skill_id: params.skillKey,
          skill_version: params.skillVersion,
          execution_time_ms: execMs(),
          tokens_used: 0,
          model: 'deterministic',
        },
      };
    }

    return {
      status: 'success',
      summary: 'Echoed input text and computed metrics.',
      data: {
        text,
        note,
        text_upper: text.toUpperCase(),
        char_count: text.length,
      },
      references: [],
      meta: {
        skill_id: params.skillKey,
        skill_version: params.skillVersion,
        execution_time_ms: execMs(),
        tokens_used: 0,
        model: 'deterministic',
      },
    };
  }

  if (params.skillKey === 'test-first-3-sentences') {
    const text = typeof params.context.text === 'string' ? params.context.text : '';
    if (!text.trim()) {
      return {
        status: 'failed',
        error: 'context.text is required',
        summary: 'Missing required input: text.',
        data: {},
        references: [],
        meta: {
          skill_id: params.skillKey,
          skill_version: params.skillVersion,
          execution_time_ms: execMs(),
          tokens_used: 0,
          model: 'deterministic',
        },
      };
    }

    const sentences = text
      .split('.')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return {
      status: 'success',
      summary: `Extracted ${sentences.length} sentence(s).`,
      data: {
        sentences,
        sentence_count: sentences.length,
      },
      references: [],
      meta: {
        skill_id: params.skillKey,
        skill_version: params.skillVersion,
        execution_time_ms: execMs(),
        tokens_used: 0,
        model: 'deterministic',
      },
    };
  }

  return null;
}

async function executeFromPromptRuntime(
  supabase: SupabaseClient,
  skillKey: string,
  context: Record<string, unknown>,
  options: { organizationId: string; userId: string; storeFullOutput?: boolean }
): Promise<SkillResult | null> {
  try {
    // Lazy import to avoid loading a large runtime when org skills are present.
    const mod = await import('./skillsRuntime.ts');
    if (typeof mod.runSkillWithContract !== 'function') return null;
    const res = await mod.runSkillWithContract(supabase as any, skillKey, context as any, {
      orgId: options.organizationId,
      userId: options.userId,
      storeFullOutput: options.storeFullOutput ?? false,
      skillVersion: '1.0.0',
    });
    return res as SkillResult;
  } catch {
    return null;
  }
}

export async function executeAgentSkillWithContract(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    skillKey: string;
    context: Record<string, unknown>;
    dryRun?: boolean;
    storeFullOutput?: boolean;
  }
): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // -------------------------------------------------------------------------
    // 1) Prefer org-enabled compiled skill doc from organization_skills
    // -------------------------------------------------------------------------
    const { data: row, error: rowError } = await supabase
      .from('organization_skills')
      .select(
        `
        skill_id,
        is_enabled,
        compiled_frontmatter,
        compiled_content,
        platform_skill_version,
        platform_skills:platform_skill_id(category, frontmatter, content_template, version, is_active)
      `
      )
      .eq('organization_id', params.organizationId)
      .eq('skill_id', params.skillKey)
      .eq('is_active', true)
      .maybeSingle();

    if (rowError) {
      throw new Error(`Failed to load org skill: ${rowError.message}`);
    }

    const platformCategory = row?.platform_skills?.category as string | undefined;
    const isEnabled = row?.is_enabled ?? false;

    // If skill is not present or not enabled, fall back to prompt runtime (if available)
    if (!row || !isEnabled) {
      const fallback = await executeFromPromptRuntime(
        supabase,
        params.skillKey,
        params.context,
        { organizationId: params.organizationId, userId: params.userId, storeFullOutput: params.storeFullOutput }
      );
      if (fallback) return fallback;
      return {
        status: 'failed',
        error: `Skill not found or not enabled for org: ${params.skillKey}`,
        summary: `Skill ${params.skillKey} is not available for this organization.`,
        data: {},
        references: [],
        meta: {
          skill_id: params.skillKey,
          skill_version: '1.0.0',
          execution_time_ms: Date.now() - startTime,
        },
      };
    }

    // Disallow executing a sequence via the single-skill executor
    if (platformCategory === 'agent-sequence') {
      return {
        status: 'failed',
        error: `Skill ${params.skillKey} is a sequence (agent-sequence). Use run_sequence instead.`,
        summary: `Cannot execute sequence ${params.skillKey} as a single skill.`,
        data: {},
        references: [],
        meta: {
          skill_id: params.skillKey,
          skill_version: String(row.platform_skill_version ?? row.platform_skills?.version ?? 1),
          execution_time_ms: Date.now() - startTime,
        },
      };
    }

    const frontmatter =
      (row.compiled_frontmatter || row.platform_skills?.frontmatter || {}) as Record<string, unknown>;
    const content = String(
      row.compiled_content || row.platform_skills?.content_template || ''
    );

    // -------------------------------------------------------------------------
    // 2) Deterministic test skills (no external AI dependency)
    // -------------------------------------------------------------------------
    const skillVersion = String(row.platform_skill_version ?? row.platform_skills?.version ?? 1);
    const deterministic = tryExecuteDeterministicTestSkill({
      skillKey: params.skillKey,
      context: params.context,
      skillVersion,
      startedAtMs: startTime,
    });
    if (deterministic) {
      return deterministic;
    }

    // -------------------------------------------------------------------------
    // 3) Execute via Claude using the org skill document as the authoritative instructions
    // -------------------------------------------------------------------------
    if (!ANTHROPIC_API_KEY) {
      return {
        status: 'failed',
        error: 'ANTHROPIC_API_KEY not configured',
        summary: `Cannot execute skill ${params.skillKey}: AI API key not configured.`,
        data: {},
        references: [],
        meta: {
          skill_id: params.skillKey,
          skill_version: skillVersion,
          execution_time_ms: Date.now() - startTime,
        },
      };
    }

    const systemPrompt = `You are an execution engine for a sales assistant platform.

You will be given:
1) A SKILL DOCUMENT (markdown) containing the canonical process/instructions for a single-step skill.
2) Frontmatter JSON with metadata (name, description, requires_context, outputs, etc.)
3) A runtime context JSON object.

Your job:
- Follow the skill document exactly.
- Produce a SINGLE JSON object that matches this contract (no markdown, no extra keys):

{
  "status": "success" | "partial" | "failed",
  "error"?: string,
  "summary": string,
  "data": object,
  "references": array,
  "hints"?: { "suggested_next_skills"?: string[], "confidence"?: number, "flags"?: string[] },
  "meta": { "skill_id": string, "skill_version": string, "execution_time_ms": number, "tokens_used"?: number, "model"?: string }
}

Hard rules:
- summary must be concise (<= 100 words).
- references must be an array (can be empty).
- meta.skill_id MUST equal "${params.skillKey}".
- If dry_run is true, do not recommend or perform irreversible side effects; flag "needs_human_review" when appropriate.

Return ONLY valid JSON.`;

    const userPayload = {
      skill_key: params.skillKey,
      dry_run: params.dryRun === true,
      frontmatter,
      skill_document: content,
      context: params.context,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    const contentText = json?.content?.[0]?.text ? String(json.content[0].text) : '';
    const usage = json?.usage ? json.usage : null;

    let parsed: any;
    try {
      parsed = tryParseJson(contentText);
    } catch (e) {
      return {
        status: 'failed',
        error: 'Failed to parse skill output JSON',
        summary: `Skill ${params.skillKey} returned invalid JSON.`,
        data: { raw: contentText },
        references: [
          {
            type: 'raw_response',
            location: 'inline://anthropic',
            summary: contentText.slice(0, 200),
          },
        ],
        meta: {
          skill_id: params.skillKey,
          skill_version: String(row.platform_skill_version ?? row.platform_skills?.version ?? 1),
          execution_time_ms: Date.now() - startTime,
          tokens_used:
            typeof usage?.input_tokens === 'number' && typeof usage?.output_tokens === 'number'
              ? usage.input_tokens + usage.output_tokens
              : undefined,
          model: DEFAULT_MODEL,
        },
      };
    }

    // Defensive normalization
    const result: SkillResult = {
      status: (parsed?.status as SkillResult['status']) || 'success',
      error: parsed?.error,
      summary: typeof parsed?.summary === 'string' ? parsed.summary : `${params.skillKey} completed.`,
      data: (parsed?.data && typeof parsed.data === 'object') ? parsed.data : {},
      references: Array.isArray(parsed?.references) ? parsed.references : [],
      hints: parsed?.hints && typeof parsed.hints === 'object' ? parsed.hints : undefined,
      meta: {
        skill_id: params.skillKey,
        skill_version: skillVersion,
        execution_time_ms: Date.now() - startTime,
        tokens_used:
          typeof usage?.input_tokens === 'number' && typeof usage?.output_tokens === 'number'
            ? usage.input_tokens + usage.output_tokens
            : undefined,
        model: DEFAULT_MODEL,
      },
    };

    // Ensure skill_id is correct even if model drifted
    result.meta.skill_id = params.skillKey;

    return result;
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    return {
      status: 'failed',
      error: errorMessage,
      summary: `Skill ${params.skillKey} failed: ${errorMessage}`,
      data: {},
      references: [],
      meta: {
        skill_id: params.skillKey,
        skill_version: '1.0.0',
        execution_time_ms: Date.now() - startTime,
      },
    };
  }
}

// Exported only to satisfy some bundlers/lints that strip unused imports.
// (Used by edge functions that import this module.)
export function _noopCorsHeaders(req: Request): Record<string, string> {
  return getCorsHeaders(req);
}

