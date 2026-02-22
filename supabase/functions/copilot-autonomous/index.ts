/// <reference path="../deno.d.ts" />

/**
 * Autonomous Copilot Edge Function
 *
 * Enables Claude to autonomously decide which skills to use via native tool use.
 * Uses the same 4-tool architecture as api-copilot:
 *   1. list_skills   - Discover available skills/sequences
 *   2. get_skill      - Retrieve a compiled skill document
 *   3. execute_action - Execute CRM actions with real data (deals, contacts, meetings, etc.)
 *   4. resolve_entity - Resolve ambiguous person references (first-name-only)
 *
 * POST /copilot-autonomous
 * {
 *   message: string,
 *   organizationId?: string,
 *   context?: Record<string, unknown>
 * }
 *
 * Response (streaming):
 * - event: message - Text response chunks
 * - event: tool_start - Tool execution started
 * - event: tool_result - Tool execution completed
 * - event: done - Execution complete
 * - event: error - Error occurred
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  rateLimitMiddleware,
  RATE_LIMIT_CONFIGS,
} from '../_shared/rateLimiter.ts';
import { logAICostEvent, checkAgentBudget, checkCreditBalance } from '../_shared/costTracking.ts';
import { executeAction } from '../_shared/copilot_adapters/executeAction.ts';
import type { ExecuteActionName } from '../_shared/copilot_adapters/types.ts';
import { resolveEntity } from '../_shared/resolveEntityAdapter.ts';
import { searchCrmContacts, searchCrmCompanies } from '../_shared/copilot_adapters/crmIndexAdapter.ts';
import {
  handleListSkills,
  handleGetSkill,
  resolveOrgId,
} from '../_shared/skillsToolHandlers.ts';
import {
  detectAndStructureResponse,
  type StructuredResponse,
  type ToolExecutionDetail,
} from '../_shared/structuredResponseDetector.ts';
// Multi-agent orchestration imports
import { loadAgentTeamConfig, type AgentTeamConfig, type IntentClassification } from '../_shared/agentConfig.ts';
import { classifyIntent } from '../_shared/agentClassifier.ts';
import { runSpecialist, type StreamWriter } from '../_shared/agentSpecialist.ts';
import { getSpecialistConfig, getAgentDisplayInfo } from '../_shared/agentDefinitions.ts';

// =============================================================================
// Configuration
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5';
const MAX_ITERATIONS = 15;
const MAX_TOKENS = 4096;

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  message: string;
  organizationId?: string;
  context?: Record<string, unknown>;
  stream?: boolean;
  fact_profile_id?: string;
  product_profile_id?: string;
}

// =============================================================================
// 4-Tool Architecture (matches api-copilot)
// =============================================================================

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // 1. resolve_entity - MUST BE FIRST for first-name-only references
  {
    name: 'resolve_entity',
    description: `Resolve a person mentioned by first name (or partial name) to a specific contact by searching CRM contacts, recent meetings, and calendar events in parallel. Use this FIRST when the user mentions someone by name without full context.

WHEN TO USE:
- User asks about "Stan" or "John" without providing email or ID
- User references someone from a recent meeting
- Any ambiguous person reference that needs resolution

RETURNS ranked candidates by recency. If ONE clear match, proceed. If MULTIPLE, ask user to confirm.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'First name or partial name to search for (e.g., "Stan", "John Smith")',
        },
        context_hint: {
          type: 'string',
          description: 'Optional context from user message to help disambiguate (e.g., "meeting yesterday", "deal")',
        },
      },
      required: ['name'],
    },
  },
  // 2. list_skills
  {
    name: 'list_skills',
    description: 'List available compiled skills for the organization (optionally filtered by category).',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: {
          type: 'string',
          enum: ['skill', 'sequence', 'all'],
          description: 'Filter to skills (single-step) vs sequences (category=agent-sequence). Default: all.',
        },
        category: {
          type: 'string',
          enum: ['sales-ai', 'writing', 'enrichment', 'workflows', 'data-access', 'output-format', 'agent-sequence'],
          description: 'Optional skill category filter.',
        },
        enabled_only: {
          type: 'boolean',
          description: 'Only return enabled skills (default true).',
        },
      },
    },
  },
  // 3. get_skill
  {
    name: 'get_skill',
    description: 'Retrieve a compiled skill or sequence document by skill_key for the organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_key: { type: 'string', description: 'Skill identifier (e.g., lead-qualification, get-contact-context)' },
      },
      required: ['skill_key'],
    },
  },
  // 4. execute_action - Core CRM data access
  {
    name: 'execute_action',
    description: `Execute an action to fetch real CRM data, meetings, emails, pipeline intelligence, or perform operations.

If you only have a FIRST NAME (e.g., "Stan", "John"), use the resolve_entity tool instead!

ACTION PARAMETERS:

## Contact & Lead Lookup
- get_contact: { email?, full_name?, id? } - Search contacts by email, full name, or id
- get_lead: { email?, full_name?, contact_id?, date_from?, date_to?, date_field? } - Get lead/prospect data with enrichment

## Deal & Pipeline
- get_deal: { name?, id?, close_date_from?, close_date_to?, status?, stage_id?, limit? } - Search deals (health scores always included)
- get_pipeline_summary: {} - Get aggregated pipeline metrics
- get_pipeline_deals: { filter?, days?, period?, limit? } - Get filtered deal list with health scores (filter: "closing_soon"|"at_risk"|"stale"|"needs_attention")
- get_pipeline_forecast: { period? } - Get quarterly forecast

## Contacts & Relationships
- get_contacts_needing_attention: { days_since_contact?, filter?, limit? } - Get contacts without recent follow-up
- get_company_status: { company_id?, company_name?, domain? } - Holistic company view

## Meetings & Calendar
- get_meetings: { contactEmail?, contactId?, limit? } - Get meetings with a contact
- get_meeting_count: { period?, timezone?, week_starts_on? } - Count meetings for a period
- get_next_meeting: { include_context?, timezone? } - Get next upcoming meeting with CRM context
- get_meetings_for_period: { period?, timezone?, week_starts_on?, include_context?, limit? } - Get meeting list for a period
- get_time_breakdown: { period?, timezone?, week_starts_on? } - Time analysis
- get_booking_stats: { period?, filter_by?, source?, org_wide? } - Meeting booking statistics

## Tasks & Activities
- create_task: { title, description?, due_date?, contact_id?, deal_id?, priority?, assignee_id? } - Create a task (requires params.confirm=true)
- list_tasks: { status?, priority?, contact_id?, deal_id?, company_id?, due_before?, due_after?, limit? } - List tasks
- create_activity: { type, client_name, details?, amount?, date?, status?, priority? } - Create an activity (requires params.confirm=true)

## Email & Notifications
- search_emails: { contact_email?, query?, limit? } - Search emails
- draft_email: { to, subject?, context?, tone? } - Draft an email
- send_notification: { channel: 'slack', message, blocks? } - Send a Slack notification

## CRM Updates
- update_crm: { entity, id, updates, confirm: true } - Update CRM record

## Enrichment
- enrich_contact: { email, name?, title?, company_name? } - Enrich contact data
- enrich_company: { name, domain?, website? } - Enrich company data

## Skill Execution
- run_skill: { skill_key, skill_context? } - Execute an AI skill
- run_sequence: { sequence_key, sequence_context?, is_simulation? } - Execute a multi-step sequence

## Ops Tables
- list_ops_tables: { limit?, source_type? } - List ops tables in the org
- get_ops_table: { table_id } - Get table details with columns
- create_ops_table: { name, description?, columns? } - Create a new ops table (requires confirm=true)
- delete_ops_table: { table_id } - Delete an ops table (requires confirm=true)
- add_ops_column: { table_id, name, column_type, config? } - Add column to ops table
- get_ops_table_data: { table_id, limit?, offset? } - Get table rows and cell data
- add_ops_rows: { table_id, rows } - Add rows to ops table (requires confirm=true)
- update_ops_cell: { row_id, column_id, value } - Update a cell value
- ai_query_ops_table: { table_id, query } - Ask AI questions about table data
- ai_transform_ops_column: { table_id, column_id, prompt, row_ids? } - AI-transform column values (requires confirm=true)
- get_enrichment_status: { table_id, column_id? } - Get enrichment job status
- create_ops_rule: { table_id, name, trigger_type, condition, action_type, action_config } - Create automation rule (requires confirm=true)
- list_ops_rules: { table_id } - List automation rules for a table
- sync_ops_hubspot: { table_id, list_id?, field_mapping? } - Sync table with HubSpot (requires confirm=true)
- sync_ops_attio: { table_id, list_id?, field_mapping? } - Sync table with Attio (requires confirm=true)
- push_ops_to_instantly: { table_id, campaign_id?, row_ids? } - Push rows to Instantly campaign (requires confirm=true)
- get_ops_insights: { table_id, insight_type? } - Get AI-generated table insights

## Standard Tables (Auto-provisioned CRM Data)
- list_standard_tables: {} - List available standard tables (Leads, Meetings, All Contacts, All Companies)
- query_standard_table: { table_name, filters?, sort_by?, sort_direction?, limit? } - Query data from standard ops tables. table_name must be one of: "Leads", "Meetings", "All Contacts", "All Companies". Use for user queries like "show me my leads", "list contacts", "recent meetings".

## CRM Index Search (Fast search before materialization)
- search_crm_contacts: { query?, email?, name?, company?, job_title?, lifecycle_stage?, has_active_deal?, limit? } - Fast search across CRM contact index (HubSpot/Attio contacts). Use for finding contacts without materializing full records. Returns: crm_source, crm_record_id, email, first_name, last_name, full_name, company_name, company_domain, job_title, lifecycle_stage, is_materialized, materialized_contact_id.
- search_crm_companies: { query?, name?, domain?, industry?, limit? } - Fast search across CRM company index. Returns: crm_source, crm_record_id, name, domain, industry, employee_count, annual_revenue, city, state, country, is_materialized.
- search_crm_deals: { query?, stage?, pipeline?, min_amount?, limit? } - Fast search across CRM deal index. Returns: crm_source, crm_record_id, name, stage, pipeline, amount, close_date, owner_crm_id, company_crm_id, contact_crm_ids, is_materialized.
- materialize_contact: { crm_source: "hubspot"|"attio", crm_record_id } - Pull full contact from CRM API and create in contacts table. Updates index with materialized_contact_id. Use after search_crm_contacts to get full record.

## Lead Search & Prospecting (NO confirmation needed — execute immediately)
- search_leads_create_table: { query, person_titles?, person_locations?, organization_num_employees_ranges?, person_seniorities?, per_page?, source? } - Search for leads and create an ops table with results. query is a plain-English description of the search (e.g. "marketing agencies in Bristol"). source defaults to "apollo". Does NOT require confirm=true.
- enrich_table_column: { table_id, column_id, row_ids? } - Enrich a column in an ops table. Does NOT require confirm=true.

## Meeting Intelligence
- meeting_intelligence_query: { question, transcriptId?, maxMeetings? } - RAG search across meeting transcripts. Returns AI-synthesized answer with source citations.
- meeting_analytics_dashboard: {} - Get aggregated meeting metrics (total meetings, avg sentiment, talk time stats)
- meeting_analytics_talk_time: { limit? } - Get talk time analytics per speaker across meetings
- meeting_analytics_sentiment_trends: { days? } - Get sentiment trend data over time
- meeting_analytics_insights: { transcriptId } - Get detailed insights for a specific transcript (topics, sentiment, action items, key moments)

Write actions (create_task, create_ops_table, update_crm, etc.) require params.confirm=true. search_leads_create_table and enrich_table_column do NOT require confirmation.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_contact',
            'get_lead',
            'get_deal',
            'get_pipeline_summary',
            'get_pipeline_deals',
            'get_pipeline_forecast',
            'get_contacts_needing_attention',
            'get_company_status',
            'get_meetings',
            'get_booking_stats',
            'get_meeting_count',
            'get_next_meeting',
            'get_meetings_for_period',
            'get_time_breakdown',
            'search_emails',
            'draft_email',
            'update_crm',
            'send_notification',
            'enrich_contact',
            'enrich_company',
            'invoke_skill',
            'run_skill',
            'run_sequence',
            'create_task',
            'list_tasks',
            'create_activity',
            'list_ops_tables',
            'get_ops_table',
            'create_ops_table',
            'delete_ops_table',
            'add_ops_column',
            'get_ops_table_data',
            'add_ops_rows',
            'update_ops_cell',
            'ai_query_ops_table',
            'ai_transform_ops_column',
            'get_enrichment_status',
            'create_ops_rule',
            'list_ops_rules',
            'sync_ops_hubspot',
            'sync_ops_attio',
            'push_ops_to_instantly',
            'get_ops_insights',
            'search_leads_create_table',
            'enrich_table_column',
            'list_standard_tables',
            'query_standard_table',
            'search_crm_contacts',
            'search_crm_companies',
            'search_crm_deals',
            'materialize_contact',
            'meeting_intelligence_query',
            'meeting_analytics_dashboard',
            'meeting_analytics_talk_time',
            'meeting_analytics_sentiment_trends',
            'meeting_analytics_insights',
          ],
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
  // 5. gemini_research - Web research with Gemini 3 Flash + Google Search grounding
  {
    name: 'gemini_research',
    description: `Execute web research using Gemini 3 Flash with Google Search grounding. Use this for finding current, accurate information from the web (company data, funding, news, leadership, etc.).

WHEN TO USE:
- Researching company information (funding, leadership, products, competitors)
- Finding recent news, announcements, or milestones
- Gathering market intelligence or industry data
- Any query that requires current web search

The tool returns structured data with sources.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The research query. Be specific about what information you need (e.g., "Research Stripe company: leadership team with names, titles, and backgrounds" or "Find Anthropic funding history: rounds, amounts, dates, investors")',
        },
        response_schema: {
          type: 'object',
          description: 'Optional JSON schema for the expected response structure. Helps ensure consistent data format.',
        },
      },
      required: ['query'],
    },
  },
  // 6. search_leads - Dedicated lead search tool (first-class, NOT nested in execute_action)
  {
    name: 'search_leads',
    description: `Search for leads/companies and create an ops table with results. This is an all-in-one tool: it searches the database, creates an ops table, and populates it with results automatically. No confirmation needed.

USE THIS TOOL when the user asks to:
- Find companies or people (e.g., "Find marketing agencies in Bristol")
- Search for leads or prospects
- Build a list of companies or contacts
- Prospect for new business

The tool returns the created table with ID and results. Present the table link to the user.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Plain-English description of what to search for (e.g., "accounting firms in Bristol with 50 employees")',
        },
        person_titles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Job titles to search for (e.g., ["Partner", "Director", "CEO"])',
        },
        person_locations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Locations to search (e.g., ["Bristol, United Kingdom"])',
        },
        organization_num_employees_ranges: {
          type: 'array',
          items: { type: 'string' },
          description: 'Employee count ranges (e.g., ["1,50", "51,200", "201,500"])',
        },
        person_seniorities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Seniority levels (e.g., ["senior", "manager", "director", "vp", "c_suite"])',
        },
        per_page: {
          type: 'number',
          description: 'Number of results to return (default 25, max 100)',
        },
        q_organization_keyword_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to match against company descriptions (e.g., ["accounting", "audit", "tax"])',
        },
      },
      required: ['query'],
    },
  },
  // 7. search_crm_index - Search lightweight CRM index before materialization
  {
    name: 'search_crm_index',
    description: `Search the lightweight CRM index for contacts or companies from HubSpot/Attio without materializing full records. Use this for fast CRM searches before deciding whether to materialize.

USE THIS TOOL when the user asks to:
- Find CRM contacts or companies by name, email, title, or company
- Search for contacts with specific lifecycle stages or deal associations
- Look up CRM data without needing full materialization

The tool returns lightweight index records with basic fields and materialization status.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        search_type: {
          type: 'string',
          enum: ['contacts', 'companies'],
          description: 'Whether to search contacts or companies',
        },
        query: {
          type: 'string',
          description: 'Full-text search query across relevant fields (name, email, company, title for contacts; name, domain, industry for companies)',
        },
        email: {
          type: 'string',
          description: 'Exact email lookup (contacts only)',
        },
        name: {
          type: 'string',
          description: 'Name search - first/last name for contacts, company name for companies',
        },
        company: {
          type: 'string',
          description: 'Company name filter (contacts only)',
        },
        job_title: {
          type: 'string',
          description: 'Job title filter (contacts only)',
        },
        lifecycle_stage: {
          type: 'string',
          description: 'Lifecycle stage filter (contacts only)',
        },
        has_active_deal: {
          type: 'boolean',
          description: 'Filter by whether contact has an active deal (contacts only)',
        },
        domain: {
          type: 'string',
          description: 'Domain filter (companies only)',
        },
        industry: {
          type: 'string',
          description: 'Industry filter (companies only)',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default 25, max 100)',
        },
      },
      required: ['search_type'],
    },
  },
  // 8. materialize_contact - Pull full CRM record into local contacts table
  {
    name: 'materialize_contact',
    description: `Materialize a CRM contact from the index into the full contacts table. This pulls the complete record from HubSpot/Attio and creates a local contact record.

USE THIS TOOL when:
- User wants to work with a specific contact found in search results
- User needs full contact details beyond the index fields
- User wants to associate the contact with local deals/tasks/meetings

For now, this is a placeholder - materialization will be implemented in Phase 3.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        index_record_id: {
          type: 'string',
          description: 'The UUID from crm_contact_index to materialize',
        },
      },
      required: ['index_record_id'],
    },
  },
  // 9. search_documentation - Search platform documentation
  {
    name: 'search_documentation',
    description: `Search the platform documentation to answer user questions about features, setup, integrations, and how-to guides.

WHEN TO USE:
- User asks "how do I..." or "how to..." about platform features
- User asks about setup, configuration, or integrations
- User asks "what is..." about platform concepts
- User needs help or guidance with any platform feature
- User asks about billing, security, or admin settings

Returns relevant documentation articles with content snippets. Use the results to provide a helpful, synthesized answer to the user.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query - the user\'s question or topic to search for',
        },
        category: {
          type: 'string',
          enum: ['Getting Started', 'Pipeline', 'Meetings', 'Contacts & Companies', 'Tasks', 'Integrations', 'AI Copilot', 'Admin & Settings', 'Credits & Billing', 'Security & Compliance'],
          description: 'Optional category filter to narrow search results',
        },
        limit: {
          type: 'number',
          description: 'Max number of articles to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  // 10. query_credit_usage - User credit usage statistics
  {
    name: 'query_credit_usage',
    description: 'Query the user\'s credit usage statistics. Use when the user asks about: how many credits they used today/this week/this month, their biggest credit expense, how long their credits will last, their burn rate, or which actions/meetings cost the most credits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query_type: {
          type: 'string',
          enum: ['today', 'this_week', 'last_30_days', 'by_category', 'burn_rate', 'top_actions'],
          description: 'Type of usage query to run',
        },
        filters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category: ai_actions, agents, integrations, enrichment, storage',
            },
          },
        },
      },
      required: ['query_type'],
    },
  },
  // 11. search_meeting_context - Proactive meeting context enrichment
  {
    name: 'search_meeting_context',
    description: `Search for relevant meeting context when discussing deals, contacts, or companies. Call this PROACTIVELY when:
- User asks about a deal and you want to include recent meeting context
- User discusses a contact and you want to surface what was discussed
- User mentions a company and you want to find relevant meeting intelligence

This returns a lightweight summary of relevant meetings — use it to enrich your responses with meeting intelligence.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "recent discussions about pricing with Acme Corp")',
        },
        contactName: {
          type: 'string',
          description: 'Optional: filter by contact name mentioned in meetings',
        },
        companyName: {
          type: 'string',
          description: 'Optional: filter by company name mentioned in meetings',
        },
        maxResults: {
          type: 'number',
          description: 'Max meetings to analyze (default: 5)',
        },
      },
      required: ['query'],
    },
  },
];

// =============================================================================
// Tool Execution Router
// =============================================================================

/**
 * Route tool calls to the appropriate shared handler.
 * Uses real Supabase queries -- no more LLM hallucination for CRM data.
 */
