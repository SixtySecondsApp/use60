/**
 * Agent Intent Classifier
 *
 * Classifies user messages to determine which specialist agent(s) should handle
 * them, and what delegation strategy to use.
 *
 * Uses a two-pass approach:
 *   1. Keyword pre-filter (fast, no API call)
 *   2. Claude classification (only when keywords are ambiguous)
 */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import type {
  AgentName,
  AgentTeamConfig,
  DelegationStrategy,
  IntentClassification,
} from './agentConfig.ts';
import { isAgentEnabled } from './agentConfig.ts';

// =============================================================================
// Agent Domain Definitions
// =============================================================================

interface AgentDomain {
  name: AgentName;
  displayName: string;
  actions: string[];
  skillCategories: string[];
  keywords: string[];
}

export const AGENT_DOMAINS: AgentDomain[] = [
  {
    name: 'pipeline',
    displayName: 'Pipeline Manager',
    actions: [
      'get_deal', 'get_pipeline_summary', 'get_pipeline_deals',
      'get_pipeline_forecast', 'get_contacts_needing_attention',
      'get_company_status', 'create_task', 'list_tasks',
    ],
    skillCategories: ['sales-ai'],
    keywords: [
      'pipeline', 'forecast', 'revenue', 'quota',
      'closing', 'close', 'opportunity', 'opportunities',
      'win', 'loss', 'stale', 'at risk', 'risk', 'health',
      'pipeline review', 'deal review', 'needs attention',
      'deal health', 'weighted pipeline', 'win rate',
    ],
  },
  {
    name: 'outreach',
    displayName: 'Outreach & Follow-up',
    actions: [
      'search_emails', 'draft_email', 'send_notification',
      'get_contact', 'get_meetings',
    ],
    skillCategories: ['writing'],
    keywords: [
      'email', 'draft', 'write', 'follow up', 'follow-up', 'followup',
      'reach out', 'message', 'outreach', 'sequence', 'send',
      'reply', 'respond', 'slack', 'notification', 'notify',
      'thank', 'introduce', 'introduction', 'proposal',
    ],
  },
  {
    name: 'research',
    displayName: 'Research & Enrichment',
    actions: [
      'enrich_contact', 'enrich_company', 'get_lead',
      'get_contact', 'get_company_status',
    ],
    skillCategories: ['enrichment'],
    keywords: [
      'research', 'enrich', 'enrichment', 'look up', 'lookup',
      'find out', 'who is', 'what do we know', 'background',
      'company info', 'intel', 'intelligence', 'icp', 'fit',
      'linkedin', 'profile',
      'lead score', 'qualification', 'qualify',
    ],
  },
  {
    name: 'crm_ops',
    displayName: 'CRM Operations',
    actions: [
      'update_crm', 'create_task', 'list_tasks', 'create_activity',
      'get_contact', 'get_lead', 'get_deal', 'get_company_status',
    ],
    skillCategories: ['sales-ai'],
    keywords: [
      'update', 'change', 'edit', 'modify', 'set',
      'log', 'record', 'add note', 'add a note', 'log a call',
      'create task', 'assign', 'move deal', 'change stage',
      'move to', 'mark as', 'tag', 'clean up', 'data hygiene',
      'update crm', 'update contact', 'update deal',
      'task', 'tasks', 'to do', 'todo', 'action items',
    ],
  },
  {
    name: 'meetings',
    displayName: 'Meeting Intelligence',
    actions: [
      'get_meetings', 'get_next_meeting', 'get_meetings_for_period',
      'get_meeting_count', 'get_time_breakdown', 'get_booking_stats',
      'get_contact', 'get_deal',
    ],
    skillCategories: ['data-access'],
    keywords: [
      'meeting', 'meetings', 'calendar', 'schedule',
      'next call', 'next meeting', 'upcoming meeting',
      'meeting prep', 'prep for', 'prepare for',
      'briefing', 'brief me', 'brief for',
      'this week', 'today', 'tomorrow',
      'time breakdown', 'how much time', 'booking stats',
      'meeting count', 'how many meetings',
    ],
  },
  {
    name: 'prospecting',
    displayName: 'Prospecting',
    actions: [
      'search_leads_create_table', 'enrich_table_column',
      'enrich_contact', 'enrich_company', 'get_lead',
      'get_contact', 'get_company_status',
    ],
    skillCategories: ['enrichment'],
    keywords: [
      'prospect', 'prospecting', 'find leads', 'build a list',
      'build list', 'lead list', 'search companies', 'search people',
      'lookalike', 'similar companies', 'find companies',
      'scrape', 'apify', 'apollo', 'ai ark',
      'outbound list', 'target accounts', 'target list',
      'new leads', 'find new', 'source leads',
    ],
  },
];

// =============================================================================
// Keyword Pre-Filter
// =============================================================================

interface KeywordMatch {
  agent: AgentName;
  score: number;
  matchedKeywords: string[];
}

