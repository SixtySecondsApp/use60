/**
 * Skills Runtime for Proactive Notifications
 *
 * Cron-safe runtime for executing AI skills in edge functions.
 * Loads skill templates, builds context, and calls Claude API to produce structured JSON.
 *
 * Context Engineering Integration:
 * - runSkillWithContract(): Returns standardized SkillResult contract
 * - Follows compaction principle: summaries in context, full data in references
 * - Token budget awareness for efficient context management
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { loadPrompt, interpolateVariables } from './promptLoader.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// =============================================================================
// CONTEXT ENGINEERING TYPES (Inline for Edge Function compatibility)
// =============================================================================

/**
 * Reference to externally stored data
 * Follows compaction principle: pointers, not payloads
 */
export interface SkillReference {
  type: 'transcript' | 'enrichment' | 'draft' | 'analysis' | 'raw_response' | 'image' | 'document';
  location: string;
  summary?: string;
  size_bytes?: number;
  content_type?: string;
}

/**
 * Hints for the orchestrator
 */
export interface SkillHints {
  suggested_next_skills?: string[];
  confidence?: number;
  flags?: Array<
    | 'needs_human_review'
    | 'high_value'
    | 'risk_detected'
    | 'competitor_mentioned'
    | 'budget_discussed'
    | 'timeline_mentioned'
    | 'champion_identified'
    | 'blocker_identified'
    | 'expansion_opportunity'
  >;
}

/**
 * Standard SkillResult contract following Context Engineering principles
 * Every skill returns this contract - no exceptions
 */
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
    sources?: Array<{ title?: string; uri?: string }>;
  };
}

/**
 * Context Engineering Rules
 */
const CONTEXT_RULES = {
  MAX_SUMMARY_WORDS: 100,
  MAX_KEY_DATA_ITEMS: 10,
  TOKEN_BUDGET: {
    skill_result: 300,
    per_step_ceiling: 3800,
  },
} as const;

// Skills that require web search capabilities (routed to Gemini)
const WEB_SEARCH_SKILLS = [
  'lead-research',
  'company-analysis',
  'competitor-intel',
  'market-research',
  'industry-trends',
];

// Skills that generate images (routed to Gemini Imagen 3)
const IMAGE_GENERATION_SKILLS = [
  'image-generation',
  'prospect-visual',
];

export interface SkillContext {
  [key: string]: any;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  model?: string;
  tokensUsed?: number;
  sources?: Array<{ title?: string; uri?: string }>;
}

/**
 * Execute a skill using Gemini Imagen 3 for image generation
 *
 * Used for image generation skills:
 * - image-generation: General purpose image creation
 * - prospect-visual: Personalized visuals for sales outreach
 *
 * @param supabase - Supabase client (service role)
 * @param skillKey - Skill key
 * @param context - Context variables for interpolation
 * @returns Image URL and metadata
 */
