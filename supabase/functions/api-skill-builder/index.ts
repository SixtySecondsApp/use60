/**
 * Edge Function: AI Skill Builder
 *
 * Uses Claude Sonnet 4 to generate new copilot skills and sequences
 * based on natural language descriptions.
 *
 * Endpoints:
 * - POST /api-skill-builder/generate - Generate skill from description
 * - POST /api-skill-builder/classify - Classify a query into intent
 * - POST /api-skill-builder/test - Test a skill template
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Use Sonnet 4 for high-quality skill generation
const SKILL_GENERATION_MODEL = 'claude-sonnet-4-20250514';
const INTENT_CLASSIFICATION_MODEL = 'claude-haiku-4-5-20251001';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Types
// ============================================================================

interface GenerateSkillRequest {
  intent: string;
  exampleQueries: string[];
  capabilities: string[];
  type: 'skill' | 'sequence';
  category?: string;
}

interface GeneratedSkill {
  skillKey: string;
  name: string;
  category: string;
  frontmatter: Record<string, unknown>;
  contentTemplate: string;
  testCases: Array<{
    query: string;
    expectedBehavior: string;
  }>;
  rationale: string;
}

interface ClassifyIntentRequest {
  query: string;
  skillKeys?: string[];
}

interface ClassifyIntentResponse {
  intentCategory: string;
  normalizedQuery: string;
  matchedSkillKey: string | null;
  matchConfidence: number;
  suggestedSkillName: string | null;
}

// ============================================================================
// Intent Classification
// ============================================================================

const INTENT_CATEGORIES = [
  'meeting-prep',
  'meeting-followup',
  'deal-analysis',
  'deal-rescue',
  'pipeline-health',
  'contact-research',
  'email-draft',
  'follow-up',
  'task-management',
  'reporting',
  'forecasting',
  'relationship-health',
  'competitive-intel',
  'other'
] as const;

async function classifyIntent(
  query: string,
  skillKeys: string[]
): Promise<ClassifyIntentResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = `You are an intent classifier for a sales copilot. Your job is to:
1. Classify the user's query into one of these categories: ${INTENT_CATEGORIES.join(', ')}
2. Normalize the query to a canonical form (remove specific names, companies, dates)
3. Match against available skills if any fit

Available skill keys: ${skillKeys.length > 0 ? skillKeys.join(', ') : 'None provided'}

Return a JSON object with:
- intentCategory: one of the categories above
- normalizedQuery: a generic version of the query (e.g., "Prep me for my meeting with Acme" -> "Prep me for my meeting with [Company]")
- matchedSkillKey: the skill_key that best matches, or null if none
- matchConfidence: 0.0-1.0 confidence in the match
- suggestedSkillName: if no match, suggest a descriptive name for a skill that could handle this`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: INTENT_CLASSIFICATION_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Classify this query: "${query}"\n\nReturn only valid JSON.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in classification response');
  }

  return JSON.parse(jsonMatch[0]);
}

// ============================================================================
// Skill Generation
// ============================================================================

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  crm: 'Access to CRM data: contacts, companies, deals, activities',
  calendar: 'Access to calendar events and meetings',
  email: 'Ability to read and draft emails',
  transcript: 'Access to meeting transcripts and recordings',
  messaging: 'Ability to send Slack/Teams messages',
  task: 'Ability to create and manage tasks',
};

async function generateSkill(request: GenerateSkillRequest): Promise<GeneratedSkill> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const capabilityList = request.capabilities
    .map(cap => `- ${cap}: ${CAPABILITY_DESCRIPTIONS[cap] || 'Unknown capability'}`)
    .join('\n');

  const systemPrompt = `You are an expert at creating AI agent skills for a sales copilot platform.

A skill has these components:
1. **skill_key**: lowercase-kebab-case identifier (e.g., "deal-rescue-pack")
2. **name**: Human-readable name
3. **category**: One of: sales-ai, writing, enrichment, workflows, data-access, output-format, agent-sequence
4. **frontmatter**: JSON config with:
   - name, description, version (always 1)
   - requires_capabilities: array of capability keys needed
   - requires_context: array of context keys needed (e.g., ["contact", "deal"])
   - outputs: array of output keys this skill produces
   - triggers: array of when this runs (e.g., ["user_request", "before_meeting"])
   - priority: "low" | "medium" | "high" | "critical"
   - For sequences: sequence_steps array with order, action/skill_key, input_mapping, output_key, on_failure
5. **content_template**: Markdown prompt template with sections for Goal, Inputs, Output Contract, Rules

Available capabilities:
${capabilityList}

Example queries this skill should handle:
${request.exampleQueries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

IMPORTANT:
- Keep skill focused on a single responsibility
- Use ${request.type === 'sequence' ? 'sequence_steps' : 'direct skill execution'}
- Generate 2-3 test cases with expected behavior
- Provide clear rationale for your design choices`;

  const userPrompt = `Create a ${request.type} that fulfills this intent:

"${request.intent}"

Return a JSON object with:
- skillKey: the skill_key
- name: human-readable name
- category: "${request.category || (request.type === 'sequence' ? 'agent-sequence' : 'sales-ai')}"
- frontmatter: the full frontmatter object
- contentTemplate: the markdown content template
- testCases: array of {query, expectedBehavior}
- rationale: explanation of design choices

Return only valid JSON.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SKILL_GENERATION_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in generation response');
  }

  const generated = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!generated.skillKey || !generated.name || !generated.frontmatter || !generated.contentTemplate) {
    throw new Error('Generated skill missing required fields');
  }

  return generated;
}

// ============================================================================
// Skill Testing
// ============================================================================

interface TestSkillRequest {
  skillKey: string;
  frontmatter: Record<string, unknown>;
  contentTemplate: string;
  testQuery: string;
}

interface TestSkillResponse {
  success: boolean;
  response?: string;
  error?: string;
  executionTimeMs: number;
}

async function testSkill(request: TestSkillRequest): Promise<TestSkillResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const startTime = Date.now();

  try {
    const systemPrompt = `You are testing a sales copilot skill. Given the skill definition and a test query, simulate what the skill would output.

Skill Key: ${request.skillKey}
Skill Definition:
${request.contentTemplate}

Frontmatter: ${JSON.stringify(request.frontmatter, null, 2)}

Important: Generate a realistic response as if you had access to mock CRM data. Show what the output would look like in a real scenario.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: INTENT_CLASSIFICATION_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Test query: "${request.testQuery}"\n\nGenerate a realistic response as if this skill was executed with mock data.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    return {
      success: true,
      response: content,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Save Intent to Analytics (async background task)
// ============================================================================

async function saveQueryIntent(
  supabase: ReturnType<typeof createClient>,
  query: string,
  classification: ClassifyIntentResponse,
  wasSuccessful: boolean | null
): Promise<void> {
  try {
    await supabase.rpc('upsert_query_intent', {
      p_intent_category: classification.intentCategory,
      p_normalized_query: classification.normalizedQuery,
      p_original_query: query,
      p_matched_skill_key: classification.matchedSkillKey,
      p_skill_match_confidence: classification.matchConfidence,
      p_was_successful: wasSuccessful,
    });
    console.log(`[skill-builder] Saved intent: ${classification.intentCategory}`);
  } catch (error) {
    console.error('[skill-builder] Failed to save intent:', error);
    // Don't throw - this is a background operation
  }
}

// ============================================================================
// Router
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (path) {
      case 'generate': {
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body: GenerateSkillRequest = await req.json();

        if (!body.intent || !body.capabilities || !body.type) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: intent, capabilities, type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[skill-builder] Generating ${body.type} for intent: ${body.intent}`);
        const skill = await generateSkill(body);

        return new Response(
          JSON.stringify(skill),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'classify': {
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body: ClassifyIntentRequest = await req.json();

        if (!body.query) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: query' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get available skill keys
        const { data: skills } = await supabase
          .from('platform_skills')
          .select('skill_key')
          .eq('is_active', true);

        const skillKeys = skills?.map(s => s.skill_key) || [];

        console.log(`[skill-builder] Classifying query: ${body.query.substring(0, 50)}...`);
        const classification = await classifyIntent(body.query, body.skillKeys || skillKeys);

        // Save to analytics in background (don't wait)
        saveQueryIntent(supabase, body.query, classification, null).catch(console.error);

        return new Response(
          JSON.stringify(classification),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'test': {
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body: TestSkillRequest = await req.json();

        if (!body.skillKey || !body.contentTemplate || !body.testQuery) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: skillKey, contentTemplate, testQuery' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[skill-builder] Testing skill: ${body.skillKey}`);
        const result = await testSkill(body);

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'coverage': {
        if (req.method !== 'GET') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const days = parseInt(url.searchParams.get('days') || '30');

        const { data, error } = await supabase.rpc('get_query_coverage_stats', {
          p_days: days,
        });

        if (error) throw error;

        return new Response(
          JSON.stringify(data?.[0] || {}),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'gaps': {
        if (req.method !== 'GET') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const limit = parseInt(url.searchParams.get('limit') || '10');
        const days = parseInt(url.searchParams.get('days') || '30');

        const { data, error } = await supabase.rpc('get_trending_query_gaps', {
          p_limit: limit,
          p_days: days,
        });

        if (error) throw error;

        return new Response(
          JSON.stringify(data || []),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({
            error: 'Not found',
            availableEndpoints: ['/generate', '/classify', '/test', '/coverage', '/gaps'],
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[skill-builder] Error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