async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  client: ReturnType<typeof createClient>,
  userId: string,
  orgId: string | null,
  userAuthToken?: string,
  contextTimezone?: string
): Promise<unknown> {
  // Resolve org for skills/execute_action tools
  const resolvedOrgId = await resolveOrgId(client, userId, orgId);

  switch (toolName) {
    case 'resolve_entity': {
      return await resolveEntity(client, userId, resolvedOrgId, {
        name: input.name ? String(input.name) : undefined,
        context_hint: input.context_hint ? String(input.context_hint) : undefined,
      });
    }

    case 'list_skills': {
      return await handleListSkills(client, resolvedOrgId, {
        kind: input.kind ? String(input.kind) : undefined,
        category: input.category ? String(input.category) : undefined,
        enabled_only: input.enabled_only !== false,
      });
    }

    case 'get_skill': {
      const skillKey = input.skill_key ? String(input.skill_key) : '';
      return await handleGetSkill(client, resolvedOrgId, skillKey);
    }

    case 'execute_action': {
      const action = input.action as ExecuteActionName;
      const params = (input.params || {}) as Record<string, unknown>;
      // Auto-inject user timezone for period-based actions when the LLM omitted it
      const periodActions = ['get_meetings_for_period', 'get_meeting_count', 'get_time_breakdown', 'get_booking_stats'];
      if (contextTimezone && periodActions.includes(action) && !params.timezone) {
        params.timezone = contextTimezone;
      }
      console.log(`[executeToolCall] execute_action called: action=${action}, hasUserAuthToken=${!!userAuthToken}, params keys: ${Object.keys(params).join(', ')}`);
      if (!action) {
        return { success: false, data: null, error: 'action is required for execute_action' };
      }
      return await executeAction(client, userId, resolvedOrgId, action, params, { userAuthToken });
    }

    case 'gemini_research': {
      const query = input.query ? String(input.query) : '';
      const responseSchema = input.response_schema || undefined;

      if (!query) {
        return { success: false, error: 'query is required for gemini_research' };
      }

      try {
        // Call gemini-research edge function
        const { data, error } = await client.functions.invoke('gemini-research', {
          body: { query, responseSchema }
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return {
          success: true,
          data: data.result,
          sources: data.sources,
          metadata: data.metadata
        };
      } catch (error: any) {
        return { success: false, error: error.message || 'gemini_research failed' };
      }
    }

    case 'search_leads': {
      // Dedicated lead search tool — routes to search_leads_create_table in executeAction
      const { query, ...searchParams } = input;
      const params = {
        query: query ? String(query) : 'Lead search',
        ...searchParams,
      };
      console.log(`[executeToolCall] search_leads called directly. query=${params.query}, params keys: ${Object.keys(params).join(', ')}`);
      return await executeAction(client, userId, resolvedOrgId, 'search_leads_create_table' as ExecuteActionName, params, { userAuthToken });
    }

    case 'search_crm_index': {
      if (!resolvedOrgId) {
        return { success: false, error: 'Organization ID is required for CRM index search' };
      }

      const searchType = input.search_type ? String(input.search_type) : 'contacts';

      if (searchType === 'contacts') {
        const params = {
          query: input.query ? String(input.query) : undefined,
          email: input.email ? String(input.email) : undefined,
          name: input.name ? String(input.name) : undefined,
          company: input.company ? String(input.company) : undefined,
          jobTitle: input.job_title ? String(input.job_title) : undefined,
          lifecycleStage: input.lifecycle_stage ? String(input.lifecycle_stage) : undefined,
          hasActiveDeal: input.has_active_deal !== undefined ? Boolean(input.has_active_deal) : undefined,
          limit: input.limit ? Number(input.limit) : undefined,
        };
        return await searchCrmContacts(client, resolvedOrgId, params);
      } else if (searchType === 'companies') {
        const params = {
          query: input.query ? String(input.query) : undefined,
          name: input.name ? String(input.name) : undefined,
          domain: input.domain ? String(input.domain) : undefined,
          industry: input.industry ? String(input.industry) : undefined,
          limit: input.limit ? Number(input.limit) : undefined,
        };
        return await searchCrmCompanies(client, resolvedOrgId, params);
      } else {
        return { success: false, error: `Invalid search_type: ${searchType}. Must be 'contacts' or 'companies'` };
      }
    }

    case 'materialize_contact': {
      const crmSource = input.crm_source ? String(input.crm_source) : '';
      const crmRecordId = input.crm_record_id ? String(input.crm_record_id) : '';

      if (!crmSource || !crmRecordId) {
        return { success: false, error: 'crm_source and crm_record_id are required for materialize_contact' };
      }

      if (!resolvedOrgId) {
        return { success: false, error: 'Organization ID is required for materialization' };
      }

      // Fetch the index record first
      const { data: indexRecord, error: indexError } = await client
        .from('crm_contact_index')
        .select('*')
        .eq('org_id', resolvedOrgId)
        .eq('crm_source', crmSource)
        .eq('crm_record_id', crmRecordId)
        .maybeSingle();

      if (indexError || !indexRecord) {
        return {
          success: false,
          error: `Contact not found in CRM index: ${crmSource}/${crmRecordId}`,
        };
      }

      // Import and call materialization service
      const { materializeContact } = await import('../_shared/materializationService.ts');
      const result = await materializeContact(client, resolvedOrgId, indexRecord);

      return result;
    }

    case 'search_documentation': {
      const query = input.query ? String(input.query) : '';
      const category = input.category ? String(input.category) : undefined;
      const limit = input.limit ? Number(input.limit) : 5;

      if (!query) {
        return { success: false, error: 'query is required for search_documentation' };
      }

      try {
        // Generate embedding for the query
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
          // Fallback to text search if no OpenAI key
          let textQuery = client
            .from('docs_articles')
            .select('id, slug, title, category, content')
            .eq('published', true)
            .textSearch('content', query, { type: 'websearch', config: 'english' })
            .limit(limit);

          if (category) {
            textQuery = textQuery.eq('category', category);
          }

          const { data, error } = await textQuery;
          if (error) return { success: false, error: error.message };

          return {
            success: true,
            articles: (data || []).map((a: any) => ({
              slug: a.slug,
              title: a.title,
              category: a.category,
              content_snippet: a.content?.slice(0, 500) || '',
            })),
          };
        }

        // Generate query embedding via OpenAI
        const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: query,
            dimensions: 1536,
          }),
        });

        if (!embResponse.ok) {
          console.error('[search_documentation] OpenAI embedding error:', await embResponse.text());
          return { success: false, error: 'Failed to generate query embedding' };
        }

        const embData = await embResponse.json();
        const queryEmbedding = embData.data[0].embedding;

        // Use service role client for RPC (match_docs_by_embedding uses SECURITY DEFINER)
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { data, error } = await serviceClient.rpc('match_docs_by_embedding', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: 0.4,
          match_count: limit,
        });

        if (error) {
          console.error('[search_documentation] RPC error:', error);
          return { success: false, error: error.message };
        }

        // Filter by category if specified
        let results = data || [];
        if (category) {
          results = results.filter((a: any) => a.category === category);
        }

        return {
          success: true,
          articles: results.map((a: any) => ({
            slug: a.slug,
            title: a.title,
            category: a.category,
            content_snippet: a.content?.slice(0, 500) || '',
            similarity: a.similarity,
          })),
          total: results.length,
        };
      } catch (err: any) {
        console.error('[search_documentation] Error:', err);
        return { success: false, error: err.message || 'search_documentation failed' };
      }
    }

    case 'search_meeting_context': {
      const result = await executeAction(
        client,
        userId,
        resolvedOrgId,
        'search_meeting_context' as ExecuteActionName,
        input,
        { userAuthToken }
      );
      return result;
    }

    case 'query_credit_usage': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const result = await fetch(`${supabaseUrl}/functions/v1/get-credit-usage-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': userAuthToken ? `Bearer ${userAuthToken}` : '',
        },
        body: JSON.stringify(input),
      });
      const data = await result.json();
      return data;
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// =============================================================================
// Memory Context Injection
// =============================================================================

const MEMORY_SYSTEM_ADDITION = `
## Memory & Continuity

You have access to memories from previous conversations. When relevant:
- Remind the user of commitments they made ("Last week you mentioned you'd follow up with Sarah...")
- Apply their stated preferences ("I'll format this report the way you prefer...")
- Reference relationship context ("Given what you told me about John preferring email...")
- Connect current context to past discussions ("This relates to the Acme deal we discussed...")

Be natural about memory recall - don't be creepy, but be helpfully proactive.
`;

async function buildContextWithMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userMessage: string
): Promise<string> {
  try {
    // Extract keywords from the user message for matching
    const words = userMessage.toLowerCase().split(/\W+/)
      .filter((w: string) => w.length > 2);

    if (words.length === 0) return '';

    // Build search query - use the most significant words
    const searchTerms = words.slice(0, 5);

    // Query memories that match any of the keywords
    const { data: memories, error } = await supabase
      .from('copilot_memories')
      .select('id, category, subject, content, confidence, last_accessed_at, access_count')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('last_accessed_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error || !memories || memories.length === 0) return '';

    // Score memories by relevance to the user message
    const scored = memories
      .map((m: { id: string; category: string; subject: string; content: string; confidence: number; last_accessed_at: string | null; access_count: number }) => {
        let score = 0;
        const subjectLower = m.subject.toLowerCase();
        const contentLower = m.content.toLowerCase();

        for (const term of searchTerms) {
          if (subjectLower.includes(term)) score += 3;
          if (contentLower.includes(term)) score += 2;
        }

        score *= m.confidence;

        // Recency boost
        if (m.last_accessed_at) {
          const daysSince = (Date.now() - new Date(m.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) score *= 1.2;
          else if (daysSince < 30) score *= 1.1;
        }

        return { ...m, relevance_score: score };
      })
      .filter((m: { relevance_score: number }) => m.relevance_score > 0)
      .sort((a: { relevance_score: number }, b: { relevance_score: number }) => b.relevance_score - a.relevance_score)
      .slice(0, 10);

    if (scored.length === 0) return '';

    // Update access stats for returned memories
    const memoryIds = scored.map((m: { id: string }) => m.id);
    await supabase
      .from('copilot_memories')
      .update({ last_accessed_at: new Date().toISOString() })
      .in('id', memoryIds);

    // Format memories for context injection
    const memoryLines = scored.map(
      (m: { subject: string; category: string; content: string }) => `- **${m.subject}** (${m.category}): ${m.content}`
    ).join('\n');

    return `\n## Relevant Memories\n\nThe following information from previous conversations may be relevant:\n\n${memoryLines}\n`;
  } catch (err) {
    console.error('[buildContextWithMemories] Error:', err);
    return ''; // Non-fatal
  }
}