export async function runSkillWithImagen(
  supabase: SupabaseClient,
  skillKey: string,
  context: SkillContext
): Promise<SkillExecutionResult> {
  if (!GEMINI_API_KEY) {
    console.warn('[skillsRuntime] GEMINI_API_KEY not set for Imagen');
    return {
      success: false,
      error: 'Gemini API key not configured for image generation',
    };
  }

  try {
    // Load prompt configuration
    const promptConfig = await loadPrompt(supabase, skillKey);

    if (!promptConfig) {
      return {
        success: false,
        error: `Image generation prompt not found: ${skillKey}`,
      };
    }

    // Build the image prompt from user prompt template
    const imagePrompt = interpolateVariables(promptConfig.userPrompt, context);

    // Also apply system prompt context for better guidance
    const systemGuidance = interpolateVariables(promptConfig.systemPrompt, context);
    const fullPrompt = `${systemGuidance}\n\n${imagePrompt}`;

    console.log(`[skillsRuntime] Calling Imagen 3 for ${skillKey}`);

    // Imagen 3 API request format
    const requestBody = {
      instances: [
        {
          prompt: fullPrompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: context.aspectRatio || '1:1',
        personGeneration: 'dont_allow', // Safe for business use
        safetySetting: 'block_some',
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Imagen API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract the generated image
    const predictions = data.predictions || [];
    if (predictions.length === 0) {
      return {
        success: false,
        error: 'No image generated',
      };
    }

    // Imagen 3 returns base64 encoded images
    const imageData = predictions[0];
    const output = {
      imageBase64: imageData.bytesBase64Encoded,
      mimeType: imageData.mimeType || 'image/png',
      prompt: fullPrompt,
      aspectRatio: context.aspectRatio || '1:1',
    };

    console.log(`[skillsRuntime] Imagen skill ${skillKey} completed successfully`);

    return {
      success: true,
      output,
      model: 'imagen-3.0-generate-002',
    };
  } catch (error) {
    console.error(`[skillsRuntime] Imagen error for ${skillKey}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Imagen error',
    };
  }
}

/**
 * Execute a skill using Gemini 3 Flash with Google Search grounding
 *
 * Used for research skills that benefit from real-time web search:
 * - lead-research: Company research with current news and stakeholders
 * - company-analysis: Business analysis with market data
 * - competitor-intel: Competitive intelligence with recent developments
 *
 * @param supabase - Supabase client (service role)
 * @param skillKey - Skill key
 * @param context - Context variables for interpolation
 * @param enableWebSearch - Whether to enable Google Search grounding (default: true)
 * @returns Structured JSON output with web sources
 */
export async function runSkillWithGemini(
  supabase: SupabaseClient,
  skillKey: string,
  context: SkillContext,
  enableWebSearch: boolean = true
): Promise<SkillExecutionResult> {
  if (!GEMINI_API_KEY) {
    console.warn('[skillsRuntime] GEMINI_API_KEY not set, falling back to Claude');
    return {
      success: false,
      error: 'Gemini API key not configured',
    };
  }

  try {
    // Load prompt configuration
    const promptConfig = await loadPrompt(supabase, skillKey);

    if (!promptConfig) {
      return {
        success: false,
        error: `Prompt not found: ${skillKey}`,
        output: getFallbackOutput(skillKey, context),
      };
    }

    // Interpolate variables in user prompt
    const userPrompt = interpolateVariables(promptConfig.userPrompt, context);
    const systemPrompt = interpolateVariables(promptConfig.systemPrompt, context);

    // Build Gemini request body
    // Note: responseMimeType: 'application/json' is NOT compatible with Google Search grounding
    // So we omit it when using web search and parse JSON from text response instead
    const generationConfig: Record<string, unknown> = {
      temperature: promptConfig.temperature || 0.7,
      maxOutputTokens: promptConfig.maxTokens || 4096,
    };

    // Only add JSON mime type if NOT using web search (they're incompatible)
    if (!enableWebSearch) {
      generationConfig.responseMimeType = 'application/json';
    }

    const requestBody: Record<string, unknown> = {
      contents: [{
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
      }],
      generationConfig,
    };

    // Enable Google Search grounding for web search capability
    if (enableWebSearch) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    console.log(`[skillsRuntime] Calling Gemini for ${skillKey} with web search: ${enableWebSearch}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Debug logging for Gemini response
    console.log(`[skillsRuntime] Gemini response status: ${response.status}`);
    console.log(`[skillsRuntime] Gemini candidates count: ${data.candidates?.length || 0}`);
    if (data.candidates?.[0]?.finishReason) {
      console.log(`[skillsRuntime] Gemini finish reason: ${data.candidates[0].finishReason}`);
    }
    if (data.error) {
      console.error(`[skillsRuntime] Gemini API error in response:`, JSON.stringify(data.error));
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[skillsRuntime] Gemini response text length: ${text.length} chars`);

    // Extract grounding sources from web search results
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources: Array<{ title?: string; uri?: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title,
            uri: chunk.web.uri,
          });
        }
      }
    }

    // Parse JSON output
    let output;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
                       text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      output = JSON.parse(jsonStr);

      // Attach sources to output if available
      if (sources.length > 0) {
        output.sources = sources;
      }
    } catch (parseError) {
      console.warn('[skillsRuntime] Failed to parse Gemini JSON, returning raw text');
      output = { raw: text, sources };
    }

    console.log(`[skillsRuntime] Gemini skill ${skillKey} completed with ${sources.length} sources`);

    return {
      success: true,
      output,
      model: 'gemini-2.0-flash',
      sources,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  } catch (error) {
    console.error(`[skillsRuntime] Gemini error for ${skillKey}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Gemini error',
      output: getFallbackOutput(skillKey, context),
    };
  }
}

/**
 * Execute a skill for proactive notifications
 * 
 * @param supabase - Supabase client (service role)
 * @param skillKey - Skill key (prompt feature key or skill_id)
 * @param context - Context variables for interpolation
 * @param orgId - Organization ID (for loading org-specific skills)
 * @param userId - User ID (optional, for user-specific prompts)
 * @returns Structured JSON output
 */
export async function runSkill(
  supabase: SupabaseClient,
  skillKey: string,
  context: SkillContext,
  orgId?: string,
  userId?: string
): Promise<SkillExecutionResult> {
  // Route image generation skills to Gemini Imagen 3
  if (IMAGE_GENERATION_SKILLS.includes(skillKey)) {
    console.log(`[skillsRuntime] Routing ${skillKey} to Gemini Imagen 3`);
    return await runSkillWithImagen(supabase, skillKey, context);
  }

  // Route web search skills to Gemini with Google Search grounding
  if (WEB_SEARCH_SKILLS.includes(skillKey)) {
    console.log(`[skillsRuntime] Routing ${skillKey} to Gemini with web search`);
    const geminiResult = await runSkillWithGemini(supabase, skillKey, context, true);

    // If Gemini succeeds, return its result
    if (geminiResult.success) {
      return geminiResult;
    }

    // If Gemini fails (e.g., no API key), fall back to Claude
    console.warn(`[skillsRuntime] Gemini failed for ${skillKey}, falling back to Claude`);
  }

  if (!ANTHROPIC_API_KEY) {
    console.warn('[skillsRuntime] ANTHROPIC_API_KEY not set, returning fallback');
    return {
      success: false,
      error: 'AI API key not configured',
      output: getFallbackOutput(skillKey, context),
    };
  }

  try {
    // Try to load prompt from database (org/user-specific or platform default)
    let promptConfig;
    try {
      promptConfig = await loadPrompt(supabase, skillKey, userId || undefined);
    } catch (error) {
      console.warn(`[skillsRuntime] Failed to load prompt for ${skillKey}, using default`);
      // Will use default from promptLoader if available
      promptConfig = await loadPrompt(supabase, skillKey, userId || undefined);
    }

    if (!promptConfig) {
      return {
        success: false,
        error: `Prompt not found: ${skillKey}`,
        output: getFallbackOutput(skillKey, context),
      };
    }

    // Interpolate variables in prompts
    const systemPrompt = interpolateVariables(promptConfig.systemPrompt, context);
    const userPrompt = interpolateVariables(promptConfig.userPrompt, context);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: promptConfig.model || DEFAULT_MODEL,
        max_tokens: promptConfig.maxTokens || 2048,
        temperature: promptConfig.temperature || 0.7,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Claude API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON output
    let output;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                       content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      output = JSON.parse(jsonStr);
    } catch (parseError) {
      // If JSON parsing fails, return raw text
      console.warn('[skillsRuntime] Failed to parse JSON, returning raw text');
      output = { raw: content };
    }

    return {
      success: true,
      output,
      model: promptConfig.model || DEFAULT_MODEL,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    };
  } catch (error) {
    console.error(`[skillsRuntime] Error executing skill ${skillKey}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      output: getFallbackOutput(skillKey, context),
    };
  }
}

/**
 * Get fallback output when AI is unavailable
 */
function getFallbackOutput(skillKey: string, context: SkillContext): any {
  // Provide deterministic fallbacks for common skills
  if (skillKey.includes('morning') || skillKey.includes('brief')) {
    return {
      insights: ['Review your calendar for today', 'Check overdue tasks', 'Follow up on pending deals'],
      priorities: ['Complete overdue tasks', 'Prepare for upcoming meetings'],
    };
  }

  if (skillKey.includes('meeting') || skillKey.includes('prep')) {
    return {
      talkingPoints: [
        'Review previous discussions',
        'Understand current priorities',
        'Identify next steps',
      ],
    };
  }

  if (skillKey.includes('followup') || skillKey.includes('email')) {
    return {
      draft: 'Following up on our conversation. Key next steps:',
    };
  }

  return {
    message: 'AI processing unavailable. Please review manually.',
  };
}

/**
 * Execute multiple skills in parallel
 */
export async function runSkills(
  supabase: SupabaseClient,
  skills: Array<{ key: string; context: SkillContext }>,
  orgId?: string,
  userId?: string
): Promise<Record<string, SkillExecutionResult>> {
  const results: Record<string, SkillExecutionResult> = {};

  await Promise.all(
    skills.map(async ({ key, context }) => {
      results[key] = await runSkill(supabase, key, context, orgId, userId);
    })
  );

  return results;
}

// =============================================================================
// CONTEXT ENGINEERING: SKILL RESULT CONTRACT
// =============================================================================

/**
 * Execute a skill and return the standardized SkillResult contract
 *
 * This is the preferred method for sequence execution as it follows
 * Context Engineering principles:
 * - Returns compact summaries, not full payloads
 * - Includes references for full data retrieval
 * - Provides hints for orchestrator decision-making
 * - Tracks token usage for budget management
 *
 * @param supabase - Supabase client (service role)
 * @param skillKey - Skill key
 * @param context - Context variables for interpolation
 * @param options - Additional options for contract generation
 * @returns Standardized SkillResult contract
 */
export async function runSkillWithContract(
  supabase: SupabaseClient,
  skillKey: string,
  context: SkillContext,
  options?: {
    orgId?: string;
    userId?: string;
    storeFullOutput?: boolean;
    skillVersion?: string;
  }
): Promise<SkillResult> {
  const startTime = Date.now();

  // Execute the skill using existing runtime
  const legacyResult = await runSkill(
    supabase,
    skillKey,
    context,
    options?.orgId,
    options?.userId
  );

  const executionTimeMs = Date.now() - startTime;

  // Convert to Context Engineering contract
  return convertToSkillResultContract(
    skillKey,
    legacyResult,
    executionTimeMs,
    options?.skillVersion || '1.0.0',
    options?.storeFullOutput ? supabase : undefined,
    options?.orgId
  );
}

/**
 * Execute multiple skills with contract results in parallel
 */
export async function runSkillsWithContract(
  supabase: SupabaseClient,
  skills: Array<{ key: string; context: SkillContext }>,
  options?: {
    orgId?: string;
    userId?: string;
    storeFullOutput?: boolean;
  }
): Promise<Record<string, SkillResult>> {
  const results: Record<string, SkillResult> = {};

  await Promise.all(
    skills.map(async ({ key, context }) => {
      results[key] = await runSkillWithContract(supabase, key, context, options);
    })
  );

  return results;
}

/**
 * Convert legacy SkillExecutionResult to SkillResult contract
 */
async function convertToSkillResultContract(
  skillKey: string,
  legacyResult: SkillExecutionResult,
  executionTimeMs: number,
  skillVersion: string,
  supabase?: SupabaseClient,
  orgId?: string
): Promise<SkillResult> {
  // Handle failed execution
  if (!legacyResult.success) {
    return {
      status: 'failed',
      error: legacyResult.error || 'Unknown error',
      summary: `Skill ${skillKey} failed: ${legacyResult.error || 'Unknown error'}`,
      data: {},
      references: [],
      meta: {
        skill_id: skillKey,
        skill_version: skillVersion,
        execution_time_ms: executionTimeMs,
        model: legacyResult.model,
        tokens_used: legacyResult.tokensUsed,
      },
    };
  }

  const output = legacyResult.output || {};
  const references: SkillReference[] = [];

  // Store full output if requested and data is large
  if (supabase && orgId && shouldStoreExternally(output)) {
    const reference = await storeOutputExternally(
      supabase,
      skillKey,
      output,
      orgId
    );
    if (reference) {
      references.push(reference);
    }
  }

  // Generate compact summary
  const summary = generateSkillSummary(skillKey, output);

  // Extract key data points (compact representation)
  const keyData = extractKeyData(skillKey, output);

  // Detect hints from output
  const hints = detectHints(skillKey, output);

  // Add sources as references if present
  if (legacyResult.sources && legacyResult.sources.length > 0) {
    for (const source of legacyResult.sources.slice(0, 5)) {
      references.push({
        type: 'raw_response',
        location: source.uri || '',
        summary: source.title,
      });
    }
  }

  return {
    status: 'success',
    summary: compactSummary(summary, CONTEXT_RULES.MAX_SUMMARY_WORDS),
    data: keyData,
    references,
    hints: hints.flags && hints.flags.length > 0 ? hints : undefined,
    meta: {
      skill_id: skillKey,
      skill_version: skillVersion,
      execution_time_ms: executionTimeMs,
      model: legacyResult.model,
      tokens_used: legacyResult.tokensUsed,
      sources: legacyResult.sources,
    },
  };
}

/**
 * Check if output should be stored externally based on size
 */
function shouldStoreExternally(output: unknown): boolean {
  const str = JSON.stringify(output);
  // Store externally if > 2KB (roughly 500 tokens)
  return str.length > 2000;
}

/**
 * Store output externally and return reference
 */
async function storeOutputExternally(
  supabase: SupabaseClient,
  skillKey: string,
  output: unknown,
  orgId: string
): Promise<SkillReference | null> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomId = Math.random().toString(36).substring(2, 9);
    const path = `${orgId}/skill-outputs/${skillKey}/${timestamp}-${randomId}.json`;

    const jsonData = JSON.stringify(output, null, 2);
    const sizeBytes = new Blob([jsonData]).size;

    // Try to store in skill_output_storage table
    const { error } = await supabase.from('skill_output_storage').insert({
      organization_id: orgId,
      path,
      content_type: inferContentType(skillKey),
      data: output,
      size_bytes: sizeBytes,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn(`[skillsRuntime] Failed to store output externally: ${error.message}`);
      return null;
    }

    return {
      type: inferContentType(skillKey),
      location: `db://skill_output_storage/${path}`,
      size_bytes: sizeBytes,
      content_type: 'application/json',
    };
  } catch (error) {
    console.warn('[skillsRuntime] External storage error:', error);
    return null;
  }
}

/**
 * Infer content type from skill key
 */
function inferContentType(skillKey: string): SkillReference['type'] {
  if (skillKey.includes('transcript')) return 'transcript';
  if (skillKey.includes('enrich') || skillKey.includes('research')) return 'enrichment';
  if (skillKey.includes('draft') || skillKey.includes('email') || skillKey.includes('follow')) return 'draft';
  if (skillKey.includes('analyz') || skillKey.includes('meeting')) return 'analysis';
  if (skillKey.includes('image')) return 'image';
  return 'raw_response';
}

/**
 * Generate a compact summary from skill output
 */
function generateSkillSummary(skillKey: string, output: Record<string, unknown>): string {
  const parts: string[] = [];

  // Skill-specific summary generation
  if (skillKey.includes('transcript') || skillKey.includes('meeting')) {
    if (output.duration_mins) parts.push(`${output.duration_mins} min call`);
    if (output.speakers && Array.isArray(output.speakers)) {
      const names = output.speakers.slice(0, 3).map((s: Record<string, unknown>) => s.name).join(', ');
      parts.push(`with ${names}`);
    }
    if (output.sentiment) parts.push(`Sentiment: ${output.sentiment}`);
  } else if (skillKey.includes('enrich') || skillKey.includes('research')) {
    const company = output.company as Record<string, unknown> | undefined;
    if (company?.name) parts.push(`${company.name}`);
    if (company?.industry) parts.push(`${company.industry}`);
    if (company?.employee_count) parts.push(`${company.employee_count} employees`);
    if (output.icp_score !== undefined) parts.push(`ICP: ${((output.icp_score as number) * 100).toFixed(0)}%`);
  } else if (skillKey.includes('draft') || skillKey.includes('email')) {
    if (output.draft_type) parts.push(`${output.draft_type} drafted`);
    if (output.subject) parts.push(`"${output.subject}"`);
    if (output.tone) parts.push(`Tone: ${output.tone}`);
  } else if (skillKey.includes('analyz')) {
    if (output.overall_sentiment) parts.push(`${output.overall_sentiment}`);
    if (output.objections && Array.isArray(output.objections)) {
      parts.push(`${output.objections.length} objection(s)`);
    }
    if (output.action_items && Array.isArray(output.action_items)) {
      parts.push(`${output.action_items.length} action item(s)`);
    }
  } else {
    // Generic summary
    const keys = Object.keys(output).slice(0, 4);
    for (const key of keys) {
      const val = output[key];
      if (Array.isArray(val)) {
        parts.push(`${key}: ${val.length} items`);
      } else if (typeof val === 'string' && val.length < 50) {
        parts.push(`${key}: ${val}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('. ') + '.' : `${skillKey} completed successfully.`;
}

/**
 * Extract key data points to keep in context
 */
function extractKeyData(skillKey: string, output: Record<string, unknown>): Record<string, unknown> {
  const keyData: Record<string, unknown> = {};
  const maxItems = CONTEXT_RULES.MAX_KEY_DATA_ITEMS;

  // Skill-specific key data extraction
  if (skillKey.includes('transcript')) {
    keyData.duration_mins = output.duration_mins;
    keyData.speakers = (output.speakers as unknown[])?.slice(0, 5);
    keyData.key_quotes = (output.key_quotes as unknown[])?.slice(0, 5);
    keyData.sentiment = output.sentiment;
  } else if (skillKey.includes('enrich') || skillKey.includes('research')) {
    const company = output.company as Record<string, unknown> | undefined;
    if (company) {
      keyData.company = {
        name: company.name,
        industry: company.industry,
        employee_count: company.employee_count,
        funding_stage: company.funding_stage,
      };
    }
    keyData.icp_score = output.icp_score;
    keyData.tech_stack = (output.tech_stack as string[])?.slice(0, 5);
  } else if (skillKey.includes('analyz') || skillKey.includes('meeting')) {
    keyData.overall_sentiment = output.overall_sentiment;
    keyData.objections = (output.objections as unknown[])?.slice(0, 3);
    keyData.action_items = (output.action_items as unknown[])?.slice(0, 5);
    keyData.stakeholders = (output.stakeholders as unknown[])?.slice(0, 4);
    keyData.deal_stage_signal = output.deal_stage_signal;
    keyData.next_step_recommendation = output.next_step_recommendation;
  } else if (skillKey.includes('draft') || skillKey.includes('email')) {
    keyData.draft_type = output.draft_type;
    keyData.subject = output.subject;
    keyData.preview = output.preview;
    keyData.tone = output.tone;
    keyData.cta = output.cta;
  } else {
    // Generic extraction - take first N keys
    const keys = Object.keys(output).slice(0, maxItems);
    for (const key of keys) {
      const val = output[key];
      if (Array.isArray(val)) {
        keyData[key] = val.slice(0, 5);
      } else if (typeof val !== 'object') {
        keyData[key] = val;
      }
    }
  }

  return keyData;
}

/**
 * Detect hints from skill output
 */
function detectHints(skillKey: string, output: Record<string, unknown>): SkillHints {
  const flags: SkillHints['flags'] = [];

  // Check for competitor mentions
  const outputStr = JSON.stringify(output).toLowerCase();
  if (
    outputStr.includes('competitor') ||
    outputStr.includes('gong') ||
    outputStr.includes('outreach') ||
    outputStr.includes('salesloft')
  ) {
    flags.push('competitor_mentioned');
  }

  // Check for budget discussions
  if (
    outputStr.includes('budget') ||
    outputStr.includes('pricing') ||
    outputStr.includes('cost')
  ) {
    flags.push('budget_discussed');
  }

  // Check for timeline mentions
  if (
    outputStr.includes('timeline') ||
    outputStr.includes('deadline') ||
    outputStr.includes('q1') ||
    outputStr.includes('q2') ||
    outputStr.includes('q3') ||
    outputStr.includes('q4')
  ) {
    flags.push('timeline_mentioned');
  }

  // Check for champion identification
  if (output.stakeholders && Array.isArray(output.stakeholders)) {
    const hasChampion = output.stakeholders.some(
      (s: Record<string, unknown>) => s.stance === 'champion'
    );
    if (hasChampion) flags.push('champion_identified');

    const hasBlocker = output.stakeholders.some(
      (s: Record<string, unknown>) => s.stance === 'blocker'
    );
    if (hasBlocker) flags.push('blocker_identified');
  }

  // Check for risks
  if (
    (output.objections && (output.objections as unknown[]).length > 0) ||
    (output.risks && (output.risks as unknown[]).length > 0)
  ) {
    flags.push('risk_detected');
  }

  // Check for high value signals
  if (output.icp_score !== undefined && (output.icp_score as number) > 0.8) {
    flags.push('high_value');
  }

  // Determine suggested next skills
  const suggestedNextSkills: string[] = [];
  if (skillKey.includes('transcript')) {
    suggestedNextSkills.push('meeting-analyzer', 'follow-up-drafter');
  } else if (skillKey.includes('enrich')) {
    suggestedNextSkills.push('lead-qualification', 'outreach-drafter');
  } else if (skillKey.includes('analyz')) {
    suggestedNextSkills.push('crm-updater', 'follow-up-drafter', 'slack-presenter');
  }

  return {
    flags: flags.length > 0 ? flags : undefined,
    suggested_next_skills: suggestedNextSkills.length > 0 ? suggestedNextSkills : undefined,
    confidence: calculateConfidence(output),
  };
}

/**
 * Calculate confidence score from output
 */
function calculateConfidence(output: Record<string, unknown>): number {
  let confidence = 0.7; // Default confidence

  // Adjust based on data completeness
  const keys = Object.keys(output);
  if (keys.length > 5) confidence += 0.1;
  if (keys.length > 10) confidence += 0.05;

  // Adjust based on specific fields
  if (output.sentiment) confidence += 0.05;
  if (output.action_items && (output.action_items as unknown[]).length > 0) confidence += 0.05;
  if (output.stakeholders && (output.stakeholders as unknown[]).length > 0) confidence += 0.05;

  return Math.min(confidence, 1.0);
}

/**
 * Compact a summary to fit within word limits
 */
function compactSummary(summary: string, maxWords: number): string {
  const words = summary.split(/\s+/);
  if (words.length <= maxWords) return summary;
  return words.slice(0, maxWords).join(' ') + '...';
}