function keywordPreFilter(message: string): KeywordMatch[] {
  const lower = message.toLowerCase();
  const matches: KeywordMatch[] = [];

  for (const domain of AGENT_DOMAINS) {
    let score = 0;
    const matched: string[] = [];

    for (const keyword of domain.keywords) {
      if (lower.includes(keyword)) {
        // Multi-word keywords get more weight
        const weight = keyword.includes(' ') ? 2 : 1;
        score += weight;
        matched.push(keyword);
      }
    }

    if (score > 0) {
      matches.push({ agent: domain.name, score, matchedKeywords: matched });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

// =============================================================================
// Claude Classification (for ambiguous cases)
// =============================================================================

const CLASSIFICATION_PROMPT = `You are an intent classifier for a sales AI with 6 specialist agents:

1. **pipeline** — Pipeline Manager: deal analysis, forecasting, pipeline review, revenue tracking, deal health
2. **outreach** — Outreach & Follow-up: emails, messages, follow-ups, communication drafting
3. **research** — Research & Enrichment: contact/company research, enrichment, lead qualification
4. **crm_ops** — CRM Operations: updating records, logging activities, creating tasks, data hygiene
5. **meetings** — Meeting Intelligence: meeting prep, calendar analysis, time breakdowns, scheduling
6. **prospecting** — Prospecting: finding new leads, building lists, lookalike search, outbound list building

Classify the user's message. Respond with ONLY a JSON object:
{
  "agents": ["agent_name"],
  "strategy": "single" | "parallel" | "sequential",
  "reasoning": "brief reason",
  "confidence": 0.0-1.0
}

Rules:
- Most messages need only ONE agent (strategy: "single")
- Use "parallel" when 2+ agents can work independently (e.g., "research this company and draft an email")
- Use "sequential" when one agent's output feeds another (e.g., "find the deal, then write a follow-up")
- Only include agents that are truly needed
- High confidence (0.8+) for clear intent, lower for ambiguous
- **pipeline** = analysis/insights about deals; **crm_ops** = writing/updating CRM data
- **research** = enriching known contacts; **prospecting** = finding new leads
- **outreach** = drafting emails; **meetings** = calendar and meeting prep`;

async function classifyWithClaude(
  message: string,
  anthropic: Anthropic,
  model: string,
  enabledAgents: AgentName[]
): Promise<IntentClassification | null> {
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 200,
      system: CLASSIFICATION_PROMPT + `\n\nEnabled agents: ${enabledAgents.join(', ')}`,
      messages: [{ role: 'user', content: message }],
    });

    const text = response.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') return null;

    // Parse JSON from response
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      agents: string[];
      strategy: string;
      reasoning: string;
      confidence: number;
    };

    // Filter to only enabled agents
    const validAgents = parsed.agents.filter(
      (a) => enabledAgents.includes(a as AgentName)
    ) as AgentName[];

    if (validAgents.length === 0) return null;

    return {
      agents: validAgents,
      strategy: (['single', 'parallel', 'sequential'].includes(parsed.strategy)
        ? parsed.strategy
        : 'single') as DelegationStrategy,
      reasoning: parsed.reasoning || '',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    };
  } catch (err) {
    console.error('[agentClassifier] Claude classification error:', err);
    return null;
  }
}

// =============================================================================
// Main Classifier
// =============================================================================

/**
 * Classify user intent to determine agent delegation.
 *
 * Returns null when classification fails or isn't needed (single-agent fallback).
 */
export async function classifyIntent(
  message: string,
  config: AgentTeamConfig,
  anthropic: Anthropic
): Promise<IntentClassification | null> {
  // Get enabled agents
  const enabledAgents = config.enabled_agents.filter(
    (a) => AGENT_DOMAINS.some((d) => d.name === a)
  ) as AgentName[];

  if (enabledAgents.length === 0) return null;

  // Step 1: Keyword pre-filter
  const keywordMatches = keywordPreFilter(message);

  // No keywords matched — use Claude for classification
  if (keywordMatches.length === 0) {
    return await classifyWithClaude(
      message, anthropic, config.orchestrator_model, enabledAgents
    );
  }

  // Only one agent matched with high confidence — skip Claude call
  if (
    keywordMatches.length === 1 &&
    keywordMatches[0].score >= 3 &&
    isAgentEnabled(config, keywordMatches[0].agent)
  ) {
    return {
      agents: [keywordMatches[0].agent],
      strategy: 'single',
      reasoning: `Keyword match: ${keywordMatches[0].matchedKeywords.join(', ')}`,
      confidence: Math.min(0.95, 0.6 + keywordMatches[0].score * 0.05),
    };
  }

  // Multiple agents matched or low confidence — use Claude for disambiguation
  if (keywordMatches.length > 1 || keywordMatches[0].score < 3) {
    return await classifyWithClaude(
      message, anthropic, config.orchestrator_model, enabledAgents
    );
  }

  // Single match with moderate confidence
  const topMatch = keywordMatches[0];
  if (isAgentEnabled(config, topMatch.agent)) {
    return {
      agents: [topMatch.agent],
      strategy: 'single',
      reasoning: `Keyword match: ${topMatch.matchedKeywords.join(', ')}`,
      confidence: 0.7,
    };
  }

  return null;
}