// =============================================================================
// Compaction Check
// =============================================================================

const COMPACTION_THRESHOLD = 80000;
const TARGET_CONTEXT_SIZE = 20000;
const MIN_RECENT_MESSAGES = 10;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

async function handleCompactionIfNeeded(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  userId: string,
  model: string
): Promise<void> {
  try {
    // Find user's main session
    const { data: session } = await supabase
      .from('copilot_conversations')
      .select('id, total_tokens_estimate')
      .eq('user_id', userId)
      .eq('is_main_session', true)
      .maybeSingle();

    if (!session || session.total_tokens_estimate < COMPACTION_THRESHOLD) return;

    console.log(`[compaction] Session ${session.id} at ${session.total_tokens_estimate} tokens, starting compaction...`);

    // Load all non-compacted messages
    const { data: messages } = await supabase
      .from('copilot_messages')
      .select('id, conversation_id, role, content, metadata, is_compacted, created_at')
      .eq('conversation_id', session.id)
      .eq('is_compacted', false)
      .order('created_at', { ascending: true });

    if (!messages || messages.length <= MIN_RECENT_MESSAGES) return;

    // Find split point - keep TARGET_CONTEXT_SIZE tokens at the end
    let accumulatedTokens = 0;
    let splitIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
      accumulatedTokens += estimateTokens(messages[i].content);
      if (accumulatedTokens > TARGET_CONTEXT_SIZE) {
        splitIndex = i + 1;
        break;
      }
    }

    // Ensure we keep at least MIN_RECENT_MESSAGES
    const maxSplitIndex = messages.length - MIN_RECENT_MESSAGES;
    splitIndex = Math.min(splitIndex, Math.max(0, maxSplitIndex));

    if (splitIndex === 0) return;

    const toSummarize = messages.slice(0, splitIndex);
    const toKeep = messages.slice(splitIndex);

    // Generate summary — format multi-agent messages with agent attribution
    const conversationText = toSummarize
      .map((m: { role: string; content: string; metadata?: Record<string, unknown> | null }) => {
        const meta = m.metadata as Record<string, unknown> | null;
        if (m.role === 'assistant' && meta?.is_multi_agent && Array.isArray(meta.agent_responses)) {
          // Include agent attribution so summaries/memories capture which specialist said what
          const agentSections = (meta.agent_responses as Array<{ agent: string; displayName: string; responseText: string }>)
            .map((ar) => `  [${ar.displayName}]: ${ar.responseText}`)
            .join('\n');
          return `[assistant (multi-agent: ${(meta.agents_used as string[])?.join(', ') || 'multiple'})]:\n${agentSections}\n[synthesized]: ${m.content}`;
        }
        return `[${m.role}]: ${m.content}`;
      })
      .join('\n\n');

    const summaryResponse = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: `You are summarizing a conversation. Create a concise summary capturing: main topics, key decisions, important context for continuity, and action items. Keep under 500 words.`,
      messages: [{ role: 'user', content: `Summarize:\n\n${conversationText}` }],
    });

    const summaryText = summaryResponse.content.find((c) => c.type === 'text');
    const summary = summaryText?.type === 'text' ? summaryText.text : '';

    // Extract memories
    const memExtractionResponse = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: `Analyze this conversation and extract important memories as JSON array.
Categories: deal, relationship, preference, commitment, fact.
Each: { "category", "subject", "content", "confidence" (0-1) }
Return [] if no meaningful memories.`,
      messages: [{ role: 'user', content: `Extract memories:\n\n${conversationText}` }],
    });

    const memText = memExtractionResponse.content.find((c) => c.type === 'text');
    const memResponse = memText?.type === 'text' ? memText.text : '';

    // Parse and store memories
    try {
      const jsonMatch = memResponse.match(/```json\n?([\s\S]*?)\n?```/) || memResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const extracted = JSON.parse(jsonStr) as Array<{ category: string; subject: string; content: string; confidence: number }>;

        for (const mem of extracted.filter((m: { confidence: number }) => m.confidence >= 0.5)) {
          await supabase.from('copilot_memories').insert({
            user_id: userId,
            category: mem.category,
            subject: mem.subject,
            content: mem.content,
            confidence: mem.confidence,
            access_count: 0,
          });
        }

        console.log(`[compaction] Extracted ${extracted.length} memories`);
      }
    } catch {
      console.warn('[compaction] Failed to parse memories, continuing...');
    }

    // Store summary
    await supabase.from('copilot_session_summaries').insert({
      conversation_id: session.id,
      user_id: userId,
      summary,
      message_range_start: toSummarize[0]?.id,
      message_range_end: toSummarize[toSummarize.length - 1]?.id,
      messages_summarized: toSummarize.length,
      tokens_before: estimateTokens(conversationText),
      tokens_after: estimateTokens(summary),
    });

    // Mark old messages as compacted
    const compactIds = toSummarize.map((m: { id: string }) => m.id);
    await supabase
      .from('copilot_messages')
      .update({ is_compacted: true })
      .in('id', compactIds);

    // Update token estimate
    const newTokens = toKeep.reduce((sum: number, m: { content: string }) => sum + estimateTokens(m.content), 0);
    await supabase
      .from('copilot_conversations')
      .update({
        total_tokens_estimate: newTokens,
        last_compaction_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    console.log(`[compaction] Complete: ${toSummarize.length} messages summarized, ${newTokens} tokens remaining`);
  } catch (err) {
    console.error('[compaction] Error (non-blocking):', err);
    // Non-fatal - don't interrupt the user's request
  }
}

