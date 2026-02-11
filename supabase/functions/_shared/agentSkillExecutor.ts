import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from './corsHelper.ts';

type SupabaseClient = ReturnType<typeof createClient>;

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const BRAVE_SEARCH_API_KEY = Deno.env.get('BRAVE_SEARCH_API_KEY');
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

/**
 * Execute a web search using Brave Search API
 */
async function executeWebSearch(query: string, count: number = 10): Promise<any> {
  if (!BRAVE_SEARCH_API_KEY) {
    throw new Error('BRAVE_SEARCH_API_KEY not configured');
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(count, 20))); // Max 20 results
  url.searchParams.set('text_decorations', 'false');
  url.searchParams.set('search_lang', 'en');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_SEARCH_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();

  // Format results for Claude
  const results = (data.web?.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    description: r.description,
    age: r.age,
  }));

  return {
    query,
    results,
    total_results: results.length,
  };
}

/**
 * Web search tool definition for Claude
 */
const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Search the web for information. Use this to find current information about companies, people, products, news, and other topics. Returns up to 10 relevant web pages with titles, URLs, and descriptions.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific and include relevant keywords.',
      },
      count: {
        type: 'number',
        description: 'Number of results to return (1-10). Default is 10.',
        default: 10,
      },
    },
    required: ['query'],
  },
};

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
        platform_skill_id,
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
    let skillContent = String(
      row.compiled_content || row.platform_skills?.content_template || ''
    );

    // -------------------------------------------------------------------------
    // 1b) Load skill-specific reference documents from skill_documents
    // -------------------------------------------------------------------------
    if (row.platform_skill_id) {
      const { data: refs } = await supabase
        .from('skill_documents')
        .select('title, content')
        .eq('skill_id', row.platform_skill_id)
        .eq('doc_type', 'reference');

      if (refs?.length) {
        skillContent += '\n\n---\n## Reference Documents\n';
        for (const ref of refs) {
          skillContent += `\n### ${ref.title}\n${ref.content}\n`;
        }
      }
    }

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
      skill_document: skillContent,
      context: params.context,
    };

    // Check if skill requires web_search capability
    const requiresWebSearch = frontmatter.requires_capabilities?.includes?.('web_search');

    // Build conversation messages
    const messages: any[] = [
      { role: 'user', content: JSON.stringify(userPayload) },
    ];

    let finalResponse: any = null;
    let totalTokensUsed = 0;
    const MAX_TOOL_ITERATIONS = 10; // Prevent infinite loops

    // Tool use loop: Claude may request multiple searches
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // Build API request body
      const apiBody: any = {
        model: requiresWebSearch ? 'claude-sonnet-4-5-20250929' : DEFAULT_MODEL,
        max_tokens: 8192,
        temperature: 0.3,
        system: systemPrompt,
        messages,
      };

      // Add web_search tool if required
      if (requiresWebSearch) {
        apiBody.tools = [WEB_SEARCH_TOOL];
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(apiBody),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Claude API error (${response.status}): ${errText}`);
      }

      const json = await response.json();
      totalTokensUsed += (json?.usage?.input_tokens || 0) + (json?.usage?.output_tokens || 0);

      // Add assistant's response to messages
      messages.push({
        role: 'assistant',
        content: json.content,
      });

      // Check stop reason
      if (json.stop_reason === 'end_turn') {
        // Claude finished - extract text response
        finalResponse = json;
        break;
      } else if (json.stop_reason === 'tool_use') {
        // Claude wants to use a tool
        const toolUses = json.content.filter((c: any) => c.type === 'tool_use');

        // Execute all requested tool calls
        const toolResults = [];
        for (const toolUse of toolUses) {
          if (toolUse.name === 'web_search') {
            try {
              const searchResult = await executeWebSearch(
                toolUse.input.query,
                toolUse.input.count || 10
              );
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(searchResult),
              });
            } catch (error: any) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                is_error: true,
                content: error.message,
              });
            }
          }
        }

        // Add tool results to conversation
        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue loop to get Claude's next response
      } else {
        // Unexpected stop reason
        throw new Error(`Unexpected stop_reason: ${json.stop_reason}`);
      }
    }

    if (!finalResponse) {
      throw new Error('Max tool iterations reached without completion');
    }

    // Extract text content from final response
    const contentText = finalResponse?.content?.find((c: any) => c.type === 'text')?.text || '';
    const usage = { input_tokens: totalTokensUsed, output_tokens: 0 };

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