// =============================================================================
// Apify Integration Check
// =============================================================================

interface ApifyConnectionInfo {
  connected: boolean;
  hasToken: boolean;
}

async function checkApifyConnection(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null
): Promise<ApifyConnectionInfo> {
  if (!orgId) return { connected: false, hasToken: false };

  try {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('id, credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return { connected: false, hasToken: false };

    const hasToken = !!(data.credentials as Record<string, unknown>)?.api_token;
    return { connected: true, hasToken };
  } catch {
    return { connected: false, hasToken: false };
  }
}

// =============================================================================
// Profile Context (Fact Profile + Product Profile)
// =============================================================================

interface ProfileContext {
  companyContext?: string;
  productContext?: string;
}

interface EmailPersonalization {
  signOff?: string;
  writingStyleSummary?: string;
}

async function fetchEmailPersonalization(
  client: ReturnType<typeof createClient>,
  userId: string
): Promise<EmailPersonalization> {
  const result: EmailPersonalization = {};

  // Fetch sign-off and writing style in parallel
  const [toneResult, styleResult] = await Promise.all([
    client
      .from('user_tone_settings')
      .select('email_sign_off')
      .eq('user_id', userId)
      .eq('content_type', 'email')
      .maybeSingle(),
    client
      .from('user_writing_styles')
      .select('name, tone_description, style_metadata, examples')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle(),
  ]);

  if (toneResult.data?.email_sign_off) {
    result.signOff = toneResult.data.email_sign_off;
  }

  if (styleResult.data) {
    const ws = styleResult.data;
    const parts: string[] = [];
    if (ws.name) parts.push(`Style: ${ws.name}`);
    if (ws.tone_description) parts.push(`Tone: ${ws.tone_description}`);

    const meta = ws.style_metadata as Record<string, unknown> | null;
    if (meta) {
      if (meta.formality) parts.push(`Formality: ${meta.formality}`);
      if (meta.directness) parts.push(`Directness: ${meta.directness}`);
      if (meta.warmth) parts.push(`Warmth: ${meta.warmth}`);
      const gs = meta.greetings_signoffs as { greetings?: string[]; signoffs?: string[] } | null;
      if (gs?.signoffs?.length) parts.push(`Preferred sign-offs: ${gs.signoffs.join(', ')}`);
      if (gs?.greetings?.length) parts.push(`Preferred greetings: ${gs.greetings.join(', ')}`);
    }

    if (ws.examples && Array.isArray(ws.examples) && ws.examples.length > 0) {
      const snippets = (ws.examples as string[]).slice(0, 2).map((ex: string) =>
        ex.length > 200 ? ex.slice(0, 200) + '...' : ex
      );
      parts.push(`Example writing samples:\n${snippets.join('\n---\n')}`);
    }

    if (parts.length > 0) {
      result.writingStyleSummary = parts.join('\n');
    }
  }

  return result;
}

async function fetchProfileContext(
  client: ReturnType<typeof createClient>,
  factProfileId?: string,
  productProfileId?: string
): Promise<ProfileContext> {
  const result: ProfileContext = {};

  if (factProfileId) {
    try {
      const { data } = await client
        .from('client_fact_profiles')
        .select('company_name, company_domain, research_data, research_status')
        .eq('id', factProfileId)
        .maybeSingle();

      if (data && data.research_status === 'complete' && data.research_data) {
        const rd = data.research_data as Record<string, unknown>;
        const sections: string[] = [`Company: ${data.company_name}`];
        if (data.company_domain) sections.push(`Domain: ${data.company_domain}`);
        for (const [key, value] of Object.entries(rd)) {
          if (value && typeof value === 'object') {
            sections.push(`### ${key}\n${JSON.stringify(value, null, 2)}`);
          } else if (value) {
            sections.push(`**${key}**: ${String(value)}`);
          }
        }
        result.companyContext = sections.join('\n');
      }
    } catch (err) {
      console.error('[fetchProfileContext] Error fetching fact profile:', err);
    }
  }

  if (productProfileId) {
    try {
      const { data } = await client
        .from('product_profiles')
        .select('name, description, category, product_url, research_data, research_status')
        .eq('id', productProfileId)
        .maybeSingle();

      if (data && data.research_status === 'complete' && data.research_data) {
        const rd = data.research_data as Record<string, unknown>;
        const sections: string[] = [`Product: ${data.name}`];
        if (data.description) sections.push(`Description: ${data.description}`);
        if (data.category) sections.push(`Category: ${data.category}`);
        if (data.product_url) sections.push(`URL: ${data.product_url}`);
        for (const [key, value] of Object.entries(rd)) {
          if (value && typeof value === 'object') {
            sections.push(`### ${key}\n${JSON.stringify(value, null, 2)}`);
          } else if (value) {
            sections.push(`**${key}**: ${String(value)}`);
          }
        }
        result.productContext = sections.join('\n');
      }
    } catch (err) {
      console.error('[fetchProfileContext] Error fetching product profile:', err);
    }
  }

  return result;
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  organizationId?: string,
  context?: Record<string, unknown>,
  memoryContext?: string,
  apifyConnection?: ApifyConnectionInfo,
  profileContext?: ProfileContext,
  emailPersonalization?: EmailPersonalization
): string {
  return `You are an AI sales assistant for a platform called Sixty. You help sales professionals manage their pipeline, prepare for meetings, track contacts, and execute sales workflows.

## Your Tools

1. **resolve_entity** - CRITICAL: Use FIRST when user mentions a person by first name only (e.g., "Stan", "John"). Searches CRM, meetings, and calendar in parallel to find the right person. DO NOT ask for clarification first.
2. **list_skills** - See available skills and sequences by category
3. **get_skill** - Retrieve a skill/sequence document for guidance (use exact skill_key from list)
4. **execute_action** - Perform actions (query CRM, fetch meetings, search emails, manage pipeline, meeting intelligence, etc.)
5. **search_meeting_context** - Proactively search for relevant meeting context when discussing deals, contacts, or companies. Use this to enrich responses with real meeting intelligence.

## How To Work

1. **If user mentions a person by first name only** -> Use resolve_entity FIRST
2. **If user needs data** (deals, contacts, meetings, pipeline) -> Use execute_action with the appropriate action
3. **If task involves a skill or multi-step workflow** -> Use list_skills to discover, get_skill to retrieve, then follow the skill instructions
4. Use execute_action to gather data or perform tasks
5. **When discussing deals or contacts** -> Proactively call search_meeting_context to enrich your response with relevant meeting intelligence. This helps provide context from past conversations.

## Multi-Step Workflows

When the user's request involves MULTIPLE steps (e.g., "find leads AND create email sequences AND push to campaign"), break it down and execute step by step:

1. **Identify all steps** in the request before starting
2. **Execute sequentially** — complete each step before the next, using outputs from earlier steps
3. **Thread results** — pass table IDs, lead counts, and other data between steps
4. **Report progress** — briefly mention what you're doing at each step

### Example: "Find 20 Directors in Bristol and create a 2-stage invite sequence for our event"
→ Step 1: execute_action("search_leads_create_table", {query: "Directors in Bristol", person_titles: ["Director"], person_locations: ["Bristol, United Kingdom"], per_page: 20})
→ Step 2: execute_action("run_skill", {skill_key: "sales-sequence", skill_context: {sequence_type: "event_invitation", ...event details from user message...}})
→ Step 3: execute_action("push_ops_to_instantly", {table_id: "<from step 1>", campaign_config: {name: "...", emails: [<from step 2>]}})
→ Step 4: Present summary with lead count, email previews, and campaign status

Don't stop after completing just one step — complete the FULL workflow the user requested.

## Common Patterns

### Contact/Person Lookup
1. Use execute_action with get_contact to find the contact by name/email
2. Use execute_action with get_lead to get ALL enrichment data
3. Use execute_action with get_meetings to find meetings with that contact

### Pipeline Intelligence
- Use execute_action with get_pipeline_deals { filter: "closing_soon", period: "this_week" }
- Use execute_action with get_pipeline_deals { filter: "stale", days: 14 }
- Use execute_action with get_pipeline_summary {} for current pipeline snapshot
- Use execute_action with get_pipeline_forecast { period: "this_quarter" }

**IMPORTANT: When discussing deals, always reference their health score, risk signals, and relationship health status. Proactively flag deals with critical health (<40 score) or high ghost risk (>50%). Health scores are automatically included in all deal queries.**

### Meeting Prep
- Use execute_action with get_next_meeting { include_context: true } for the single next upcoming meeting
- Use execute_action with get_meetings_for_period { period: "today"${context?.temporalContext ? `, timezone: "${(context.temporalContext as Record<string, string>).timezone}"` : ''} } for today's FULL schedule — **ALWAYS use this when the user asks about "my meetings today", "today's schedule", "what do I have today", or any variant asking about multiple meetings**. This returns ALL events for today, not just the next one.
- **ALWAYS pass timezone when using any period-based action** (get_meetings_for_period, get_meeting_count, get_time_breakdown). The user's timezone is: ${context?.temporalContext ? `"${(context.temporalContext as Record<string, string>).timezone}"` : '"UTC"'}. Without it, date ranges will default to UTC and return the wrong day's meetings.
- When the user says they have "many meetings", list the full day with get_meetings_for_period, don't just show the next one

### Follow-up Management
- Use execute_action with get_contacts_needing_attention { days_since_contact: 14 }
- Use execute_action with list_tasks { status: "pending" }

### Ops Tables
- Use execute_action with list_ops_tables {} to see all tables
- Use execute_action with get_ops_table { table_id } for table details + columns
- Use execute_action with get_ops_table_data { table_id } to view rows and cells
- Use execute_action with create_ops_table { name, columns: [...] } to create a new table
- Use execute_action with ai_query_ops_table { table_id, query } to ask AI about table data
- Use execute_action with ai_transform_ops_column { table_id, column_id, prompt } to transform column values
- Use execute_action with sync_ops_hubspot { table_id } to sync with HubSpot
- Use execute_action with push_ops_to_instantly { table_id } to push to Instantly campaigns

### Standard Tables (Canonical CRM Data Sources)
These are auto-provisioned, auto-synced tables that serve as the single source of truth for core CRM entities:
- **Leads**: Lead pipeline from contacts + CRM integrations
- **Meetings**: Meeting history with recordings and transcripts
- **All Contacts**: Universal mirror of all CRM contacts
- **All Companies**: Unified company data across all sources

When users ask for CRM data ("show me my leads", "list contacts", "recent meetings", "find companies"):
1. Use execute_action with list_standard_tables {} to see available standard tables
2. Use execute_action with query_standard_table { table_name, filters?, sort_by?, limit? } to query data
   - table_name must be exactly: "Leads", "Meetings", "All Contacts", or "All Companies"
   - filters is optional array of {column, operator, value} objects
   - Present results in a structured format with row count

These tables are READ-ONLY — do not attempt to modify them with create/update/delete operations.

### CRM Index Search (Fast Lightweight Search)
For quick searches across HubSpot/Attio CRM data WITHOUT creating full materialized records:
- Use execute_action with search_crm_contacts { query?, email?, name?, company?, job_title?, lifecycle_stage?, has_active_deal?, limit? }
  - Returns: crm_source, crm_record_id, email, first_name, last_name, full_name, company_name, company_domain, job_title, lifecycle_stage, is_materialized, materialized_contact_id
- Use execute_action with search_crm_companies { query?, name?, domain?, industry?, limit? }
  - Returns: crm_source, crm_record_id, name, domain, industry, employee_count, annual_revenue, city, state, country, is_materialized
- Use execute_action with search_crm_deals { query?, stage?, pipeline?, min_amount?, limit? }
  - Returns: crm_source, crm_record_id, name, stage, pipeline, amount, close_date, owner_crm_id, company_crm_id, contact_crm_ids, is_materialized

**When to use**: Fast searches when you don't need full contact/company records. Results show if record is_materialized (already in our contacts table) or needs materialization.

**Materialization**: If you find a contact in CRM index that needs full data:
- Use execute_action with materialize_contact { crm_source, crm_record_id }
- This pulls the full record from CRM API and creates it in the contacts table
- Updates the index with materialized_contact_id for future lookups

## Organization Context

${organizationId ? `Organization ID: ${organizationId}` : 'No organization specified'}
${context?.temporalContext ? `\n## Current Date & Time\n\nToday is ${(context.temporalContext as Record<string, string>).date}. Current time: ${(context.temporalContext as Record<string, string>).time} (${(context.temporalContext as Record<string, string>).timezone}).` : ''}
${memoryContext || ''}
${memoryContext ? MEMORY_SYSTEM_ADDITION : ''}
${profileContext?.companyContext ? `\n## Company Context\n\nThe user has selected a company profile for this conversation. Use this context to personalize responses, tailor outreach messaging, and inform sales strategy:\n\n${profileContext.companyContext}\n` : ''}
${profileContext?.productContext ? `\n## Product Context\n\nThe user has selected a product profile for this conversation. Use this context to craft relevant messaging, highlight product-market fit, and tailor sales approaches:\n\n${profileContext.productContext}\n` : ''}
${emailPersonalization?.signOff || emailPersonalization?.writingStyleSummary ? `\n## Email Personalization\n\nWhen generating ANY email (cold outreach, follow-ups, introductions, meeting follow-ups, etc.), ALWAYS apply these user preferences:\n${emailPersonalization.signOff ? `\n**Sign-Off:** Always end emails with:\n${emailPersonalization.signOff}` : ''}${emailPersonalization.writingStyleSummary ? `\n\n**Trained Writing Style:**\n${emailPersonalization.writingStyleSummary}` : ''}\n` : ''}
## Behavior Guidelines

- Be concise but thorough in your responses
- When presenting CRM data, format it clearly
- Confirm before CRM updates or notifications (execute_action write actions like create_task, update_crm require params.confirm=true). Lead searches do NOT need confirmation.
- If a tool returns an error, explain what happened and suggest alternatives
- Present data in a helpful, actionable way for sales professionals
- **Email output rules:** When you generate an email draft, output ONLY the email (subject line + body). Do NOT append meta-commentary, analysis, word counts, scoring, or coaching notes (e.g. "Word count: 62 | One ask: Quick call"). The user wants a ready-to-send email, not a writing critique. After the email, you may offer to adjust but never add statistics or framework labels.
- **Email style rules:** Never use em dashes (— or –) in emails, they are the biggest AI tell. Never use oxford commas ("sales, marketing and ops" not "sales, marketing, and ops"). Don't swap punctuation for colons or dashes. If a sentence needs a colon or em dash to work, rewrite it as two short sentences. Keep punctuation simple: full stops, commas, question marks.

### LEAD SEARCH — MANDATORY TOOL USAGE

When the user asks to find leads, search for companies/people, prospect, or build a list:

1. **ALWAYS use action="search_leads_create_table"** — this is an all-in-one action that searches the database, creates the ops table, and populates it with results automatically.
2. **NEVER use create_ops_table for lead searches** — that only creates an empty table and requires confirmation. search_leads_create_table does NOT require confirmation.
3. **Do NOT ask for confirmation** — just call the tool immediately.
4. **Do NOT describe what you would do** — execute the search directly.

Example: User says "Find marketing agencies in Bristol"
→ Immediately call: execute_action("search_leads_create_table", {query: "marketing agencies in Bristol", person_locations: ["Bristol, United Kingdom"], per_page: 10})

5. **After a successful search**, keep your response SHORT. Just say something like:
   "I've prepared a table with X [companies/contacts] matching your search."
   Do NOT list individual results in the chat — the structured response card with "Open Table" button handles that. Do NOT repeat search parameters back. Keep it to 1-2 sentences max.
${apifyConnection?.connected ? `
## Apify Web Scraping (Connected)

This organization has Apify connected. You can help with web scraping workflows:
- **Browse actors**: Use list_skills to find apify-actor-browse, then get_skill to learn how to search the marketplace
- **Run scrapers**: Use the apify-run-trigger skill to configure and start actor runs
- **Query results**: Use the apify-results-query skill to filter and explore scraped data
- **Full pipeline**: Use the seq-apify-scrape-flow sequence for end-to-end scraping workflows

When the user asks about scraping, web data extraction, or Apify — use these skills via execute_action with run_skill or run_sequence.
` : ''}
`;
}

// =============================================================================
// Analytics Logging
// =============================================================================

interface ExecutionAnalytics {
  executionId?: string;
  startTime: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallIds: string[];
}

async function logExecutionStart(
  supabase: ReturnType<typeof createClient>,
  organizationId: string | undefined,
  userId: string | null,
  message: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('copilot_executions')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        user_message: message,
        execution_mode: 'autonomous',
        model: MODEL,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[logExecutionStart] Error:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[logExecutionStart] Exception:', err);
    return null;
  }
}

async function logExecutionComplete(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  analytics: ExecutionAnalytics,
  success: boolean,
  responseText: string,
  toolsUsed: string[],
  iterations: number,
  errorMessage?: string,
  structuredResponse?: unknown,
  skillKey?: string,
  sequenceKey?: string
): Promise<void> {
  try {
    const duration = Date.now() - analytics.startTime;

    await supabase
      .from('copilot_executions')
      .update({
        success,
        response_text: responseText?.slice(0, 5000), // Limit response text
        error_message: errorMessage,
        tools_used: toolsUsed,
        tool_call_count: analytics.toolCallIds.length,
        iterations,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        input_tokens: analytics.totalInputTokens,
        output_tokens: analytics.totalOutputTokens,
        total_tokens: analytics.totalInputTokens + analytics.totalOutputTokens,
        ...(structuredResponse ? { structured_response: structuredResponse } : {}),
        ...(skillKey ? { skill_key: skillKey } : {}),
        ...(sequenceKey ? { sequence_key: sequenceKey } : {}),
      })
      .eq('id', executionId);

    // Prune old structured responses to keep only last 5 per skill/sequence
    if (structuredResponse && (skillKey || sequenceKey)) {
      await supabase.rpc('prune_old_structured_responses', {
        p_skill_key: skillKey || null,
        p_sequence_key: sequenceKey || null,
      }).catch((err: unknown) => {
        console.error('[logExecutionComplete] Prune error (non-fatal):', err);
      });
    }
  } catch (err) {
    console.error('[logExecutionComplete] Exception:', err);
  }
}

async function logToolCall(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  toolName: string,
  input: Record<string, unknown>,
  status: 'running' | 'completed' | 'error',
  output?: unknown,
  errorMessage?: string,
  startTime?: number
): Promise<string | null> {
  try {
    const duration = startTime ? Date.now() - startTime : undefined;

    const { data, error } = await supabase
      .from('copilot_tool_calls')
      .insert({
        execution_id: executionId,
        tool_name: toolName,
        input,
        output: output ? JSON.stringify(output) : null,
        status,
        error_message: errorMessage,
        duration_ms: duration,
        completed_at: status !== 'running' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[logToolCall] Error:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[logToolCall] Exception:', err);
    return null;
  }
}

async function updateToolCall(
  supabase: ReturnType<typeof createClient>,
  toolCallId: string,
  status: 'completed' | 'error',
  output?: unknown,
  errorMessage?: string,
  startTime?: number
): Promise<void> {
  try {
    const duration = startTime ? Date.now() - startTime : undefined;

    await supabase
      .from('copilot_tool_calls')
      .update({
        status,
        output: output ? JSON.stringify(output) : null,
        error_message: errorMessage,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      })
      .eq('id', toolCallId);
  } catch (err) {
    console.error('[updateToolCall] Exception:', err);
  }
}

// =============================================================================
// Streaming Response
// =============================================================================

function createSSEStream(): {
  readable: ReadableStream;
  writer: WritableStreamDefaultWriter;
  encoder: TextEncoder;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const writable = new WritableStream({
    write(chunk) {
      controller.enqueue(chunk);
    },
    close() {
      controller.close();
    },
  });

  return { readable, writer: writable.getWriter(), encoder };
}

function sendSSE(
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  event: string,
  data: unknown
): Promise<void> {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(message));
}

// =============================================================================
// Multi-Agent Orchestration
// =============================================================================

async function logRoutingDecision(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  classification: IntentClassification
): Promise<void> {
  try {
    await supabase.from('agent_routing_log').insert({
      execution_id: executionId,
      intent_classification: classification,
      agents_selected: classification.agents,
      delegation_strategy: classification.strategy,
      reasoning: classification.reasoning,
      confidence: classification.confidence,
    });
  } catch (err) {
    // Non-fatal — table may not exist
    console.warn('[orchestrator] Failed to log routing decision:', err);
  }
}

async function handleMultiAgentRequest(
  message: string,
  config: AgentTeamConfig,
  classification: IntentClassification,
  anthropic: Anthropic,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  executionId: string | null
): Promise<void> {
  const streamWriter: StreamWriter = {
    sendSSE: (event, data) => sendSSE(writer, encoder, event, data),
  };

  const { agents, strategy } = classification;
  const results: Array<{ agentName: string; responseText: string; toolsUsed: string[]; inputTokens: number; outputTokens: number }> = [];

  if (strategy === 'single' || agents.length === 1) {
    // Single agent delegation
    const agentName = agents[0];
    const agentConfig = getSpecialistConfig(agentName, config.worker_model);
    const info = getAgentDisplayInfo(agentName);

    await sendSSE(writer, encoder, 'agent_start', {
      agent: agentName,
      displayName: info.displayName,
      icon: info.icon,
      color: info.color,
      reason: classification.reasoning,
    });

    const result = await runSpecialist(
      agentConfig,
      message,
      '', // No prior context for single agent
      { anthropic, supabase, userId, orgId },
      streamWriter,
      executionId || undefined
    );

    results.push(result);

    await sendSSE(writer, encoder, 'agent_done', {
      agent: agentName,
      displayName: info.displayName,
    });

    // Stream the agent's response as tokens
    for (const char of result.responseText) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: result.responseText });

  } else if (strategy === 'parallel') {
    // Parallel delegation — run all agents simultaneously
    for (const agentName of agents) {
      const info = getAgentDisplayInfo(agentName);
      await sendSSE(writer, encoder, 'agent_start', {
        agent: agentName,
        displayName: info.displayName,
        icon: info.icon,
        color: info.color,
        reason: classification.reasoning,
      });
    }

    const parallelResults = await Promise.all(
      agents.map((agentName) => {
        const agentConfig = getSpecialistConfig(agentName, config.worker_model);
        return runSpecialist(
          agentConfig,
          message,
          '',
          { anthropic, supabase, userId, orgId },
          undefined, // Don't stream individual tool events in parallel
          executionId || undefined
        );
      })
    );

    for (const result of parallelResults) {
      const info = getAgentDisplayInfo(result.agentName);
      await sendSSE(writer, encoder, 'agent_done', {
        agent: result.agentName,
        displayName: info.displayName,
      });
      results.push(result);
    }

    // Synthesize responses from all agents
    const synthesisPrompt = `You are synthesizing responses from multiple specialist agents into one coherent reply for a sales professional.

${parallelResults.map((r) => {
  const info = getAgentDisplayInfo(r.agentName);
  return `## ${info.displayName}\n${r.responseText}`;
}).join('\n\n')}

Combine these into a single, well-structured response. Use headings for each section. Be concise but complete.`;

    const synthesisResponse = await anthropic.messages.create({
      model: config.orchestrator_model,
      max_tokens: 4096,
      system: 'You synthesize specialist agent responses into coherent, actionable advice for sales professionals.',
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const synthText = synthesisResponse.content.find((c) => c.type === 'text');
    const synthesized = synthText?.type === 'text' ? synthText.text : '';

    await sendSSE(writer, encoder, 'synthesis', { content: synthesized });

    for (const char of synthesized) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: synthesized });

  } else if (strategy === 'sequential') {
    // Sequential delegation — chain agent outputs, then synthesize
    let accumulatedContext = '';

    for (let i = 0; i < agents.length; i++) {
      const agentName = agents[i];
      const agentConfig = getSpecialistConfig(agentName, config.worker_model);
      const info = getAgentDisplayInfo(agentName);

      await sendSSE(writer, encoder, 'agent_start', {
        agent: agentName,
        displayName: info.displayName,
        icon: info.icon,
        color: info.color,
        reason: i === 0 ? classification.reasoning : `Building on ${getAgentDisplayInfo(agents[i - 1]).displayName}'s output`,
      });

      const result = await runSpecialist(
        agentConfig,
        message,
        accumulatedContext,
        { anthropic, supabase, userId, orgId },
        streamWriter,
        executionId || undefined
      );

      results.push(result);
      accumulatedContext += `\n\n## ${info.displayName} Output\n${result.responseText}`;

      await sendSSE(writer, encoder, 'agent_done', {
        agent: agentName,
        displayName: info.displayName,
      });

      // Send progress update between agents
      if (i < agents.length - 1) {
        const progressSummary = result.responseText.slice(0, 200);
        await sendSSE(writer, encoder, 'agent_progress', {
          agent: agentName,
          displayName: info.displayName,
          summary: progressSummary,
          step: i + 1,
          totalSteps: agents.length,
        });
      }
    }

    // Synthesize all agent outputs into one coherent response
    const synthesisPrompt = `You are synthesizing responses from specialist agents that ran SEQUENTIALLY (each building on the previous agent's work) for a sales professional.

${results.map((r, idx) => {
  const info = getAgentDisplayInfo(r.agentName);
  return `## Step ${idx + 1}: ${info.displayName}\n${r.responseText}`;
}).join('\n\n')}

Combine these into a single, well-structured response that tells a coherent story of what was accomplished across all steps. Present results, key data, and next actions clearly.`;

    const synthesisResponse = await anthropic.messages.create({
      model: config.orchestrator_model,
      max_tokens: 4096,
      system: 'You synthesize sequential agent workflow results into coherent, actionable summaries for sales professionals. Present the combined results as one unified narrative.',
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const synthText = synthesisResponse.content.find((c) => c.type === 'text');
    const synthesized = synthText?.type === 'text' ? synthText.text : '';

    await sendSSE(writer, encoder, 'synthesis', { content: synthesized });

    for (const char of synthesized) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: synthesized });
  }

  // Send done event with agent metadata (includes per-agent responses for persistence)
  const allToolsUsed = results.flatMap((r) => r.toolsUsed);
  const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);

  await sendSSE(writer, encoder, 'done', {
    toolsUsed: [...new Set(allToolsUsed)],
    iterations: results.reduce((sum, r) => sum + r.iterations, 0),
    agents_used: results.map((r) => r.agentName),
    total_tokens: totalInputTokens + totalOutputTokens,
    is_multi_agent: results.length > 1 || strategy !== 'single',
    agent_responses: results.map((r) => ({
      agent: r.agentName,
      displayName: getAgentDisplayInfo(r.agentName).displayName,
      responseText: r.responseText.slice(0, 2000),
      toolsUsed: r.toolsUsed,
    })),
    strategy,
  });

  // Log completion for parent execution
  if (executionId) {
    const finalText = results.map((r) => r.responseText).join('\n\n');
    await logExecutionComplete(
      supabase,
      executionId,
      {
        startTime: Date.now(),
        totalInputTokens,
        totalOutputTokens,
        toolCallIds: [],
      },
      true,
      finalText.slice(0, 5000),
      [...new Set(allToolsUsed)],
      results.reduce((sum, r) => sum + r.iterations, 0)
    );
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse request
    const body: RequestBody = await req.json();
    const { message, organizationId, context = {}, stream = true, fact_profile_id, product_profile_id } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let userId: string | null = null;
    const token = authHeader ? authHeader.replace('Bearer ', '') : '';
    if (authHeader) {
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting — keyed per-user via anon client (intensive: 10 req/min)
    const rateLimitClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const rateLimitResult = await rateLimitMiddleware(
      rateLimitClient,
      req,
      'copilot-autonomous',
      RATE_LIMIT_CONFIGS.intensive
    );
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Initialize Anthropic
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Build memory context for the user
    let memoryContext = '';
    memoryContext = await buildContextWithMemories(supabase, userId, message);

    // Trigger compaction check in background (non-blocking)
    handleCompactionIfNeeded(supabase, anthropic, userId, MODEL).catch((err) =>
      console.error('[copilot-autonomous] Background compaction error:', err)
    );

    // Check if org has Apify connected (for system prompt injection)
    const apifyConnection = await checkApifyConnection(supabase, organizationId || null);
    if (apifyConnection.connected) {
      console.log('[copilot-autonomous] Apify connected for org:', organizationId);
    }

    // Resolve org ID early — needed for credit checks, alerts, model config, and multi-agent
    const resolvedOrgForConfig = organizationId
      ? organizationId
      : await resolveOrgId(supabase, userId, null).catch(() => null);

    // Check credit balance before proceeding
    if (resolvedOrgForConfig) {
      const creditCheck = await checkCreditBalance(supabase, resolvedOrgForConfig);
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: creditCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // =========================================================================
    // Proactive Credit Alerts (non-blocking)
    // =========================================================================
    // Call check-credit-alerts and pick the highest-priority alert (if any)
    // to append as a brief note in the system prompt.
    let creditAlertNote = '';
    if (resolvedOrgForConfig && userId) {
      try {
        const alertResp = await fetch(`${SUPABASE_URL}/functions/v1/check-credit-alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader || '',
          },
          body: JSON.stringify({ org_id: resolvedOrgForConfig, user_id: userId }),
        });

        if (alertResp.ok) {
          const alertData = await alertResp.json();
          const alerts = alertData?.alerts as Array<{ alert_type: string; message: string }> | undefined;

          if (alerts && alerts.length > 0) {
            // Priority order: negative_balance > budget_cap_hit > low_balance_10cr > low_balance_20pct > tier_upgrade_suggestion > weekly_digest
            const PRIORITY_ORDER = [
              'negative_balance', 'budget_cap_hit', 'low_balance_10cr',
              'low_balance_20pct', 'tier_upgrade_suggestion', 'weekly_digest',
            ];
            const sorted = [...alerts].sort((a, b) => {
              const aPri = PRIORITY_ORDER.indexOf(a.alert_type);
              const bPri = PRIORITY_ORDER.indexOf(b.alert_type);
              return (aPri === -1 ? 99 : aPri) - (bPri === -1 ? 99 : bPri);
            });

            // Surface only the single most urgent alert
            const topAlert = sorted[0];
            creditAlertNote = `\n\n## Credit Alert (surface this briefly at the START of your response)\n\nBefore answering the user's question, include this brief note:\nCredit alert: ${topAlert.message}\n\nKeep it to one short line -- do not elaborate unless the user asks follow-up questions about credits.\n`;
            console.log(`[copilot-autonomous] Credit alert surfaced: ${topAlert.alert_type}`);
          }
        }
      } catch (alertErr) {
        // Non-fatal — never block copilot for alert failures
        console.warn('[copilot-autonomous] Credit alert check failed (non-fatal):', alertErr);
      }
    }

    // Fetch profile context and email personalization in parallel
    const [profileContext, emailPersonalization] = await Promise.all([
      (fact_profile_id || product_profile_id)
        ? fetchProfileContext(supabase, fact_profile_id, product_profile_id)
        : Promise.resolve(undefined),
      fetchEmailPersonalization(supabase, userId),
    ]);

    // Build system prompt (no longer depends on per-skill tool defs)
    let systemPrompt = buildSystemPrompt(organizationId, context, memoryContext, apifyConnection, profileContext, emailPersonalization);

    // Append credit alert context to system prompt if one was surfaced
    if (creditAlertNote) {
      systemPrompt += creditAlertNote;
    }

    // Use the tool architecture (expanded from original 4-tool to include CRM index and more)
    const claudeTools = TOOL_DEFINITIONS;

    // =========================================================================
    // Multi-Agent Orchestration
    // =========================================================================
    // All orgs get multi-agent classification by default (loadAgentTeamConfig
    // returns a default config when no DB row exists).
    // Single-domain messages still route to a single specialist via the
    // keyword pre-filter — no extra API call for clear intents.
    // Fallback to the original single-agent path happens when:
    //   - force_single_agent context flag is set (demo comparison page)
    //   - Budget is exceeded
    //   - Classification returns null
    //   - Non-streaming request (testing only)

    // Resolve planner/driver models from org config
    let plannerModel = MODEL; // default
    let driverModel = MODEL; // default

    if (resolvedOrgForConfig) {
      try {
        const { data: plannerConfig } = await supabase.rpc('get_model_for_feature', {
          p_feature_key: 'copilot_autonomous',
          p_org_id: resolvedOrgForConfig,
          p_role: 'planner',
        });
        if (plannerConfig?.[0]?.model_identifier) {
          plannerModel = plannerConfig[0].model_identifier;
        }

        const { data: driverConfig } = await supabase.rpc('get_model_for_feature', {
          p_feature_key: 'copilot_autonomous',
          p_org_id: resolvedOrgForConfig,
          p_role: 'driver',
        });
        if (driverConfig?.[0]?.model_identifier) {
          driverModel = driverConfig[0].model_identifier;
        }
      } catch (err) {
        console.warn('[CopilotAutonomous] Model resolution error, using defaults:', err);
      }
    }

    console.log(`[CopilotAutonomous] Models: planner=${plannerModel}, driver=${driverModel}`);

    // Detect lead search queries to force tool usage
    const isLeadSearchQuery = /find\s+(me\s+)?|search\s+for|prospect|build\s+(me\s+)?a\s+list|find\s+leads/i.test(message)
      && /compan|firm|agenc|people|contact|lead|director|manager|ceo|cto/i.test(message);
    if (isLeadSearchQuery) {
      console.log(`[CopilotAutonomous] Lead search query detected — will force search_leads tool for: "${message.slice(0, 80)}"`);
    }

    // force_single_agent is a demo-only context flag used by the side-by-side
    // comparison page. Normal copilot requests always attempt classification.
    const forceSingleAgent = !!context?.force_single_agent;

    if (resolvedOrgForConfig && stream && !forceSingleAgent && !isLeadSearchQuery) {
      const agentTeamConfig = await loadAgentTeamConfig(supabase, resolvedOrgForConfig);

      // Check budget before multi-agent delegation
      const budgetCheck = await checkAgentBudget(
        supabase,
        resolvedOrgForConfig,
        agentTeamConfig.budget_limit_daily_usd
      );

      if (!budgetCheck.allowed) {
        console.log(`[copilot-autonomous] Budget exceeded: $${budgetCheck.todaySpend.toFixed(2)}/$${budgetCheck.budgetLimit.toFixed(2)}, falling back to single-agent`);
        // Fall through to single-agent path below
      } else {
        // Attempt multi-agent classification
        const classification = await classifyIntent(message, agentTeamConfig, anthropic);

        if (classification && classification.agents.length > 0) {
          console.log(`[copilot-autonomous] Multi-agent: ${classification.agents.join(',')} via ${classification.strategy}`);

          const { readable, writer, encoder } = createSSEStream();

          (async () => {
            // Start parent execution log
            const executionId = await logExecutionStart(supabase, organizationId, userId, message);

            // Log routing decision
            if (executionId) {
              await logRoutingDecision(supabase, executionId, classification);
            }

            try {
              await handleMultiAgentRequest(
                message,
                agentTeamConfig,
                classification,
                anthropic,
                supabase,
                userId!,
                resolvedOrgForConfig,
                writer,
                encoder,
                executionId
              );
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error('[copilot-autonomous] Multi-agent error, falling back:', errorMsg);
              await sendSSE(writer, encoder, 'error', { message: `Multi-agent error: ${errorMsg}` });
            } finally {
              await writer.close();
            }
          })();

          return new Response(readable, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        }
        // Classification returned null — fall through to single-agent
      }
    }

    // =========================================================================
    // Single-Agent Path (original behavior — unchanged)
    // =========================================================================

    // Set up streaming response
    if (stream) {
      const { readable, writer, encoder } = createSSEStream();

      // Run autonomous loop in background with token streaming
      (async () => {
        // Initialize analytics tracking
        const analytics: ExecutionAnalytics = {
          startTime: Date.now(),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallIds: [],
        };

        // Start execution logging
        const executionId = await logExecutionStart(supabase, organizationId, userId, message);
        if (executionId) {
          analytics.executionId = executionId;
        }

        let finalResponseText = '';

        try {
          const toolsUsed: string[] = [];
          const toolExecutionDetails: ToolExecutionDetail[] = [];
          let iterations = 0;
          let claudeMessages: Anthropic.MessageParam[] = [
            { role: 'user', content: message },
          ];

          while (iterations < MAX_ITERATIONS) {
            iterations++;

            // Use planner model for first iteration (tool selection), driver for subsequent
            const iterationModel = iterations === 1 ? plannerModel : driverModel;

            // Use streaming API for real-time token delivery
            // Force search_leads tool on first iteration for lead search queries
            const forceToolChoice = (isLeadSearchQuery && iterations === 1)
              ? { type: 'tool' as const, name: 'search_leads' }
              : undefined;
            const stream = anthropic.messages.stream({
              model: iterationModel,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools: claudeTools,
              messages: claudeMessages,
              ...(forceToolChoice && { tool_choice: forceToolChoice }),
            });

            // Track content blocks as they stream
            const contentBlocks: Anthropic.ContentBlock[] = [];
            let currentTextContent = '';
            let stopReason: string | null = null;

            // Process streaming events
            for await (const event of stream) {
              if (event.type === 'content_block_start') {
                if (event.content_block.type === 'text') {
                  // Initialize text block
                  contentBlocks.push({ type: 'text', text: '' });
                } else if (event.content_block.type === 'tool_use') {
                  // Initialize tool use block
                  contentBlocks.push({
                    type: 'tool_use',
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: {},
                  });
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                  // Stream text tokens immediately
                  const text = event.delta.text;
                  currentTextContent += text;

                  // Update the content block
                  const lastBlock = contentBlocks[contentBlocks.length - 1];
                  if (lastBlock && lastBlock.type === 'text') {
                    lastBlock.text += text;
                  }

                  // Send token to client immediately
                  await sendSSE(writer, encoder, 'token', { text });
                } else if (event.delta.type === 'input_json_delta') {
                  // Tool input is streaming - accumulate it
                  const lastBlock = contentBlocks[contentBlocks.length - 1];
                  if (lastBlock && lastBlock.type === 'tool_use') {
                    // Input is streamed as partial JSON string
                    // We'll parse the full input from the final message
                  }
                }
              } else if (event.type === 'message_delta') {
                stopReason = event.delta.stop_reason;

                // Track usage
                if (event.usage) {
                  analytics.totalOutputTokens += event.usage.output_tokens;
                }
              } else if (event.type === 'message_start') {
                // Track input tokens from message start
                if (event.message.usage) {
                  analytics.totalInputTokens += event.message.usage.input_tokens;
                }
              }
            }

            // Get the final message with complete content
            const finalMessage = await stream.finalMessage();

            // Log cost + deduct org credits for autonomous copilot usage
            if (userId && finalMessage.usage) {
              await logAICostEvent(
                supabase,
                userId,
                resolvedOrgForConfig,
                'anthropic',
                MODEL,
                finalMessage.usage.input_tokens,
                finalMessage.usage.output_tokens,
                'copilot_autonomous',
                { request_type: 'copilot_autonomous' }
              );
            }

            if (finalMessage.stop_reason === 'end_turn') {
              // Extract final text
              const textContent = finalMessage.content.find((c) => c.type === 'text');
              finalResponseText = textContent?.type === 'text' ? textContent.text : '';

              // Send completion marker (tokens already streamed)
              await sendSSE(writer, encoder, 'message_complete', { content: finalResponseText });

              // Detect structured response from tool executions OR user intent
              // The detector has two paths:
              //   1. Sequence-aware: maps tool executions (run_sequence) to response types
              //   2. Intent-based: matches user message patterns to response types and
              //      fetches data directly (e.g., "show me my pipeline" → PipelineResponse)
              // Always call the detector so intent-based detection works even when
              // Claude responds with plain text without calling any tools.
              let structuredResponse: StructuredResponse | null = null;
              try {
                structuredResponse = await detectAndStructureResponse(
                  message,
                  finalResponseText,
                  supabase,
                  userId!,
                  [...new Set(toolsUsed)],
                  userId!, // requestingUserId
                  context,
                  toolExecutionDetails
                );

                if (structuredResponse) {
                  console.log('[copilot-autonomous] Structured response detected:', structuredResponse.type);
                  await sendSSE(writer, encoder, 'structured_response', structuredResponse);
                }
              } catch (srError) {
                console.error('[copilot-autonomous] Structured response detection error (non-fatal):', srError);
                // Non-fatal: continue without structured response
              }

              await sendSSE(writer, encoder, 'done', {
                toolsUsed: [...new Set(toolsUsed)],
                iterations,
              });

              // Extract skill/sequence keys for analytics
              const skillExec = toolExecutionDetails.find(
                (t) => t.toolName === 'execute_action' && (t.args as any)?.action === 'run_skill'
              );
              const skillKey = skillExec ? String((skillExec.args as any)?.params?.skill_key || '') || undefined : undefined;
              const seqExec = toolExecutionDetails.find(
                (t) => t.toolName === 'execute_action' && (t.args as any)?.action === 'run_sequence'
              );
              const sequenceKey = seqExec ? String((seqExec.args as any)?.params?.sequence_key || '') || undefined : undefined;

              // Log successful completion
              if (executionId) {
                await logExecutionComplete(
                  supabase,
                  executionId,
                  analytics,
                  true,
                  finalResponseText,
                  [...new Set(toolsUsed)],
                  iterations,
                  undefined, // errorMessage
                  structuredResponse || undefined,
                  skillKey,
                  sequenceKey
                );
              }
              break;
            }

            if (finalMessage.stop_reason === 'tool_use') {
              const toolUseBlocks = finalMessage.content.filter(
                (c) => c.type === 'tool_use'
              ) as Anthropic.ToolUseBlock[];

              // Text was already streamed, send completion marker if there was text
              const textBlock = finalMessage.content.find((c) => c.type === 'text');
              if (textBlock?.type === 'text' && textBlock.text) {
                await sendSSE(writer, encoder, 'message_complete', { content: textBlock.text });
              }

              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const toolUse of toolUseBlocks) {
                toolsUsed.push(toolUse.name);
                const toolStartTime = Date.now();

                await sendSSE(writer, encoder, 'tool_start', {
                  id: toolUse.id,
                  name: toolUse.name,
                  input: toolUse.input,
                });

                // Log tool call start
                let toolCallId: string | null = null;
                if (executionId) {
                  toolCallId = await logToolCall(
                    supabase,
                    executionId,
                    toolUse.name,
                    toolUse.input as Record<string, unknown>,
                    'running'
                  );
                  if (toolCallId) {
                    analytics.toolCallIds.push(toolCallId);
                  }
                }

                try {
                  const result = await executeToolCall(
                    toolUse.name,
                    toolUse.input as Record<string, unknown>,
                    supabase,
                    userId,
                    organizationId || null,
                    token,
                    (context?.temporalContext as Record<string, string> | undefined)?.timezone
                  );

                  const toolLatencyMs = Date.now() - toolStartTime;

                  await sendSSE(writer, encoder, 'tool_result', {
                    id: toolUse.id,
                    name: toolUse.name,
                    result,
                    success: true,
                  });

                  // Log tool call success
                  if (toolCallId) {
                    await updateToolCall(supabase, toolCallId, 'completed', result, undefined, toolStartTime);
                  }

                  // Track execution detail for structured response detection
                  toolExecutionDetails.push({
                    toolName: toolUse.name,
                    args: toolUse.input,
                    result,
                    latencyMs: toolLatencyMs,
                    success: true,
                  });

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  });
                } catch (toolError) {
                  const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
                  const toolLatencyMs = Date.now() - toolStartTime;

                  await sendSSE(writer, encoder, 'tool_result', {
                    id: toolUse.id,
                    name: toolUse.name,
                    error: errorMsg,
                    success: false,
                  });

                  // Log tool call error
                  if (toolCallId) {
                    await updateToolCall(supabase, toolCallId, 'error', undefined, errorMsg, toolStartTime);
                  }

                  // Track failed execution detail
                  toolExecutionDetails.push({
                    toolName: toolUse.name,
                    args: toolUse.input,
                    result: { error: errorMsg },
                    latencyMs: toolLatencyMs,
                    success: false,
                  });

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify({ error: errorMsg }),
                    is_error: true,
                  });
                }
              }

              // Add to message history
              claudeMessages.push({
                role: 'assistant',
                content: finalMessage.content,
              });

              claudeMessages.push({
                role: 'user',
                content: toolResults,
              });

              continue;
            }

            // Unexpected stop reason — still send done event so frontend doesn't hang
            console.warn(`[copilot-autonomous] Unexpected stop reason: ${finalMessage.stop_reason}`);
            if (!finalResponseText) {
              await sendSSE(writer, encoder, 'token', {
                text: "I'm sorry, I wasn't able to complete that request. Could you try rephrasing your question?",
              });
            }
            await sendSSE(writer, encoder, 'done', {
              toolsUsed: [...new Set(toolsUsed)],
              iterations,
            });
            break;
          }

          if (iterations >= MAX_ITERATIONS) {
            await sendSSE(writer, encoder, 'error', {
              message: 'Maximum iterations reached',
            });

            // Log max iterations error
            if (executionId) {
              await logExecutionComplete(
                supabase,
                executionId,
                analytics,
                false,
                finalResponseText,
                [],
                iterations,
                'Maximum iterations reached'
              );
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error('[copilot-autonomous] Error:', error);
          await sendSSE(writer, encoder, 'error', { message: errorMsg });

          // Log error
          if (executionId) {
            await logExecutionComplete(
              supabase,
              executionId,
              analytics,
              false,
              finalResponseText,
              [],
              0,
              errorMsg
            );
          }
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else {
      // Non-streaming response (simpler, for testing)
      const toolsUsed: string[] = [];
      let iterations = 0;
      let claudeMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: message },
      ];
      let finalResponse = '';

      while (iterations < MAX_ITERATIONS) {
        iterations++;

        // Use planner model for first iteration (tool selection), driver for subsequent
        const iterationModel = iterations === 1 ? plannerModel : driverModel;

        // Force search_leads tool on first iteration for lead search queries
        const forceToolChoiceNonStream = (isLeadSearchQuery && iterations === 1)
          ? { type: 'tool' as const, name: 'search_leads' }
          : undefined;
        const response = await anthropic.messages.create({
          model: iterationModel,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: claudeTools,
          messages: claudeMessages,
          ...(forceToolChoiceNonStream && { tool_choice: forceToolChoiceNonStream }),
        });

        if (response.stop_reason === 'end_turn') {
          const textContent = response.content.find((c) => c.type === 'text');
          finalResponse = textContent?.type === 'text' ? textContent.text : '';
          break;
        }

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter(
            (c) => c.type === 'tool_use'
          ) as Anthropic.ToolUseBlock[];

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            toolsUsed.push(toolUse.name);

            try {
              const result = await executeToolCall(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                supabase,
                userId,
                organizationId || null,
                token,
                (context?.temporalContext as Record<string, string> | undefined)?.timezone
              );

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
              });
            } catch (toolError) {
              const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
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

      return new Response(
        JSON.stringify({
          success: true,
          response: finalResponse,
          toolsUsed: [...new Set(toolsUsed)],
          iterations,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[copilot-autonomous] Error:', error);

    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
